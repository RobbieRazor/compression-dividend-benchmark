from copy import deepcopy
from pathlib import Path
import hashlib
import json
import re
import sys


STUDY_ID = "CD-WORKLOAD-20260831-007"
MODULE_ID = "CD007-SOURCE-GROUNDED-ENRICHED-BIOGRAPHY-001"
CONTRACT_ID = "CD007-QC-1.0"
TARGET_ID = "CD005-ENRICHED-BIOGRAPHY-SCHEMA-TARGET-1.0"
EVALUATOR_ID = "CD007-STRICT-CANONICAL-EVAL-1.0"

ROOT = Path.cwd()

QC_FILE = ROOT / "data/CD-WORKLOAD-20260831-007-arm-a-quality-contract.json"
TARGET_FILE = ROOT / "data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json"
AUTHORITY_CONTROL_FILE = ROOT / "data/CD-WORKLOAD-20260830-006-authority-target-freeze.json"
PUBLIC_AUTHORITY_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json"
SCHEMA_FILE = ROOT / "data/CD-WORKLOAD-20260830-005-neutral-schema.json"
TASK_METADATA_FILE = ROOT / "data/CD-WORKLOAD-20260831-007-arm-a-task-metadata.json"
PROVIDER_FILE = ROOT / "data/CD-WORKLOAD-20260831-007-arm-a-provider.json"
EVALUATOR_FILE = ROOT / "scripts/evaluate-study007-arm-a.py"


def fail(message):
    print("STUDY007_ARM_A_EVALUATOR_ERROR:", message)
    raise SystemExit(1)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scalar_strings(value):
    values = []

    if isinstance(value, dict):
        for child in value.values():
            values.extend(scalar_strings(child))
    elif isinstance(value, list):
        for child in value:
            values.extend(scalar_strings(child))
    elif isinstance(value, str):
        values.append(value)

    return values


def exact_key_result(value, expected_keys):
    observed = sorted(value.keys()) if isinstance(value, dict) else []
    expected = sorted(expected_keys)

    return {
        "pass": isinstance(value, dict) and observed == expected,
        "expected": expected,
        "observed": observed,
        "missing": sorted(set(expected) - set(observed)),
        "extra": sorted(set(observed) - set(expected))
    }


def leaf_fact_results(observed, expected, prefix=""):
    results = []

    for key, expected_value in expected.items():
        path = f"{prefix}.{key}" if prefix else key
        observed_value = observed.get(key) if isinstance(observed, dict) else None

        if isinstance(expected_value, dict):
            results.extend(leaf_fact_results(observed_value, expected_value, path))
        else:
            results.append({
                "field": path,
                "expected": expected_value,
                "observed": observed_value,
                "pass": observed_value == expected_value
            })

    return results


def normalize_anchor(value):
    text = str(value).strip()
    if text.startswith("http://") or text.startswith("https://"):
        return text.rstrip("/")
    return text


def provenance_anchors(public_authority, expected_relationship):
    source_by_id = {
        source["source_id"]: source
        for source in public_authority["sources"]
    }
    anchors = set(expected_relationship["provenance"])

    for source_id in expected_relationship["provenance"]:
        source = source_by_id[source_id]
        for value in scalar_strings(source):
            if value.startswith("http://") or value.startswith("https://"):
                anchors.add(value)

    return sorted(anchors)


def evaluate_schema(candidate, schema, expected_target):
    root = exact_key_result(candidate, schema["required"])
    subject = candidate.get("subject") if isinstance(candidate, dict) else None
    subject_shape = exact_key_result(subject, schema["$defs"]["subject"]["required"])
    main_entity = subject.get("main_entity") if isinstance(subject, dict) else None
    main_entity_shape = exact_key_result(
        main_entity,
        schema["$defs"]["subject"]["properties"]["main_entity"]["required"]
    )

    relationships = candidate.get("relationships") if isinstance(candidate, dict) else None
    relationship_results = []
    expected_by_label = {
        item["relationship"]: item
        for item in expected_target["relationships"]
    }

    if isinstance(relationships, list):
        for index, relationship in enumerate(relationships):
            shell = exact_key_result(
                relationship,
                schema["$defs"]["relationship_shell"]["required"]
            )
            label = relationship.get("relationship") if isinstance(relationship, dict) else None
            expected = expected_by_label.get(label) if isinstance(label, str) else None
            expected_target_fields = list(expected["target"].keys()) if expected else []
            observed_target = relationship.get("target") if isinstance(relationship, dict) else None
            target_shape = exact_key_result(observed_target, expected_target_fields)
            provenance = relationship.get("provenance") if isinstance(relationship, dict) else None
            provenance_shape_pass = bool(
                isinstance(provenance, list)
                and len(provenance) > 0
                and all(isinstance(item, str) and item for item in provenance)
                and len(provenance) == len(set(provenance))
            )
            scalar_types_pass = bool(
                expected
                and isinstance(observed_target, dict)
                and all(
                    type(observed_target.get(field)) is type(expected_value)
                    for field, expected_value in expected["target"].items()
                )
            )

            relationship_results.append({
                "index": index,
                "relationship": label,
                "recognized_relationship": expected is not None,
                "shell": shell,
                "target_shape": target_shape,
                "provenance_shape_pass": provenance_shape_pass,
                "scalar_types_pass": scalar_types_pass,
                "pass": bool(
                    expected is not None
                    and shell["pass"]
                    and target_shape["pass"]
                    and provenance_shape_pass
                    and scalar_types_pass
                )
            })

    labels = [
        item.get("relationship")
        for item in relationships
        if isinstance(item, dict)
    ] if isinstance(relationships, list) else []
    labels_are_strings = all(isinstance(label, str) for label in labels)
    relationship_collection_pass = bool(
        isinstance(relationships, list)
        and len(relationships) == 9
        and len(labels) == 9
        and labels_are_strings
        and len(set(labels)) == 9
        and set(labels) == set(expected_by_label)
        and all(item["pass"] for item in relationship_results)
    )

    rights = candidate.get("retrieval_rights_boundary") if isinstance(candidate, dict) else None
    rights_shape = exact_key_result(
        rights,
        schema["$defs"]["retrieval_rights_boundary"]["required"]
    )
    rights_types_pass = bool(
        isinstance(rights, dict)
        and isinstance(rights.get("one_endpoint_retrieval"), str)
        and isinstance(rights.get("excluded_rights"), list)
        and len(rights.get("excluded_rights", [])) > 0
        and all(isinstance(item, str) and item for item in rights.get("excluded_rights", []))
        and len(rights.get("excluded_rights", [])) == len(set(rights.get("excluded_rights", [])))
        and type(rights.get("multi_task_reuse_authorized")) is bool
        and type(rights.get("amortization_authorized")) is bool
    )

    passed = bool(
        root["pass"]
        and subject_shape["pass"]
        and main_entity_shape["pass"]
        and relationship_collection_pass
        and rights_shape["pass"]
        and rights_types_pass
    )

    return {
        "pass": passed,
        "root": root,
        "subject": subject_shape,
        "main_entity": main_entity_shape,
        "relationship_collection_pass": relationship_collection_pass,
        "relationship_objects": relationship_results,
        "rights": rights_shape,
        "rights_types_pass": rights_types_pass
    }


def evaluate_subject(candidate, expected_subject):
    observed = candidate.get("subject") if isinstance(candidate, dict) else None
    facts = leaf_fact_results(observed, expected_subject, "subject")

    return {
        "pass": bool(facts and all(item["pass"] for item in facts)),
        "fact_pass_count": sum(item["pass"] for item in facts),
        "fact_count": len(facts),
        "facts": facts
    }


def evaluate_relationships(candidate, expected_target, public_authority):
    observed_relationships = candidate.get("relationships") if isinstance(candidate, dict) else None
    observed_relationships = observed_relationships if isinstance(observed_relationships, list) else []
    results = []

    for expected in expected_target["relationships"]:
        matches = [
            item
            for item in observed_relationships
            if isinstance(item, dict)
            and item.get("relationship") == expected["relationship"]
        ]

        if len(matches) != 1:
            results.append({
                "relationship": expected["relationship"],
                "pass": False,
                "match_count": len(matches),
                "target_pass": False,
                "target_fact_pass_count": 0,
                "target_fact_count": len(expected["target"]),
                "target_facts": [],
                "provenance_pass": False,
                "observed_provenance": []
            })
            continue

        observed = matches[0]
        facts = leaf_fact_results(observed.get("target"), expected["target"], "target")
        provenance = observed.get("provenance")
        provenance_values = provenance if isinstance(provenance, list) else []
        anchors = provenance_anchors(public_authority, expected)
        normalized_anchors = {normalize_anchor(value) for value in anchors}
        provenance_pass = bool(
            provenance_values
            and all(isinstance(value, str) for value in provenance_values)
            and any(normalize_anchor(value) in normalized_anchors for value in provenance_values)
        )
        target_pass = bool(facts and all(item["pass"] for item in facts))

        results.append({
            "relationship": expected["relationship"],
            "pass": bool(target_pass and provenance_pass),
            "match_count": 1,
            "target_pass": target_pass,
            "target_fact_pass_count": sum(item["pass"] for item in facts),
            "target_fact_count": len(facts),
            "target_facts": facts,
            "provenance_pass": provenance_pass,
            "accepted_provenance_anchors": anchors,
            "observed_provenance": provenance_values
        })

    return {
        "pass": all(item["pass"] for item in results),
        "pass_count": sum(item["pass"] for item in results),
        "relationship_count": len(results),
        "candidate_relationship_count": len(observed_relationships),
        "results": results
    }


def evaluate_rights(candidate, expected_rights):
    observed = candidate.get("retrieval_rights_boundary") if isinstance(candidate, dict) else None

    if not isinstance(observed, dict):
        return {
            "pass": False,
            "container_present": False,
            "one_endpoint_retrieval_pass": False,
            "excluded_rights_pass": False,
            "multi_task_reuse_pass": False,
            "amortization_pass": False
        }

    one_pass = observed.get("one_endpoint_retrieval") == expected_rights["one_endpoint_retrieval"]
    observed_excluded = observed.get("excluded_rights")
    excluded_pass = bool(
        isinstance(observed_excluded, list)
        and all(isinstance(item, str) for item in observed_excluded)
        and len(observed_excluded) == len(set(observed_excluded))
        and set(observed_excluded) == set(expected_rights["excluded_rights"])
    )
    multi_pass = observed.get("multi_task_reuse_authorized") is expected_rights["multi_task_reuse_authorized"]
    amortization_pass = observed.get("amortization_authorized") is expected_rights["amortization_authorized"]

    return {
        "pass": bool(one_pass and excluded_pass and multi_pass and amortization_pass),
        "container_present": True,
        "one_endpoint_retrieval_pass": one_pass,
        "excluded_rights_pass": excluded_pass,
        "multi_task_reuse_pass": multi_pass,
        "amortization_pass": amortization_pass
    }


def evaluate_candidate(candidate, target, public_authority, schema):
    if not isinstance(candidate, dict):
        return {
            "primary_quality_gate_pass": False,
            "error": "Candidate output is not a JSON object."
        }

    schema_result = evaluate_schema(candidate, schema, target)
    subject = evaluate_subject(candidate, target["subject"])
    relationships = evaluate_relationships(candidate, target, public_authority)
    rights = evaluate_rights(candidate, target["retrieval_rights_boundary"])
    primary_pass = bool(
        schema_result["pass"]
        and subject["pass"]
        and relationships["pass"]
        and rights["pass"]
    )

    return {
        "primary_quality_gate_pass": primary_pass,
        "schema": schema_result,
        "subject": subject,
        "relationships": relationships,
        "retrieval_rights": rights
    }


for required in [
    QC_FILE,
    TARGET_FILE,
    AUTHORITY_CONTROL_FILE,
    PUBLIC_AUTHORITY_FILE,
    SCHEMA_FILE,
    TASK_METADATA_FILE,
    PROVIDER_FILE,
    EVALUATOR_FILE
]:
    if not required.exists():
        fail("Required frozen artifact missing: " + str(required.relative_to(ROOT)))

qc = read_json(QC_FILE)
target_record = read_json(TARGET_FILE)
authority_control = read_json(AUTHORITY_CONTROL_FILE)
public_authority = read_json(PUBLIC_AUTHORITY_FILE)
schema = read_json(SCHEMA_FILE)
task_metadata = read_json(TASK_METADATA_FILE)
provider = read_json(PROVIDER_FILE)
target = target_record["target"]

if qc.get("study_id") != STUDY_ID or qc.get("module_id") != MODULE_ID:
    fail("Quality Contract identity mismatch.")

if qc.get("contract_id") != CONTRACT_ID:
    fail("Quality Contract ID mismatch.")

if target_record.get("target_id") != TARGET_ID:
    fail("Target representation ID mismatch.")

if sha256(TARGET_FILE) != qc["target_representation"]["sha256"]:
    fail("Frozen target representation hash mismatch.")

if sha256(AUTHORITY_CONTROL_FILE) != qc["authority_freeze"]["sha256"]:
    fail("Frozen authority-control hash mismatch.")

if sha256(SCHEMA_FILE) != qc["neutral_schema"]["sha256"]:
    fail("Frozen neutral-schema hash mismatch.")

if authority_control.get("status") != "EXACT_STUDY005_AUTHORITY_SCHEMA_AND_TARGET_REUSE_FROZEN":
    fail("Study 007 Arm A authority and target reuse is not frozen.")

if provider.get("status") != "PROVIDER_CONFIGURATION_FROZEN_PRE_MEASUREMENT":
    fail("Provider configuration is not frozen.")

if task_metadata.get("status") != "TASK_VISIBILITY_AND_EVALUATOR_BOUNDARIES_FROZEN_PRE_MEASUREMENT":
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

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    canonical_candidate = deepcopy(target)
    canonical_result = evaluate_candidate(canonical_candidate, target, public_authority, schema)

    missing_relationship_candidate = deepcopy(canonical_candidate)
    missing_relationship_candidate["relationships"] = missing_relationship_candidate["relationships"][:-1]
    missing_relationship_result = evaluate_candidate(
        missing_relationship_candidate,
        target,
        public_authority,
        schema
    )

    relocated_value_candidate = deepcopy(canonical_candidate)
    relocated_value = relocated_value_candidate["relationships"][0]["target"].pop("main_entity_name")
    relocated_value_candidate["relationships"][0]["main_entity_name"] = relocated_value
    relocated_value_result = evaluate_candidate(
        relocated_value_candidate,
        target,
        public_authority,
        schema
    )

    extra_field_candidate = deepcopy(canonical_candidate)
    extra_field_candidate["summary"] = "not schema-governed"
    extra_field_result = evaluate_candidate(
        extra_field_candidate,
        target,
        public_authority,
        schema
    )

    malformed_types_candidate = deepcopy(canonical_candidate)
    malformed_types_candidate["relationships"][0]["provenance"] = [
        {"source": "CD004-AUTH-S001"}
    ]
    malformed_types_candidate["retrieval_rights_boundary"]["excluded_rights"] = [
        {"right": "training"}
    ]
    malformed_types_result = evaluate_candidate(
        malformed_types_candidate,
        target,
        public_authority,
        schema
    )

    if canonical_result["primary_quality_gate_pass"] is not True:
        fail("Internal canonical-pass fixture failed.")

    if missing_relationship_result["primary_quality_gate_pass"] is not False:
        fail("Internal missing-relationship fixture was not rejected.")

    if relocated_value_result["primary_quality_gate_pass"] is not False:
        fail("Internal relocated-value fixture was not rejected.")

    if extra_field_result["primary_quality_gate_pass"] is not False:
        fail("Internal extra-field fixture was not rejected.")

    if malformed_types_result["primary_quality_gate_pass"] is not False:
        fail("Internal malformed-types fixture was not rejected.")

    print("========================================")
    print("STUDY 007 ARM A STRICT CANONICAL EVALUATOR PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("MODULE_ID:", MODULE_ID)
    print("CONTRACT_ID:", CONTRACT_ID)
    print("TARGET_ID:", TARGET_ID)
    print("EVALUATOR_ID:", EVALUATOR_ID)
    print("RELATIONSHIPS_REQUIRED:", len(target["relationships"]))
    print("TARGET_FIELDS_REQUIRED:", sum(len(item["target"]) for item in target["relationships"]))
    print("CANONICAL_PASS_FIXTURE:", True)
    print("MISSING_RELATIONSHIP_REJECTED:", True)
    print("RELOCATED_VALUE_REJECTED:", True)
    print("EXTRA_FIELD_REJECTED:", True)
    print("MALFORMED_TYPES_REJECTED:", True)
    print("OBSERVATION_READ:", False)
    print("API_CALL_PERFORMED:", False)
    print("X402_PAYMENT_PERFORMED:", False)
    print("PREFLIGHT_PASS:", True)
    raise SystemExit(0)

if len(sys.argv) != 2 or sys.argv[1] != "P1A-0001":
    fail("Usage: python3 scripts/evaluate-study007-arm-a-runtime-correction.py --preflight OR P1A-0001")

path_number = sys.argv[1]
observation_id = "CD-007-" + path_number
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

result = evaluate_candidate(output, target, public_authority, schema)
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
    "neutral_schema_sha256": sha256(SCHEMA_FILE),
    "evaluation_policy": qc["comparison_model"],
    "result": result,
    "primary_quality_gate_pass": primary_pass,
    "initial_feasibility_established": primary_pass,
    "stable_cost_calibration_established": False,
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
print("STUDY 007 ARM A STRICT CANONICAL QUALITY EVALUATION")
print("========================================")
print("OBSERVATION_ID:", observation_id)
print("EVALUATOR_ID:", EVALUATOR_ID)
print("SCHEMA_PASS:", result.get("schema", {}).get("pass", False))
print("SUBJECT_PASS:", result.get("subject", {}).get("pass", False))
print(
    "RELATIONSHIPS_PASS:",
    str(result.get("relationships", {}).get("pass_count", 0))
    + "/"
    + str(result.get("relationships", {}).get("relationship_count", 9))
)
print("RIGHTS_PASS:", result.get("retrieval_rights", {}).get("pass", False))
print("PRIMARY_QUALITY_GATE_PASS:", primary_pass)
print("INITIAL_FEASIBILITY_ESTABLISHED:", primary_pass)
print("STABLE_COST_CALIBRATION_ESTABLISHED:", False)
print("ECONOMIC_COMPARISON_PERMITTED:", primary_pass)
print("RAW_MEASUREMENT_MODIFIED:", False)
print("API_CALL_PERFORMED:", False)
print("X402_PAYMENT_PERFORMED:", False)
print("EVALUATION_FILE:", evaluation_file.relative_to(ROOT))
