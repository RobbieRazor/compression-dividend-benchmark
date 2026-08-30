from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import re
import sys


STUDY_ID = "CD-WORKLOAD-20260829-004"
MODULE_ID = "CD004-CAL-ENRICHED-BIOGRAPHY-001"
ADJUDICATOR_ID = "CD004-P1-STRUCTURAL-ADJ-1.0"
OBSERVATION_ID = "CD-004-P1-0001"

ROOT = Path.cwd()
SCRIPT_FILE = ROOT / "scripts/adjudicate-study004-p1.py"
METADATA_FILE = (
    ROOT / "data/CD-WORKLOAD-20260829-004-p1-structural-adjudicator.json"
)
TARGET_FILE = (
    ROOT
    / "data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json"
)
AUTHORITY_FILE = (
    ROOT
    / "data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json"
)
INHERITED_AUTHORITY_FILE = (
    ROOT / "data/CD-WORKLOAD-20260829-002-public-authority-sources.json"
)
QUALITY_FILE = ROOT / "data/CD-WORKLOAD-20260829-004-quality-contract.json"
TASK_FILE = ROOT / "prompts/CD-WORKLOAD-20260829-004-neutral-task.txt"
MEASUREMENT_FILE = ROOT / "data/raw/CD-004-P1-0001-measurement.json"
OUTPUT_FILE = ROOT / "data/raw/CD-004-P1-0001-output.json"
EVALUATION_FILE = ROOT / "data/raw/CD-004-P1-0001-quality-evaluation.json"
ADJUDICATION_FILE = (
    ROOT / "data/raw/CD-004-P1-0001-structural-adjudication.json"
)


def fail(message):
    print("STUDY004_P1_ADJUDICATION_ERROR:", message)
    raise SystemExit(1)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def relative(path):
    return str(path.relative_to(ROOT))


def walk_scalars(value, path=""):
    rows = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else key
            rows.extend(walk_scalars(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = f"{path}[{index}]" if path else f"[{index}]"
            rows.extend(walk_scalars(child, child_path))
    else:
        rows.append({"path": path, "value": value})

    return rows


def exact_locations(value, expected, path=""):
    return [
        row["path"]
        for row in walk_scalars(value, path)
        if type(row["value"]) is type(expected) and row["value"] == expected
    ]


def authority_locations(authority_packages, expected):
    locations = []

    for artifact_path, package in authority_packages:
        for index, source in enumerate(package.get("sources", [])):
            source_id = source.get("source_id") or source.get("role") or str(index)
            for row in walk_scalars(source, f"sources[{index}]"):
                if (
                    type(row["value"]) is type(expected)
                    and row["value"] == expected
                ):
                    locations.append(
                        {
                            "artifact": relative(artifact_path),
                            "source_id": source_id,
                            "path": row["path"]
                        }
                    )

    return locations


def relationship_target(output, relationship_name):
    for index, relationship in enumerate(output.get("relationships", [])):
        if relationship.get("relationship") == relationship_name:
            return relationship.get("target", {}), f"relationships[{index}].target"

    return {}, "relationships[missing].target"


def build_failed_criteria(target, output, evaluation):
    result = evaluation["result"]
    subject_target = target["subject"]
    subject_output = output.get("subject", {})
    subject_facts = result["subject"].get("facts", [])
    top_fields = [field for field in subject_target if field != "main_entity"]

    if [item.get("field") for item in subject_facts[: len(top_fields)]] != top_fields:
        fail("Frozen subject evaluation fact order is unexpected.")

    criteria = []

    for item in subject_facts[: len(top_fields)]:
        if item["pass"]:
            continue

        criteria.append(
            {
                "criterion_id": "SUBJECT." + item["field"],
                "scope": "subject",
                "field": item["field"],
                "expected": item["expected"],
                "evaluator_observed": item["observed"],
                "local_value": subject_output,
                "local_path": "subject"
            }
        )

    main_target = subject_target["main_entity"]
    main_facts = subject_facts[len(top_fields) :]
    main_by_field = {item["field"]: item for item in main_facts}

    for field, expected in main_target.items():
        item = main_by_field.get(field)
        if item is not None and item["pass"]:
            continue

        criteria.append(
            {
                "criterion_id": "SUBJECT.main_entity." + field,
                "scope": "subject.main_entity",
                "field": field,
                "expected": expected,
                "evaluator_observed": item["observed"] if item else [],
                "local_value": subject_output,
                "local_path": "subject"
            }
        )

    for relationship in result["relationships"]["results"]:
        if relationship["pass"]:
            continue

        if not relationship["label_pass"] or not relationship["provenance_pass"]:
            fail(
                "This adjudicator is scoped to target-structure failures, but "
                + relationship["relationship_id"]
                + " has a label or provenance failure."
            )

        local_value, local_path = relationship_target(
            output,
            relationship["relationship"]
        )

        for item in relationship["target_facts"]:
            if item["pass"]:
                continue

            criteria.append(
                {
                    "criterion_id": (
                        relationship["relationship_id"]
                        + ".target."
                        + item["field"]
                    ),
                    "scope": relationship["relationship"],
                    "field": item["field"],
                    "expected": item["expected"],
                    "evaluator_observed": item["observed"],
                    "local_value": local_value,
                    "local_path": local_path
                }
            )

    return criteria


def classify_criterion(criterion, output, authority_packages):
    expected = criterion["expected"]
    global_locations = exact_locations(output, expected)
    local_locations = exact_locations(
        criterion["local_value"],
        expected,
        criterion["local_path"]
    )
    source_locations = authority_locations(authority_packages, expected)

    if local_locations:
        classification = "EXACT_VALUE_LOCAL_BUT_CONTRACT_LOCATION_OR_ALIAS_FAILED"
    elif global_locations:
        classification = "EXACT_VALUE_RELOCATED_ELSEWHERE_IN_OUTPUT"
    else:
        classification = "EXACT_VALUE_ABSENT_FROM_OUTPUT"

        if isinstance(expected, str) and any(
            isinstance(observed, str)
            and observed
            and expected.endswith(observed)
            for observed in criterion["evaluator_observed"]
        ):
            classification = "EXACT_VALUE_ABSENT_SUFFIX_ONLY_IDENTIFIER_OBSERVED"

    return {
        "criterion_id": criterion["criterion_id"],
        "scope": criterion["scope"],
        "field": criterion["field"],
        "expected": expected,
        "evaluator_observed": criterion["evaluator_observed"],
        "evaluator_pass": False,
        "exact_output_locations": global_locations,
        "exact_local_scope_locations": local_locations,
        "exact_model_visible_authority_locations": source_locations,
        "exact_value_present_anywhere_in_output": bool(global_locations),
        "exact_value_present_in_local_scope": bool(local_locations),
        "exact_expected_value_present_in_model_visible_authority": bool(
            source_locations
        ),
        "classification": classification
    }


def load_and_validate():
    required = [
        SCRIPT_FILE,
        METADATA_FILE,
        TARGET_FILE,
        AUTHORITY_FILE,
        INHERITED_AUTHORITY_FILE,
        QUALITY_FILE,
        TASK_FILE,
        MEASUREMENT_FILE,
        OUTPUT_FILE,
        EVALUATION_FILE
    ]

    for path in required:
        if not path.exists():
            fail("Required artifact missing: " + relative(path))

    metadata = read_json(METADATA_FILE)

    if metadata.get("study_id") != STUDY_ID:
        fail("Adjudicator metadata study ID mismatch.")

    if metadata.get("module_id") != MODULE_ID:
        fail("Adjudicator metadata module ID mismatch.")

    if metadata.get("adjudicator", {}).get("sha256") != sha256(SCRIPT_FILE):
        fail("Adjudicator script hash mismatch.")

    for artifact in metadata.get("frozen_inputs", []):
        path = ROOT / artifact["path"]
        if not path.exists() or sha256(path) != artifact["sha256"]:
            fail("Frozen adjudication input mismatch: " + artifact["path"])

    target = read_json(TARGET_FILE)
    authority = read_json(AUTHORITY_FILE)
    inherited_authority = read_json(INHERITED_AUTHORITY_FILE)
    output = read_json(OUTPUT_FILE)
    evaluation = read_json(EVALUATION_FILE)
    measurement = read_json(MEASUREMENT_FILE)
    task_text = TASK_FILE.read_text(encoding="utf-8")

    for artifact_name, artifact in [
        ("target", target),
        ("authority", authority),
        ("evaluation", evaluation),
        ("measurement", measurement)
    ]:
        if artifact.get("study_id") != STUDY_ID:
            fail(artifact_name + " study ID mismatch.")

    if evaluation.get("observation_id") != OBSERVATION_ID:
        fail("Quality evaluation observation mismatch.")

    if evaluation.get("primary_quality_gate_pass") is not False:
        fail("Structural adjudication requires a frozen failed evaluation.")

    if evaluation.get("raw_measurement_modified") is not False:
        fail("Frozen evaluation does not preserve the raw measurement.")

    if measurement.get("measurement_valid_for_p1") is not True:
        fail("P1 measurement is not valid for structural adjudication.")

    if output.get("relationships") is None:
        fail("P1 output relationship graph is missing.")

    return {
        "metadata": metadata,
        "target": target,
        "authority": authority,
        "inherited_authority": inherited_authority,
        "output": output,
        "evaluation": evaluation,
        "measurement": measurement,
        "task_text": task_text
    }


def analyze(loaded):
    criteria = build_failed_criteria(
        loaded["target"],
        loaded["output"],
        loaded["evaluation"]
    )
    authority_packages = [
        (AUTHORITY_FILE, loaded["authority"]),
        (INHERITED_AUTHORITY_FILE, loaded["inherited_authority"])
    ]
    results = [
        classify_criterion(criterion, loaded["output"], authority_packages)
        for criterion in criteria
    ]

    exact_output_count = sum(
        item["exact_value_present_anywhere_in_output"] for item in results
    )
    local_count = sum(
        item["classification"]
        == "EXACT_VALUE_LOCAL_BUT_CONTRACT_LOCATION_OR_ALIAS_FAILED"
        for item in results
    )
    relocated_count = sum(
        item["classification"]
        == "EXACT_VALUE_RELOCATED_ELSEWHERE_IN_OUTPUT"
        for item in results
    )
    absent_count = len(results) - exact_output_count
    authority_count = sum(
        item["exact_expected_value_present_in_model_visible_authority"]
        for item in results
    )

    if len(results) != 9:
        fail("Expected exactly nine failed contract criteria.")

    expected_counts = loaded["metadata"]["frozen_post_hoc_expectations"]
    observed_counts = {
        "failed_contract_criterion_count": len(results),
        "exact_value_present_anywhere_in_output_count": exact_output_count,
        "exact_value_local_but_contract_location_or_alias_failed_count": local_count,
        "exact_value_relocated_elsewhere_in_output_count": relocated_count,
        "exact_value_absent_from_output_count": absent_count,
        "exact_expected_value_present_in_model_visible_authority_count": authority_count
    }

    if observed_counts != expected_counts:
        fail("Observed adjudication counts do not match the frozen expectations.")

    return results, observed_counts


def self_test():
    fixture = {
        "subject": {
            "public_entity_type": "ProfilePage",
            "identifier": "plate-short"
        }
    }
    local = exact_locations(fixture["subject"], "ProfilePage", "subject")
    global_locations = exact_locations(fixture, "ProfilePage")

    if local != ["subject.public_entity_type"]:
        fail("Self-test local exact-location classification failed.")

    if global_locations != ["subject.public_entity_type"]:
        fail("Self-test global exact-location classification failed.")

    if exact_locations(fixture, "plate-long"):
        fail("Self-test absent-value classification failed.")

    print("STUDY004_P1_ADJUDICATOR_SELF_TEST_PASS: true")
    print("API_CALL_PERFORMED: false")
    print("X402_PAYMENT_PERFORMED: false")


def preflight(loaded):
    results, counts = analyze(loaded)

    print("========================================")
    print("STUDY 004 P1 STRUCTURAL ADJUDICATION PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("OBSERVATION_ID:", OBSERVATION_ID)
    print("ADJUDICATOR_ID:", ADJUDICATOR_ID)
    print("POST_HOC_DIAGNOSTIC:", True)
    print("FROZEN_QUALITY_GATE_PASS:", False)
    print("FAILED_CONTRACT_CRITERIA:", len(results))
    print("EXACT_VALUES_PRESENT_IN_OUTPUT:", counts[
        "exact_value_present_anywhere_in_output_count"
    ])
    print("MODEL_VISIBLE_AUTHORITY_SUPPORT:", counts[
        "exact_expected_value_present_in_model_visible_authority_count"
    ])
    print("ADJUDICATION_FILE_CREATED:", False)
    print("QUALITY_RESULT_MODIFIED:", False)
    print("P2_PROBE_PERFORMED:", False)
    print("API_CALL_PERFORMED:", False)
    print("X402_PAYMENT_PERFORMED:", False)
    print("PREFLIGHT_PASS:", True)


def write_adjudication(loaded):
    if ADJUDICATION_FILE.exists():
        fail("Adjudication already exists. Refusing overwrite.")

    results, counts = analyze(loaded)
    task_text = loaded["task_text"]

    adjudication = {
        "study_id": STUDY_ID,
        "module_id": MODULE_ID,
        "observation_id": OBSERVATION_ID,
        "adjudicator_id": ADJUDICATOR_ID,
        "status": "POST_HOC_STRUCTURAL_ADJUDICATION_COMPLETE",
        "created_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "design_timing": {
            "post_hoc": True,
            "designed_after_observation_and_frozen_evaluation": True,
            "adjudicator_frozen_before_execution": True
        },
        "frozen_quality_result": {
            "primary_quality_gate_pass": False,
            "quality_evaluation_file": relative(EVALUATION_FILE),
            "quality_evaluation_sha256": sha256(EVALUATION_FILE),
            "quality_result_modified": False,
            "economic_comparison_permitted": False
        },
        "diagnostic_question": (
            "Were the nine failed contract criteria unsupported by the "
            "model-visible authority, absent from the reconstruction, or "
            "preserved under nonaccepted aliases or locations?"
        ),
        "task_specificity": {
            "requires_identifier_preservation": bool(
                re.search(r"preserve explicit identifiers", task_text, re.I)
            ),
            "requires_machine_readable_facts": (
                "machine-readable" in task_text.lower()
            ),
            "requires_nine_separate_relationships": (
                "nine relationships" in task_text.lower()
            )
        },
        "summary_counts": counts,
        "failed_criterion_results": results,
        "primary_diagnostic_label": (
            "STRUCTURAL_FIDELITY_FAILURE_WITH_SINGLE_EXACT_IDENTIFIER_LOSS"
        ),
        "interpretation": {
            "all_failed_expectations_supported_by_model_visible_authority": (
                counts[
                    "exact_expected_value_present_in_model_visible_authority_count"
                ]
                == counts["failed_contract_criterion_count"]
            ),
            "most_failed_values_preserved_somewhere_in_output": (
                counts["exact_value_present_anywhere_in_output_count"]
                == counts["failed_contract_criterion_count"] - 1
            ),
            "exact_identifier_loss_count": counts[
                "exact_value_absent_from_output_count"
            ],
            "conclusion": (
                "P1 had the required authority evidence and reproduced eight "
                "of nine rejected exact values somewhere in its JSON, but it "
                "did not preserve the frozen machine locations and aliases. "
                "The remaining exact failure shortened the canonical Plate "
                "identifier. This is structural reconstruction loss, not a "
                "reversal of the frozen Quality Gate failure."
            )
        },
        "study_boundary": {
            "quality_censored": True,
            "p2_probe_allowed": False,
            "p3_payment_allowed": False,
            "economic_comparison_allowed": False,
            "new_api_measurement_authorized": False
        },
        "api_call_performed": False,
        "x402_payment_performed": False
    }

    ADJUDICATION_FILE.write_text(
        json.dumps(adjudication, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8"
    )

    print("========================================")
    print("STUDY 004 P1 STRUCTURAL ADJUDICATION")
    print("========================================")
    print("OBSERVATION_ID:", OBSERVATION_ID)
    print("ADJUDICATOR_ID:", ADJUDICATOR_ID)
    print("FROZEN_QUALITY_GATE_PASS:", False)
    print("FAILED_CONTRACT_CRITERIA:", counts[
        "failed_contract_criterion_count"
    ])
    print("EXACT_VALUES_PRESENT_IN_OUTPUT:", counts[
        "exact_value_present_anywhere_in_output_count"
    ])
    print("LOCAL_ALIAS_OR_LOCATION_FAILURES:", counts[
        "exact_value_local_but_contract_location_or_alias_failed_count"
    ])
    print("RELOCATED_EXACT_VALUES:", counts[
        "exact_value_relocated_elsewhere_in_output_count"
    ])
    print("EXACT_VALUES_ABSENT_FROM_OUTPUT:", counts[
        "exact_value_absent_from_output_count"
    ])
    print("MODEL_VISIBLE_AUTHORITY_SUPPORT:", counts[
        "exact_expected_value_present_in_model_visible_authority_count"
    ])
    print(
        "PRIMARY_DIAGNOSTIC_LABEL:",
        "STRUCTURAL_FIDELITY_FAILURE_WITH_SINGLE_EXACT_IDENTIFIER_LOSS"
    )
    print("QUALITY_RESULT_MODIFIED:", False)
    print("ECONOMIC_COMPARISON_PERMITTED:", False)
    print("P2_PROBE_PERFORMED:", False)
    print("API_CALL_PERFORMED:", False)
    print("X402_PAYMENT_PERFORMED:", False)
    print("ADJUDICATION_FILE:", relative(ADJUDICATION_FILE))


if len(sys.argv) != 2:
    fail(
        "Usage: python3 scripts/adjudicate-study004-p1.py "
        "--self-test OR --preflight OR 0001"
    )


mode = sys.argv[1]

if mode == "--self-test":
    self_test()
    raise SystemExit(0)

loaded = load_and_validate()

if mode == "--preflight":
    preflight(loaded)
    raise SystemExit(0)

if mode != "0001":
    fail(
        "Usage: python3 scripts/adjudicate-study004-p1.py "
        "--self-test OR --preflight OR 0001"
    )

write_adjudication(loaded)
