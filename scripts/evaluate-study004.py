from copy import deepcopy
from pathlib import Path
import hashlib
import json
import re
import sys


STUDY_ID = "CD-WORKLOAD-20260829-004"
MODULE_ID = "CD004-CAL-ENRICHED-BIOGRAPHY-001"
CONTRACT_ID = "CD004-QC-1.0"
TARGET_ID = "CD004-ENRICHED-BIOGRAPHY-TARGET-1.0"
EVALUATOR_ID = "CD004-EVAL-1.0"

ROOT = Path.cwd()

QC_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-quality-contract.json"
TARGET_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json"
AUTHORITY_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json"
TASK_METADATA_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-task-metadata.json"
PROVIDER_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-provider.json"
EVALUATOR_FILE = ROOT / "scripts/evaluate-study004.py"


def fail(message):
    print("STUDY004_EVALUATOR_ERROR:", message)
    raise SystemExit(1)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize_key(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def normalize_text(value):
    text = str(value)
    text = text.replace("’", "'")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = text.lower()
    text = re.sub(r"[^a-z0-9:/#.@+]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def normalize_rights_text(value):
    text = normalize_text(value)
    text = re.sub(r"\bright\b|\brights\b", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def scalar_values(value):
    values = []

    if isinstance(value, dict):
        for nested in value.values():
            values.extend(scalar_values(nested))
    elif isinstance(value, list):
        for nested in value:
            values.extend(scalar_values(nested))
    elif value is not None:
        values.append(value)

    return values


def strings(value):
    return [item for item in scalar_values(value) if isinstance(item, str)]


def direct_values_for_aliases(obj, aliases):
    if not isinstance(obj, dict):
        return []

    accepted = {normalize_key(alias) for alias in aliases}
    return [
        value
        for key, value in obj.items()
        if normalize_key(key) in accepted
    ]


def recursive_values_for_aliases(value, aliases):
    accepted = {normalize_key(alias) for alias in aliases}
    values = []

    if isinstance(value, dict):
        for key, nested in value.items():
            if normalize_key(key) in accepted:
                values.append(nested)
            values.extend(recursive_values_for_aliases(nested, aliases))
    elif isinstance(value, list):
        for nested in value:
            values.extend(recursive_values_for_aliases(nested, aliases))

    return values


def equivalent_scalar(observed, expected):
    if isinstance(expected, bool):
        return isinstance(observed, bool) and observed is expected

    if isinstance(expected, (int, float)) and not isinstance(expected, bool):
        return observed == expected

    if isinstance(expected, str):
        observed_text = normalize_text(observed)
        expected_text = normalize_text(expected)

        if expected.startswith("http"):
            return observed_text.rstrip("/") == expected_text.rstrip("/")

        return observed_text == expected_text

    return observed == expected


def target_fact_result(candidate, target_key, expected, alias_map):
    aliases = alias_map.get(target_key, [target_key])
    containers = recursive_values_for_aliases(candidate, aliases)
    observed = []

    for container in containers:
        observed.extend(scalar_values(container))

    passed = any(equivalent_scalar(value, expected) for value in observed)

    return {
        "field": target_key,
        "expected": expected,
        "observed": observed,
        "pass": passed
    }


def flatten_target_facts(target):
    facts = []

    for key, value in target.items():
        if isinstance(value, dict):
            for nested_key, nested_value in value.items():
                facts.append((nested_key, nested_value))
        else:
            facts.append((key, value))

    return facts


def relationship_candidates(candidate, aliases):
    candidates = []

    for container in recursive_values_for_aliases(candidate, aliases):
        if isinstance(container, list):
            candidates.extend(item for item in container if isinstance(item, dict))
        elif isinstance(container, dict):
            candidates.extend(
                item for item in container.values() if isinstance(item, dict)
            )

    return candidates


def provenance_anchors(authority, relationship):
    source_by_id = {
        source["source_id"]: source
        for source in authority["sources"]
    }
    anchors = set(relationship["supporting_source_ids"])

    for source_id in relationship["supporting_source_ids"]:
        source = source_by_id[source_id]
        for value in strings(source):
            if value.startswith("http://") or value.startswith("https://"):
                anchors.add(value)

    return sorted(anchors)


def evaluate_subject(candidate, target_subject, qc):
    aliases = qc["candidate_graph_locations"]["subject_container_aliases"]
    subject_candidates = recursive_values_for_aliases(candidate, aliases)
    subject_candidates = [item for item in subject_candidates if isinstance(item, dict)]

    if not subject_candidates:
        subject_candidates = [candidate]

    alias_map = qc["target_field_aliases"]
    expected_main = target_subject["main_entity"]
    best = None

    for subject in subject_candidates:
        facts = []

        for key, expected in target_subject.items():
            if key == "main_entity":
                continue
            facts.append(target_fact_result(subject, key, expected, alias_map))

        main_aliases = alias_map["main_entity"]
        main_candidates = recursive_values_for_aliases(subject, main_aliases)
        main_candidates = [item for item in main_candidates if isinstance(item, dict)]

        main_best = []
        for main in main_candidates:
            main_results = [
                target_fact_result(main, key, expected, alias_map)
                for key, expected in expected_main.items()
            ]
            if sum(item["pass"] for item in main_results) > sum(
                item["pass"] for item in main_best
            ):
                main_best = main_results

        facts.extend(main_best)
        expected_count = len(target_subject) - 1 + len(expected_main)
        pass_count = sum(item["pass"] for item in facts)
        result = {
            "pass": pass_count == expected_count,
            "pass_count": pass_count,
            "fact_count": expected_count,
            "facts": facts
        }

        if best is None or result["pass_count"] > best["pass_count"]:
            best = result

    return best


def evaluate_relationships(candidate, target, authority, qc):
    locations = qc["candidate_graph_locations"]
    alias_map = qc["target_field_aliases"]
    candidates = relationship_candidates(
        candidate,
        locations["relationship_collection_aliases"]
    )
    coverage_by_name = {
        item["relationship"]: item
        for item in authority["relationship_coverage"]
    }
    results = []

    for expected in target["representation"]["relationships"]:
        expected_label = normalize_text(expected["relationship"])
        target_fact_map = dict(flatten_target_facts(expected["target"]))
        required_fields = qc["relationship_gate"][
            "required_target_fields_by_relationship"
        ][expected["relationship_id"]]
        expected_facts = [
            (field, target_fact_map[field])
            for field in required_fields
        ]
        anchors = provenance_anchors(
            authority,
            coverage_by_name[expected["relationship"]]
        )
        best = None

        for candidate_relationship in candidates:
            label_values = []
            for value in direct_values_for_aliases(
                candidate_relationship,
                locations["relationship_label_aliases"]
            ):
                label_values.extend(scalar_values(value))

            label_pass = any(
                normalize_text(value) == expected_label
                for value in label_values
            )

            target_values = direct_values_for_aliases(
                candidate_relationship,
                locations["target_container_aliases"]
            )
            target_candidates = [
                value for value in target_values if isinstance(value, dict)
            ]
            target_candidate = target_candidates[0] if target_candidates else candidate_relationship

            fact_results = [
                target_fact_result(target_candidate, key, value, alias_map)
                for key, value in expected_facts
            ]
            target_pass_count = sum(item["pass"] for item in fact_results)
            target_pass = target_pass_count == len(fact_results)

            provenance_values = []
            for value in direct_values_for_aliases(
                candidate_relationship,
                locations["provenance_container_aliases"]
            ):
                provenance_values.extend(strings(value))

            normalized_provenance = {normalize_text(value) for value in provenance_values}
            provenance_pass = any(
                normalize_text(anchor) in normalized_provenance
                for anchor in anchors
            )

            score = (
                int(label_pass)
                + target_pass_count
                + int(provenance_pass)
            )
            result = {
                "relationship_id": expected["relationship_id"],
                "relationship": expected["relationship"],
                "pass": bool(label_pass and target_pass and provenance_pass),
                "label_pass": label_pass,
                "target_pass": target_pass,
                "target_fact_pass_count": target_pass_count,
                "target_fact_count": len(fact_results),
                "target_facts": fact_results,
                "provenance_pass": provenance_pass,
                "accepted_provenance_anchors": anchors,
                "observed_provenance": provenance_values,
                "score": score
            }

            if best is None or result["score"] > best["score"]:
                best = result

        if best is None:
            best = {
                "relationship_id": expected["relationship_id"],
                "relationship": expected["relationship"],
                "pass": False,
                "label_pass": False,
                "target_pass": False,
                "target_fact_pass_count": 0,
                "target_fact_count": len(expected_facts),
                "target_facts": [],
                "provenance_pass": False,
                "accepted_provenance_anchors": anchors,
                "observed_provenance": [],
                "score": 0
            }

        best.pop("score", None)
        results.append(best)

    return {
        "pass": all(item["pass"] for item in results),
        "pass_count": sum(item["pass"] for item in results),
        "relationship_count": len(results),
        "candidate_relationship_object_count": len(candidates),
        "results": results
    }


def evaluate_rights(candidate, qc):
    locations = qc["candidate_graph_locations"]
    rules = qc["retrieval_rights_gate"]
    containers = recursive_values_for_aliases(
        candidate,
        locations["rights_container_aliases"]
    )
    if not containers:
        return {
            "pass": False,
            "container_present": False,
            "one_retrieval_pass": False,
            "excluded_rights_pass": False,
            "excluded_rights": {},
            "contradictory_multi_task_permission": False,
            "contradictory_Krights": False
        }

    combined = " ".join(strings(containers))
    normalized = normalize_rights_text(combined)
    one_retrieval_pass = any(
        normalize_rights_text(phrase) in normalized
        for phrase in rules["accepted_one_retrieval_phrases"]
    )
    excluded = {}

    for right in rules["required_excluded_rights"]:
        variants = rules["excluded_right_aliases"][right]
        excluded[right] = any(
            normalize_rights_text(variant) in normalized
            for variant in variants
        )

    multi_values = []
    for container in containers:
        multi_values.extend(
            recursive_values_for_aliases(
                container,
                ["multiTaskAmortizationAllowed", "multi_task_amortization_allowed"]
            )
        )
    contradictory_multi = any(value is True for value in scalar_values(multi_values))

    k_values = []
    for container in containers:
        k_values.extend(
            recursive_values_for_aliases(
                container,
                ["primaryEmpiricalKrights", "primary_empirical_Krights", "Krights"]
            )
        )
    scalar_k = scalar_values(k_values)
    contradictory_k = any(str(value) != "1" for value in scalar_k)
    excluded_pass = all(excluded.values())

    return {
        "pass": bool(
            one_retrieval_pass
            and excluded_pass
            and not contradictory_multi
            and not contradictory_k
        ),
        "container_present": True,
        "one_retrieval_pass": one_retrieval_pass,
        "excluded_rights_pass": excluded_pass,
        "excluded_rights": excluded,
        "contradictory_multi_task_permission": contradictory_multi,
        "contradictory_Krights": contradictory_k
    }


def evaluate_candidate(candidate, target, authority, qc):
    if not isinstance(candidate, dict):
        return {
            "primary_quality_gate_pass": False,
            "error": "Candidate output is not a JSON object."
        }

    subject = evaluate_subject(candidate, target["subject"], qc)
    relationships = evaluate_relationships(candidate, target, authority, qc)
    rights = evaluate_rights(candidate, qc)
    primary_pass = bool(subject["pass"] and relationships["pass"] and rights["pass"])

    return {
        "primary_quality_gate_pass": primary_pass,
        "subject": subject,
        "relationships": relationships,
        "retrieval_rights": rights
    }


for required in [
    QC_FILE,
    TARGET_FILE,
    AUTHORITY_FILE,
    TASK_METADATA_FILE,
    PROVIDER_FILE,
    EVALUATOR_FILE
]:
    if not required.exists():
        fail("Required frozen artifact missing: " + str(required.relative_to(ROOT)))

qc = read_json(QC_FILE)
target = read_json(TARGET_FILE)
authority = read_json(AUTHORITY_FILE)
task_metadata = read_json(TASK_METADATA_FILE)
provider = read_json(PROVIDER_FILE)

if qc.get("study_id") != STUDY_ID or qc.get("module_id") != MODULE_ID:
    fail("Quality Contract identity mismatch.")

if qc.get("contract_id") != CONTRACT_ID:
    fail("Quality Contract ID mismatch.")

if target.get("target_id") != TARGET_ID:
    fail("Target representation ID mismatch.")

if sha256(TARGET_FILE) != qc["target_representation"]["sha256"]:
    fail("Frozen target representation hash mismatch.")

if sha256(AUTHORITY_FILE) != qc["authority_package"]["sha256"]:
    fail("Frozen authority package hash mismatch.")

if provider.get("status") != "PROVIDER_CONFIGURATION_FROZEN_PRE_MEASUREMENT":
    fail("Provider configuration is not frozen.")

if task_metadata.get("status") != "TASK_AND_EVALUATOR_BOUNDARIES_FROZEN_PRE_MEASUREMENT":
    fail("Task metadata is not frozen.")

evaluator_entry = next(
    (
        item
        for item in task_metadata["evaluator_only_not_model_visible"]
        if item["role"] == "deterministic_evaluator"
    ),
    None
)

if evaluator_entry is None or evaluator_entry["sha256"] != sha256(EVALUATOR_FILE):
    fail("Frozen evaluator hash mismatch.")

expected_relationship_ids = [f"R{number:02d}" for number in range(1, 10)]
observed_relationship_ids = [
    item["relationship_id"]
    for item in target["representation"]["relationships"]
]

if observed_relationship_ids != expected_relationship_ids:
    fail("Target relationship IDs are not the frozen R01 through R09 sequence.")

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    canonical_candidate = {
        "subject": deepcopy(target["subject"]),
        "relationships": [
            {
                "relationship": item["relationship"],
                "target": deepcopy(item["target"]),
                "provenance": deepcopy(item["provenance_source_ids"])
            }
            for item in target["representation"]["relationships"]
        ],
        "retrievalRightsBoundary": deepcopy(target["retrieval_rights_boundary"])
    }
    canonical_candidate["retrievalRightsBoundary"]["conveyed"] = (
        "One endpoint-level retrieval of the identified Enriched Query result."
    )
    canonical_result = evaluate_candidate(canonical_candidate, target, authority, qc)

    missing_relationship_candidate = deepcopy(canonical_candidate)
    missing_relationship_candidate["relationships"] = (
        missing_relationship_candidate["relationships"][:-1]
    )
    missing_relationship_result = evaluate_candidate(
        missing_relationship_candidate,
        target,
        authority,
        qc
    )

    if canonical_result["primary_quality_gate_pass"] is not True:
        fail("Internal canonical-pass fixture failed.")

    if missing_relationship_result["primary_quality_gate_pass"] is not False:
        fail("Internal missing-relationship fixture was not rejected.")

    print("========================================")
    print("STUDY 004 QUALITY EVALUATOR PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("MODULE_ID:", MODULE_ID)
    print("CONTRACT_ID:", CONTRACT_ID)
    print("TARGET_ID:", TARGET_ID)
    print("EVALUATOR_ID:", EVALUATOR_ID)
    print("RELATIONSHIPS_REQUIRED:", len(expected_relationship_ids))
    print("CANONICAL_PASS_FIXTURE:", True)
    print("MISSING_RELATIONSHIP_REJECTED:", True)
    print("OBSERVATION_READ:", False)
    print("API_CALL_PERFORMED:", False)
    print("X402_PAYMENT_PERFORMED:", False)
    print("PREFLIGHT_PASS:", True)
    raise SystemExit(0)

if len(sys.argv) != 2 or not re.fullmatch(r"P[123]-\d{4}", sys.argv[1]):
    fail("Usage: python3 scripts/evaluate-study004.py --preflight OR P1-0001 OR P2-0001 OR P3-0001")

path_number = sys.argv[1]
observation_id = "CD-004-" + path_number
output_file = ROOT / "data/raw" / f"{observation_id}-output.json"
measurement_file = ROOT / "data/raw" / f"{observation_id}-measurement.json"
evaluation_file = ROOT / "data/raw" / f"{observation_id}-quality-evaluation.json"

if not output_file.exists():
    fail("Observation output file not found.")

if not measurement_file.exists():
    fail("Observation measurement file not found.")

if evaluation_file.exists():
    fail("Evaluation already exists. Refusing overwrite.")

output = read_json(output_file)
measurement = read_json(measurement_file)

if measurement.get("study_id") != STUDY_ID:
    fail("Measurement study ID mismatch.")

if measurement.get("observation_id") != observation_id:
    fail("Measurement observation ID mismatch.")

if measurement.get("quality", {}).get("contract_id") != CONTRACT_ID:
    fail("Measurement Quality Contract mismatch.")

if measurement.get("quality", {}).get("status") != "NOT_YET_EVALUATED":
    fail("Raw measurement is not in NOT_YET_EVALUATED state.")

result = evaluate_candidate(output, target, authority, qc)
primary_pass = result["primary_quality_gate_pass"]

evaluation = {
    "study_id": STUDY_ID,
    "module_id": MODULE_ID,
    "observation_id": observation_id,
    "path": path_number.split("-")[0],
    "evaluator_id": EVALUATOR_ID,
    "contract_id": CONTRACT_ID,
    "target_id": TARGET_ID,
    "status": "QUALITY_EVALUATION_COMPLETE",
    "target_sha256": sha256(TARGET_FILE),
    "evaluation_policy": qc["comparison_model"],
    "result": result,
    "primary_quality_gate_pass": primary_pass,
    "economic_comparison_permitted_for_this_observation": primary_pass,
    "raw_measurement_modified": False,
    "api_call_performed_by_evaluator": False,
    "x402_payment_performed_by_evaluator": False
}

evaluation_file.write_text(
    json.dumps(evaluation, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

print("========================================")
print("STUDY 004 QUALITY EVALUATION")
print("========================================")
print("OBSERVATION_ID:", observation_id)
print("EVALUATOR_ID:", EVALUATOR_ID)
print("SUBJECT_PASS:", result.get("subject", {}).get("pass", False))
print(
    "RELATIONSHIPS_PASS:",
    str(result.get("relationships", {}).get("pass_count", 0))
    + "/"
    + str(result.get("relationships", {}).get("relationship_count", 9))
)
print("RIGHTS_PASS:", result.get("retrieval_rights", {}).get("pass", False))
print("PRIMARY_QUALITY_GATE_PASS:", primary_pass)
print("ECONOMIC_COMPARISON_PERMITTED:", primary_pass)
print("RAW_MEASUREMENT_MODIFIED:", False)
print("API_CALL_PERFORMED:", False)
print("X402_PAYMENT_PERFORMED:", False)
print("EVALUATION_FILE:", evaluation_file.relative_to(ROOT))
