from pathlib import Path
import hashlib
import json
import re
import sys

STUDY_ID = "CD-WORKLOAD-20260829-003"
CONTRACT_ID = "CD003-QC-1.0"
SURFACE_ID = "CD003-PUBLIC-SURFACE-1.0"
EVALUATOR_ID = "CD003-P2-EVAL-1.0"

ROOT = Path.cwd()

QC_FILE = ROOT / "data/CD-WORKLOAD-20260829-003-quality-contract.json"
SURFACE_FILE = ROOT / "data/CD-WORKLOAD-20260829-003-public-state-surface.json"
SURFACE_METADATA_FILE = ROOT / "data/CD-WORKLOAD-20260829-003-public-state-surface-metadata.json"

def fail(message):
    print("STUDY003_P2_EVALUATOR_ERROR:", message)
    raise SystemExit(1)

def read_json(path):
    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

def sha256(path):
    return hashlib.sha256(
        path.read_bytes()
    ).hexdigest()

for path in [
    QC_FILE,
    SURFACE_FILE,
    SURFACE_METADATA_FILE
]:
    if not path.exists():
        fail(
            "Required frozen artifact missing: "
            + str(path.relative_to(ROOT))
        )

qc = read_json(QC_FILE)
surface = read_json(SURFACE_FILE)
surface_metadata = read_json(
    SURFACE_METADATA_FILE
)

if qc.get("study_id") != STUDY_ID:
    fail("Quality Contract study ID mismatch.")

if qc.get("contract_id") != CONTRACT_ID:
    fail("Quality Contract ID mismatch.")

if surface_metadata.get("study_id") != STUDY_ID:
    fail("Surface metadata study ID mismatch.")

if surface_metadata.get("surface_id") != SURFACE_ID:
    fail("Surface ID mismatch.")

expected_surface_sha = (
    qc["selected_public_surface"]["sha256"]
)

actual_surface_sha = sha256(
    SURFACE_FILE
)

if actual_surface_sha != expected_surface_sha:
    fail(
        "Frozen public surface hash mismatch."
    )

exact_fields = (
    qc["primary_comparison"]["fields"]
)

expected_exact_fields = [
    "@context",
    "@type",
    "name",
    "alternateName",
    "headline",
    "url",
    "mainEntity",
    "creator",
    "publisher",
    "copyrightHolder",
    "copyrightNotice",
    "isPartOf",
    "about"
]

if exact_fields != expected_exact_fields:
    fail(
        "Frozen exact field set differs from evaluator expectation."
    )

if len(exact_fields) != 13:
    fail(
        "Expected exactly 13 deep-exact fields."
    )

if qc["primary_comparison"]["comparison_type"] != "DEEP_EXACT_VALUE":
    fail(
        "Unexpected comparison type."
    )

if qc["transport_normalization"]["field"] != "@id":
    fail(
        "Unexpected transport field."
    )

if qc["representation_selection"]["alternate_public_nodes_accepted"] is not False:
    fail(
        "Alternate public nodes must remain rejected."
    )

accepted_ids = set(
    qc[
        "transport_normalization"
    ][
        "accepted_identity_representations"
    ]
)

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    print("========================================")
    print("STUDY 003 P2 QUALITY EVALUATOR PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("CONTRACT_ID:", CONTRACT_ID)
    print("SURFACE_ID:", SURFACE_ID)
    print("EVALUATOR_ID:", EVALUATOR_ID)
    print("DEEP_EXACT_FIELDS:", len(exact_fields))
    print("TRANSPORT_FIELD:", "@id")
    print("SURFACE_SHA256:", actual_surface_sha)
    print("VALID_P2_CACHE_HIT_REQUIRED: true")
    print("OBSERVATION_READ: false")
    print("API_CALL_PERFORMED: false")
    print("X402_PAYMENT_PERFORMED: false")
    print("PREFLIGHT_PASS: true")
    raise SystemExit(0)

if (
    len(sys.argv) != 2
    or not re.fullmatch(
        r"\d{4}",
        sys.argv[1]
    )
):
    fail(
        "Usage: python3 scripts/evaluate-study003-p2.py --preflight OR 0001"
    )

number = sys.argv[1]

observation_id = (
    "CD-003-P2-" + number
)

output_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-output.json"
)

measurement_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-measurement.json"
)

evaluation_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-quality-evaluation.json"
)

if not output_file.exists():
    fail(
        "P2 output file not found."
    )

if not measurement_file.exists():
    fail(
        "P2 measurement file not found."
    )

if evaluation_file.exists():
    fail(
        "P2 evaluation already exists. Refusing overwrite."
    )

output = read_json(
    output_file
)

measurement = read_json(
    measurement_file
)

if measurement.get("study_id") != STUDY_ID:
    fail(
        "Measurement study ID mismatch."
    )

if measurement.get("observation_id") != observation_id:
    fail(
        "Measurement observation ID mismatch."
    )

if measurement.get("path") != "P2":
    fail(
        "Measurement path is not P2."
    )

if measurement.get("measurement_valid_for_p2") is not True:
    fail(
        "Measurement is not a valid P2 cache hit."
    )

if measurement.get("cache_state") != "P2_CACHE_HIT":
    fail(
        "Unexpected P2 cache state."
    )

if measurement.get("cache_read_observed") is not True:
    fail(
        "P2 cache read was not observed."
    )

if measurement.get("cache_write_observed") is not False:
    fail(
        "Formal P2 observation unexpectedly wrote cache."
    )

if measurement.get("usage", {}).get("cached_input_tokens", 0) <= 0:
    fail(
        "Formal P2 observation contains no cached input tokens."
    )

if measurement.get("usage", {}).get("cache_write_tokens", 0) != 0:
    fail(
        "Formal P2 observation contains cache-write tokens."
    )

if (
    measurement.get(
        "quality",
        {}
    ).get(
        "contract_id"
    )
    != CONTRACT_ID
):
    fail(
        "Measurement Quality Contract mismatch."
    )

if (
    measurement.get(
        "quality",
        {}
    ).get(
        "status"
    )
    != "NOT_YET_EVALUATED"
):
    fail(
        "Raw P2 measurement is not in NOT_YET_EVALUATED state."
    )

if not isinstance(output, dict):
    fail(
        "P2 output is not a JSON object."
    )

exact_results = {}

for field in exact_fields:
    present = field in output
    expected = surface[field]
    observed = output.get(field)

    exact_results[field] = {
        "present": present,
        "pass": (
            present
            and observed == expected
        ),
        "expected": expected,
        "observed": observed
    }

exact_pass_count = sum(
    1
    for result in exact_results.values()
    if result["pass"]
)

exact_all_pass = (
    exact_pass_count
    == len(exact_fields)
)

observed_id = output.get("@id")

transport_pass = (
    observed_id in accepted_ids
)

transport_result = {
    "field": "@id",
    "present": "@id" in output,
    "pass": transport_pass,
    "observed": observed_id,
    "accepted_identity_representations":
        sorted(accepted_ids)
}

selected_fields = set(
    exact_fields + ["@id"]
)

missing_selected_fields = sorted(
    field
    for field in selected_fields
    if field not in output
)

extra_fields = sorted(
    field
    for field in output
    if field not in selected_fields
)

primary_pass = bool(
    exact_all_pass
    and transport_pass
    and not missing_selected_fields
)

evaluation = {
    "study_id":
        STUDY_ID,

    "observation_id":
        observation_id,

    "path":
        "P2",

    "evaluator_id":
        EVALUATOR_ID,

    "contract_id":
        CONTRACT_ID,

    "surface_id":
        SURFACE_ID,

    "status":
        "QUALITY_EVALUATION_COMPLETE",

    "measurement_validity": {
        "measurement_valid_for_p2":
            True,

        "cache_state":
            measurement["cache_state"],

        "cache_read_observed":
            measurement["cache_read_observed"],

        "cache_write_observed":
            measurement["cache_write_observed"],

        "cached_input_tokens":
            measurement[
                "usage"
            ][
                "cached_input_tokens"
            ]
    },

    "evaluation_policy": {
        "deep_exact":
            "Python deep equality against the same frozen Study 003 public state surface used for P1.",

        "transport":
            "Observed @id must belong to the same predeclared accepted transport-identity set.",

        "extra_fields":
            "Allowed and ignored for primary pass/fail.",

        "alternate_public_representations":
            "Not accepted."
    },

    "surface_sha256":
        actual_surface_sha,

    "deep_exact": {
        "pass":
            exact_all_pass,

        "pass_count":
            exact_pass_count,

        "field_count":
            len(exact_fields),

        "results":
            exact_results
    },

    "transport_normalized":
        transport_result,

    "missing_selected_fields":
        missing_selected_fields,

    "extra_fields":
        extra_fields,

    "primary_quality_gate_pass":
        primary_pass,

    "economic_comparison_permitted_for_this_observation":
        primary_pass,

    "raw_measurement_modified":
        False,

    "api_call_performed_by_evaluator":
        False,

    "x402_payment_performed_by_evaluator":
        False
}

evaluation_file.write_text(
    json.dumps(
        evaluation,
        indent=2,
        ensure_ascii=False
    ) + "\n",
    encoding="utf-8"
)

print("========================================")
print("STUDY 003 P2 QUALITY EVALUATION")
print("========================================")

print(
    "OBSERVATION_ID:",
    observation_id
)

print(
    "EVALUATOR_ID:",
    EVALUATOR_ID
)

print(
    "VALID_P2_CACHE_HIT:",
    True
)

print(
    "DEEP_EXACT_PASS:",
    str(exact_pass_count)
    + "/"
    + str(len(exact_fields))
)

print(
    "TRANSPORT_PASS:",
    transport_pass
)

print(
    "MISSING_SELECTED_FIELDS:",
    len(missing_selected_fields)
)

print(
    "EXTRA_FIELDS:",
    len(extra_fields)
)

print(
    "PRIMARY_QUALITY_GATE_PASS:",
    primary_pass
)

print(
    "ECONOMIC_COMPARISON_PERMITTED:",
    primary_pass
)

print(
    "RAW_MEASUREMENT_MODIFIED:",
    False
)

print(
    "API_CALL_PERFORMED:",
    False
)

print(
    "X402_PAYMENT_PERFORMED:",
    False
)

print(
    "EVALUATION_FILE:",
    evaluation_file.relative_to(
        ROOT
    )
)
