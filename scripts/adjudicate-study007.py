from pathlib import Path
import hashlib
import json
import sys

ROOT = Path.cwd()
OBSERVATION_ID = "CD-007-P1A-0001"
ADJUDICATOR_ID = "CD007-COMPARATIVE-ADJ-1.0"
OUTPUT = ROOT / "data/raw/CD-007-comparative-adjudication.json"

FILES = {
    "arm_a_measurement": ROOT / "data/raw/CD-007-P1A-0001-measurement.json",
    "arm_a_output": ROOT / "data/raw/CD-007-P1A-0001-output.json",
    "arm_a_quality": ROOT / "data/raw/CD-007-P1A-0001-quality-evaluation.json",
    "arm_b_availability": ROOT / "data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json",
    "runtime_correction": ROOT / "data/CD-WORKLOAD-20260831-007-arm-a-evaluator-runtime-correction.json",
    "quality_contract": ROOT / "data/CD-WORKLOAD-20260831-007-arm-a-quality-contract.json",
    "study006_adjudication": ROOT / "data/raw/CD-006-P1-0001-canonical-fidelity-adjudication.json",
}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def load(path):
    return json.loads(path.read_text())

def fail(message):
    print("STUDY007_ADJUDICATOR_ERROR:", message)
    raise SystemExit(1)

for role, path in FILES.items():
    if not path.exists():
        fail(f"Missing frozen input {role}: {path.relative_to(ROOT)}")

measurement = load(FILES["arm_a_measurement"])
quality = load(FILES["arm_a_quality"])
arm_b = load(FILES["arm_b_availability"])
study006 = load(FILES["study006_adjudication"])

relationships = quality["result"]["relationships"]
arm_a_pass = sum(item["target_fact_pass_count"] for item in relationships["results"])
arm_a_total = sum(item["target_fact_count"] for item in relationships["results"])
study006_pass = study006["exact_value_fidelity"]["relationship_target_fact_pass_count"]
study006_total = study006["exact_value_fidelity"]["relationship_target_fact_count"]
arm_b_pass = arm_b["result"]["exact_fact_available_count"]
arm_b_total = arm_b["result"]["relationship_target_fact_count"]

if arm_a_total != 52 or study006_total != 52 or arm_b_total != 52:
    fail("Frozen relationship fact denominator changed.")
if quality["primary_quality_gate_pass"] is not False:
    fail("Frozen Arm A quality result is not failed.")
if arm_b["adjudication"]["arm_b_state"] != "AVAILABILITY_CENSORED_BEFORE_MEASUREMENT":
    fail("Arm B availability state changed.")

artifact = {
    "study_id": "CD-WORKLOAD-20260831-007",
    "adjudicator_id": ADJUDICATOR_ID,
    "status": "COMPARATIVE_ADJUDICATION_COMPLETE",
    "frozen_inputs": {
        role: {"path": str(path.relative_to(ROOT)), "sha256": digest(path)}
        for role, path in FILES.items()
    },
    "arm_a_observed_result": {
        "observation_id": OBSERVATION_ID,
        "measurement_valid": measurement["measurement_valid_for_p1"],
        "model_cost_usd": measurement["cost_usd"]["total_requester_model_cost"],
        "schema_pass": quality["result"]["schema"]["pass"],
        "subject_pass": quality["result"]["subject"]["pass"],
        "relationship_pass_count": relationships["pass_count"],
        "relationship_count": relationships["relationship_count"],
        "relationship_target_fact_pass_count": arm_a_pass,
        "relationship_target_fact_count": arm_a_total,
        "rights_pass": quality["result"]["retrieval_rights"]["pass"],
        "primary_quality_gate_pass": quality["primary_quality_gate_pass"],
    },
    "arm_a_vs_study006": {
        "study006_relationship_target_fact_pass_count": study006_pass,
        "study007_arm_a_relationship_target_fact_pass_count": arm_a_pass,
        "relationship_exact_fact_gain": arm_a_pass - study006_pass,
        "fully_passing_relationship_gain": relationships["pass_count"] - study006["frozen_quality_result"]["relationship_pass_count"],
        "instruction_intervention_improved_relationship_exactness": arm_a_pass > study006_pass,
    },
    "arm_b_premeasurement_result": {
        "state": arm_b["adjudication"]["arm_b_state"],
        "exact_fact_available_count": arm_b_pass,
        "exact_fact_count": arm_b_total,
        "availability_gain_over_historical_arm_a_output": arm_b_pass - arm_a_pass,
        "quality_equivalent_without_invention": arm_b["result"]["quality_equivalent_arm_b_possible_without_invention"],
        "measurement_performed": False,
    },
    "comparative_finding": {
        "primary_label": "ZERO_INSTRUCTION_GAIN_WITH_REFRESHED_AUTHORITY_STILL_BELOW_EXACT_GATE",
        "source_grounding_instruction_gain": 0,
        "refreshed_authority_availability_gain": arm_b_pass - arm_a_pass,
        "remaining_arm_b_authority_gap": arm_b_total - arm_b_pass,
        "quality_equivalent_p1_established": False,
        "stable_cost_calibration_established": False,
        "economic_comparison_permitted": False,
    },
    "interpretation_boundary": {
        "schema_placement_problem": False,
        "subject_fidelity_problem": False,
        "provenance_coverage_problem": False,
        "rights_semantics_problem": False,
        "remaining_problem": "Exact canonical relationship values are not reliably recoverable from semantic authority evidence, and the refreshed public authority still omits six required exact values.",
        "production_tuning_to_hidden_target_allowed": False,
        "quality_result_modified": False,
    },
    "actions_performed": {
        "model_api_call": False,
        "automatic_retry": False,
        "arm_b_measurement": False,
        "p2_probe": False,
        "x402_payment": False,
        "economic_comparison": False,
        "production_mutation": False,
    },
}

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    print("========================================")
    print("STUDY 007 COMPARATIVE ADJUDICATION PREFLIGHT")
    print("========================================")
    print("ARM_A_RELATIONSHIP_FACTS:", f"{arm_a_pass}/{arm_a_total}")
    print("ARM_A_GAIN_VS_STUDY006:", arm_a_pass - study006_pass)
    print("ARM_B_AUTHORITY_CEILING:", f"{arm_b_pass}/{arm_b_total}")
    print("ARM_B_MEASUREMENT_PERFORMED: False")
    print("QUALITY_RESULT_MODIFIED: False")
    print("P2_PROBE_PERFORMED: False")
    print("X402_PAYMENT_PERFORMED: False")
    print("ADJUDICATION_FILE_CREATED: False")
    print("PREFLIGHT_PASS: True")
    raise SystemExit(0)

if len(sys.argv) != 1:
    fail("Usage: python3 scripts/adjudicate-study007.py [--preflight]")
if OUTPUT.exists():
    fail("Adjudication already exists. Refusing overwrite.")
OUTPUT.write_text(json.dumps(artifact, indent=2, ensure_ascii=False) + "\n")
print("========================================")
print("STUDY 007 COMPARATIVE ADJUDICATION")
print("========================================")
print("ARM_A_RELATIONSHIP_FACTS:", f"{arm_a_pass}/{arm_a_total}")
print("ARM_A_GAIN_VS_STUDY006:", arm_a_pass - study006_pass)
print("ARM_B_AUTHORITY_CEILING:", f"{arm_b_pass}/{arm_b_total}")
print("ARM_B_AVAILABILITY_GAIN:", arm_b_pass - arm_a_pass)
print("PRIMARY_LABEL:", artifact["comparative_finding"]["primary_label"])
print("QUALITY_EQUIVALENT_P1_ESTABLISHED: False")
print("ECONOMIC_COMPARISON_PERMITTED: False")
print("API_CALL_PERFORMED: False")
print("X402_PAYMENT_PERFORMED: False")
print("ADJUDICATION_FILE:", OUTPUT.relative_to(ROOT))
