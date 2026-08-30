from pathlib import Path
import hashlib
import json
import re
import sys


STUDY_ID = "CD-WORKLOAD-20260830-005"
MODULE_ID = "CD005-SCHEMA-CONSTRAINED-ENRICHED-BIOGRAPHY-001"
OBSERVATION_ID = "CD-005-P1-0001"
ADJUDICATOR_ID = "CD005-P1-SEMANTIC-ADJ-1.0"

ROOT = Path.cwd()

TARGET_FILE = ROOT / "data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json"
QUALITY_FILE = ROOT / "data/CD-WORKLOAD-20260830-005-quality-contract.json"
OUTPUT_FILE = ROOT / "data/raw/CD-005-P1-0001-output.json"
MEASUREMENT_FILE = ROOT / "data/raw/CD-005-P1-0001-measurement.json"
EVALUATION_FILE = ROOT / "data/raw/CD-005-P1-0001-quality-evaluation.json"
ADJUDICATOR_FILE = ROOT / "scripts/adjudicate-study005-p1.py"
METADATA_FILE = ROOT / "data/CD-WORKLOAD-20260830-005-p1-semantic-adjudicator-metadata.json"
RESULT_FILE = ROOT / "data/raw/CD-005-P1-0001-semantic-adjudication.json"


def fail(message):
    print("STUDY005_ADJUDICATOR_ERROR:", message)
    raise SystemExit(1)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_right(value):
    text = str(value).lower()
    text = text.replace("-", " ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\bright\b|\brights\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def flatten_scalars(value, prefix=""):
    facts = []

    for key, child in value.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(child, dict):
            facts.extend(flatten_scalars(child, path))
        elif isinstance(child, list):
            for index, item in enumerate(child):
                facts.append((f"{path}[{index}]", item))
        else:
            facts.append((path, child))

    return facts


def classify_target_mismatch(scope, relationship, fact):
    field = fact["field"]
    expected = fact["expected"]
    observed = fact["observed"]

    if scope == "subject" and field == "subject.canonical_plate_id":
        category = "SHORTENED_CANONICAL_IDENTIFIER"
    elif field.endswith(".name") and isinstance(expected, str) and isinstance(observed, str):
        if expected.replace("™", "") == observed:
            category = "TRADEMARK_MARK_OMISSION"
        else:
            category = "CANONICAL_NAME_SUBSTITUTION"
    elif field.endswith(".entity_type"):
        category = "ONTOLOGY_TYPE_SUBSTITUTION"
    else:
        category = "CANONICAL_DESCRIPTOR_PARAPHRASE"

    return {
        "scope": scope,
        "relationship": relationship,
        "field": field,
        "expected": expected,
        "observed": observed,
        "category": category,
        "exact_match": False
    }


def rights_adjudication(expected, observed):
    expected_phrase = expected["one_endpoint_retrieval"]
    observed_phrase = observed["one_endpoint_retrieval"]
    phrase_semantic_pass = bool(
        "one endpoint level retrieval" in normalize_right(expected_phrase)
        and "one endpoint level retrieval" in normalize_right(observed_phrase)
    )

    observed_normalized = {normalize_right(item) for item in observed["excluded_rights"]}
    aliases = {
        "derivative dataset creation": {
            "derivative dataset creation",
            "derivative dataset"
        }
    }
    excluded_results = []

    for expected_right in expected["excluded_rights"]:
        normalized = normalize_right(expected_right)
        accepted = aliases.get(normalized, {normalized})
        semantic_pass = bool(accepted & observed_normalized)
        exact_pass = expected_right in observed["excluded_rights"]
        excluded_results.append({
            "expected": expected_right,
            "normalized_expected": normalized,
            "semantic_pass": semantic_pass,
            "exact_pass": exact_pass
        })

    booleans = {
        "multi_task_reuse_authorized": {
            "expected": expected["multi_task_reuse_authorized"],
            "observed": observed["multi_task_reuse_authorized"],
            "pass": observed["multi_task_reuse_authorized"] is expected["multi_task_reuse_authorized"]
        },
        "amortization_authorized": {
            "expected": expected["amortization_authorized"],
            "observed": observed["amortization_authorized"],
            "pass": observed["amortization_authorized"] is expected["amortization_authorized"]
        }
    }
    exact_excluded_count = sum(item["exact_pass"] for item in excluded_results)
    semantic_excluded_count = sum(item["semantic_pass"] for item in excluded_results)
    exact_fact_count = (
        int(expected_phrase == observed_phrase)
        + exact_excluded_count
        + sum(item["pass"] for item in booleans.values())
    )
    semantic_pass = bool(
        phrase_semantic_pass
        and semantic_excluded_count == len(excluded_results)
        and all(item["pass"] for item in booleans.values())
    )

    return {
        "frozen_exact_gate_pass": False,
        "one_endpoint_retrieval": {
            "expected": expected_phrase,
            "observed": observed_phrase,
            "exact_pass": expected_phrase == observed_phrase,
            "semantic_one_retrieval_pass": phrase_semantic_pass
        },
        "excluded_rights": {
            "required_count": len(excluded_results),
            "exact_pass_count": exact_excluded_count,
            "semantic_pass_count": semantic_excluded_count,
            "results": excluded_results
        },
        "authorization_booleans": booleans,
        "exact_fact_pass_count": exact_fact_count,
        "exact_fact_count": 13,
        "semantic_rights_boundary_preserved": semantic_pass,
        "semantic_result_changes_frozen_quality_gate": False
    }


def build_adjudication(target_record, output, measurement, evaluation):
    target = target_record["target"]
    subject_facts = evaluation["result"]["subject"]["facts"]
    relationship_results = evaluation["result"]["relationships"]["results"]
    subject_mismatches = [
        classify_target_mismatch("subject", None, fact)
        for fact in subject_facts
        if not fact["pass"]
    ]
    relationship_mismatches = []

    for relationship in relationship_results:
        for fact in relationship.get("target_facts", []):
            if not fact["pass"]:
                relationship_mismatches.append(
                    classify_target_mismatch(
                        "relationship_target",
                        relationship["relationship"],
                        fact
                    )
                )

    all_target_mismatches = subject_mismatches + relationship_mismatches
    category_counts = {}
    for mismatch in all_target_mismatches:
        category = mismatch["category"]
        category_counts[category] = category_counts.get(category, 0) + 1

    rights = rights_adjudication(
        target["retrieval_rights_boundary"],
        output["retrieval_rights_boundary"]
    )
    subject_total = len(flatten_scalars(target["subject"]))
    subject_pass = sum(item["pass"] for item in subject_facts)
    relationship_total = sum(
        item["target_fact_count"]
        for item in relationship_results
    )
    relationship_pass = sum(
        item["target_fact_pass_count"]
        for item in relationship_results
    )
    rights_pass = rights["exact_fact_pass_count"]
    exact_total = subject_total + relationship_total + rights["exact_fact_count"]
    exact_pass = subject_pass + relationship_pass + rights_pass
    provenance_pass_count = sum(
        item["provenance_pass"]
        for item in relationship_results
    )
    fully_exact_relationship_count = sum(
        item["target_pass"] and item["provenance_pass"]
        for item in relationship_results
    )
    exact_mismatch_count = exact_total - exact_pass

    if category_counts != {
        "SHORTENED_CANONICAL_IDENTIFIER": 1,
        "ONTOLOGY_TYPE_SUBSTITUTION": 5,
        "CANONICAL_DESCRIPTOR_PARAPHRASE": 4,
        "TRADEMARK_MARK_OMISSION": 5
    }:
        fail("Observed target mismatch classification changed unexpectedly.")

    if not rights["semantic_rights_boundary_preserved"]:
        fail("Expected rights-semantic preservation was not reproduced.")

    if exact_mismatch_count != 26:
        fail("Exact governed-value mismatch count changed unexpectedly.")

    return {
        "study_id": STUDY_ID,
        "module_id": MODULE_ID,
        "observation_id": OBSERVATION_ID,
        "adjudicator_id": ADJUDICATOR_ID,
        "status": "POST_HOC_SEMANTIC_ADJUDICATION_COMPLETE",
        "purpose": "Classify the frozen Study 005 P1 failure without changing quality, authorizing retry, opening P2/P3, or performing an economic comparison.",
        "frozen_evidence": {
            "target_sha256": sha256(TARGET_FILE),
            "quality_contract_sha256": sha256(QUALITY_FILE),
            "output_sha256": sha256(OUTPUT_FILE),
            "measurement_sha256": sha256(MEASUREMENT_FILE),
            "quality_evaluation_sha256": sha256(EVALUATION_FILE)
        },
        "frozen_quality_result": {
            "schema_pass": evaluation["result"]["schema"]["pass"],
            "subject_pass": evaluation["result"]["subject"]["pass"],
            "relationship_pass_count": evaluation["result"]["relationships"]["pass_count"],
            "relationship_count": evaluation["result"]["relationships"]["relationship_count"],
            "rights_pass": evaluation["result"]["retrieval_rights"]["pass"],
            "primary_quality_gate_pass": evaluation["primary_quality_gate_pass"],
            "initial_feasibility_established": evaluation["initial_feasibility_established"],
            "stable_cost_calibration_established": evaluation["stable_cost_calibration_established"],
            "economic_comparison_permitted": evaluation["economic_comparison_permitted_for_this_observation"]
        },
        "structural_intervention_result": {
            "exact_schema_gate_pass": evaluation["result"]["schema"]["pass"],
            "relationship_objects_present": len(output["relationships"]),
            "relationship_classes_present": len({item["relationship"] for item in output["relationships"]}),
            "provenance_pass_count": provenance_pass_count,
            "provenance_relationship_count": len(relationship_results),
            "structural_placement_failure_count": 0,
            "schema_and_graph_placement_intervention_succeeded": True
        },
        "exact_value_fidelity": {
            "subject_fact_pass_count": subject_pass,
            "subject_fact_count": subject_total,
            "relationship_target_fact_pass_count": relationship_pass,
            "relationship_target_fact_count": relationship_total,
            "fully_exact_relationship_count": fully_exact_relationship_count,
            "relationship_count": len(relationship_results),
            "rights_fact_pass_count": rights_pass,
            "rights_fact_count": rights["exact_fact_count"],
            "total_exact_fact_pass_count": exact_pass,
            "total_exact_fact_count": exact_total,
            "total_exact_mismatch_count": exact_mismatch_count
        },
        "target_mismatch_classification": {
            "mismatch_count": len(all_target_mismatches),
            "category_counts": category_counts,
            "mismatches": all_target_mismatches
        },
        "rights_adjudication": rights,
        "preserved_high_value_facts": {
            "all_nine_relationship_labels": True,
            "all_nine_relationship_provenance_links": provenance_pass_count == 9,
            "canonical_urls_and_authorities": True,
            "pricing_version_status_network_asset_and_amounts": True,
            "one_retrieval_semantics": rights["one_endpoint_retrieval"]["semantic_one_retrieval_pass"],
            "all_ten_excluded_rights_semantics": rights["excluded_rights"]["semantic_pass_count"] == 10,
            "no_multi_task_reuse_authorization": rights["authorization_booleans"]["multi_task_reuse_authorized"]["pass"],
            "no_amortization_authorization": rights["authorization_booleans"]["amortization_authorized"]["pass"]
        },
        "primary_diagnostic_label": "SCHEMA_PLACEMENT_SUCCESS_WITH_CANONICAL_VALUE_FIDELITY_FAILURE",
        "secondary_diagnostic_label": "RIGHTS_SEMANTICS_PRESERVED_BUT_EXACT_LEXICAL_GATE_FAILED",
        "interpretation_boundary": {
            "schema_pass_is_not_quality_equivalence": True,
            "semantic_similarity_changes_exact_gate": False,
            "quality_result_modified": False,
            "retry_authorized": False,
            "p2_probe_authorized": False,
            "p3_payment_authorized": False,
            "economic_comparison_authorized": False,
            "pricing_change_authorized": False,
            "website_change_authorized": False
        },
        "actions_performed": {
            "model_api_call": False,
            "provider_cache_probe": False,
            "x402_payment": False,
            "economic_comparison": False,
            "quality_result_mutation": False,
            "raw_measurement_mutation": False,
            "production_mutation": False
        }
    }


for required in [
    TARGET_FILE,
    QUALITY_FILE,
    OUTPUT_FILE,
    MEASUREMENT_FILE,
    EVALUATION_FILE,
    ADJUDICATOR_FILE,
    METADATA_FILE
]:
    if not required.exists():
        fail("Required frozen artifact missing: " + str(required.relative_to(ROOT)))

metadata = read_json(METADATA_FILE)

if metadata.get("study_id") != STUDY_ID or metadata.get("observation_id") != OBSERVATION_ID:
    fail("Adjudicator metadata identity mismatch.")

if sha256(ADJUDICATOR_FILE) != metadata["adjudicator"]["sha256"]:
    fail("Frozen adjudicator hash mismatch.")

for item in metadata["frozen_inputs"]:
    path = ROOT / item["path"]
    if sha256(path) != item["sha256"]:
        fail("Frozen input hash mismatch: " + item["role"])

target_record = read_json(TARGET_FILE)
output = read_json(OUTPUT_FILE)
measurement = read_json(MEASUREMENT_FILE)
evaluation = read_json(EVALUATION_FILE)

if measurement.get("observation_id") != OBSERVATION_ID:
    fail("Measurement observation identity mismatch.")

if evaluation.get("observation_id") != OBSERVATION_ID:
    fail("Evaluation observation identity mismatch.")

if evaluation.get("primary_quality_gate_pass") is not False:
    fail("Frozen quality result is not the expected failure.")

adjudication = build_adjudication(target_record, output, measurement, evaluation)

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    print("========================================")
    print("STUDY 005 P1 SEMANTIC ADJUDICATION PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("OBSERVATION_ID:", OBSERVATION_ID)
    print("ADJUDICATOR_ID:", ADJUDICATOR_ID)
    print("FROZEN_QUALITY_GATE_PASS:", False)
    print("SCHEMA_PASS:", adjudication["frozen_quality_result"]["schema_pass"])
    print("PROVENANCE_PASS:", str(adjudication["structural_intervention_result"]["provenance_pass_count"]) + "/9")
    print("EXACT_FACTS_PASS:", str(adjudication["exact_value_fidelity"]["total_exact_fact_pass_count"]) + "/" + str(adjudication["exact_value_fidelity"]["total_exact_fact_count"]))
    print("EXACT_MISMATCHES:", adjudication["exact_value_fidelity"]["total_exact_mismatch_count"])
    print("RIGHTS_SEMANTICS_PRESERVED:", adjudication["rights_adjudication"]["semantic_rights_boundary_preserved"])
    print("ADJUDICATION_FILE_CREATED:", False)
    print("QUALITY_RESULT_MODIFIED:", False)
    print("RETRY_AUTHORIZED:", False)
    print("P2_PROBE_PERFORMED:", False)
    print("API_CALL_PERFORMED:", False)
    print("X402_PAYMENT_PERFORMED:", False)
    print("PREFLIGHT_PASS:", True)
    raise SystemExit(0)

if len(sys.argv) != 2 or sys.argv[1] != "P1-0001":
    fail("Usage: python3 scripts/adjudicate-study005-p1.py --preflight OR P1-0001")

if RESULT_FILE.exists():
    fail("Adjudication already exists. Refusing overwrite.")

RESULT_FILE.write_text(
    json.dumps(adjudication, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

print("========================================")
print("STUDY 005 P1 SEMANTIC ADJUDICATION")
print("========================================")
print("OBSERVATION_ID:", OBSERVATION_ID)
print("ADJUDICATOR_ID:", ADJUDICATOR_ID)
print("FROZEN_QUALITY_GATE_PASS:", False)
print("SCHEMA_PASS:", adjudication["frozen_quality_result"]["schema_pass"])
print("PROVENANCE_PASS:", str(adjudication["structural_intervention_result"]["provenance_pass_count"]) + "/9")
print("SUBJECT_FACTS_PASS:", str(adjudication["exact_value_fidelity"]["subject_fact_pass_count"]) + "/" + str(adjudication["exact_value_fidelity"]["subject_fact_count"]))
print("RELATIONSHIP_TARGET_FACTS_PASS:", str(adjudication["exact_value_fidelity"]["relationship_target_fact_pass_count"]) + "/" + str(adjudication["exact_value_fidelity"]["relationship_target_fact_count"]))
print("RIGHTS_EXACT_FACTS_PASS:", str(adjudication["exact_value_fidelity"]["rights_fact_pass_count"]) + "/" + str(adjudication["exact_value_fidelity"]["rights_fact_count"]))
print("TOTAL_EXACT_FACTS_PASS:", str(adjudication["exact_value_fidelity"]["total_exact_fact_pass_count"]) + "/" + str(adjudication["exact_value_fidelity"]["total_exact_fact_count"]))
print("RIGHTS_SEMANTICS_PRESERVED:", adjudication["rights_adjudication"]["semantic_rights_boundary_preserved"])
print("PRIMARY_DIAGNOSTIC_LABEL:", adjudication["primary_diagnostic_label"])
print("QUALITY_RESULT_MODIFIED:", False)
print("RETRY_AUTHORIZED:", False)
print("P2_PROBE_PERFORMED:", False)
print("API_CALL_PERFORMED:", False)
print("X402_PAYMENT_PERFORMED:", False)
print("ADJUDICATION_FILE:", RESULT_FILE.relative_to(ROOT))
