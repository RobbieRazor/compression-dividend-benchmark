from pathlib import Path
import json
import re
import sys

STUDY_ID = "CD-WORKLOAD-20260829-002"
DIAGNOSTIC_ID = "CD002-AMBIGUITY-DIAG-1.0"

ROOT = Path.cwd()

AUTHORITY_FILE = ROOT / "data/CD-WORKLOAD-20260829-002-public-authority-sources.json"
REFERENCE_FILE = ROOT / "data/CD-WORKLOAD-20260829-002-reference-projection.json"
QC_FILE = ROOT / "data/CD-WORKLOAD-20260829-002-quality-contract.json"
TASK_FILE = ROOT / "prompts/CD-WORKLOAD-20260829-002-p1-task.txt"

def fail(message):
    print("STUDY002_DIAGNOSTIC_ERROR:", message)
    raise SystemExit(1)

def read_json(path):
    return json.loads(
        path.read_text(
            encoding="utf-8"
        )
    )

def canonical_json(value):
    return json.dumps(
        value,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":")
    )

def walk(value, path=""):
    rows = []

    rows.append({
        "path": path,
        "value": value
    })

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = (
                path + "." + key
                if path
                else key
            )

            rows.extend(
                walk(
                    child,
                    child_path
                )
            )

    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = (
                f"{path}[{index}]"
                if path
                else f"[{index}]"
            )

            rows.extend(
                walk(
                    child,
                    child_path
                )
            )

    return rows

def collect_key_values(value, target_key, path=""):
    results = []

    if isinstance(value, dict):
        for key, child in value.items():
            child_path = (
                path + "." + key
                if path
                else key
            )

            if key == target_key:
                results.append({
                    "path": child_path,
                    "value": child
                })

            results.extend(
                collect_key_values(
                    child,
                    target_key,
                    child_path
                )
            )

    elif isinstance(value, list):
        for index, child in enumerate(value):
            child_path = (
                f"{path}[{index}]"
                if path
                else f"[{index}]"
            )

            results.extend(
                collect_key_values(
                    child,
                    target_key,
                    child_path
                )
            )

    return results

for required in [
    AUTHORITY_FILE,
    REFERENCE_FILE,
    QC_FILE,
    TASK_FILE
]:
    if not required.exists():
        fail(
            "Required frozen file missing: "
            + str(required.relative_to(ROOT))
        )

authority = read_json(
    AUTHORITY_FILE
)

reference = read_json(
    REFERENCE_FILE
)

qc = read_json(
    QC_FILE
)

task_text = TASK_FILE.read_text(
    encoding="utf-8"
)

if authority.get("study_id") != STUDY_ID:
    fail(
        "Authority package study ID mismatch."
    )

if reference.get("study_id") != STUDY_ID:
    fail(
        "Reference study ID mismatch."
    )

if qc.get("study_id") != STUDY_ID:
    fail(
        "Quality Contract study ID mismatch."
    )

canonical_source = next(
    (
        source
        for source in authority["sources"]
        if source["role"] == "canonical-biography"
    ),
    None
)

if canonical_source is None:
    fail(
        "Canonical biography source missing."
    )

if len(
    canonical_source.get(
        "jsonld",
        []
    )
) < 2:
    fail(
        "Expected multiple public JSON-LD blocks."
    )

if (
    len(sys.argv) == 2
    and sys.argv[1] == "--preflight"
):
    print(
        "========================================"
    )
    print(
        "STUDY 002 AMBIGUITY DIAGNOSTIC PREFLIGHT"
    )
    print(
        "========================================"
    )
    print(
        "STUDY_ID:",
        STUDY_ID
    )
    print(
        "DIAGNOSTIC_ID:",
        DIAGNOSTIC_ID
    )
    print(
        "PUBLIC_SOURCE_COUNT:",
        len(authority["sources"])
    )
    print(
        "CANONICAL_BIOGRAPHY_JSONLD_BLOCKS:",
        len(
            canonical_source.get(
                "jsonld",
                []
            )
        )
    )
    print(
        "OBSERVATION_READ: false"
    )
    print(
        "EVALUATION_READ: false"
    )
    print(
        "API_CALL_PERFORMED: false"
    )
    print(
        "X402_PAYMENT_PERFORMED: false"
    )
    print(
        "PREFLIGHT_PASS: true"
    )
    raise SystemExit(0)

if (
    len(sys.argv) != 2
    or not re.fullmatch(
        r"\d{4}",
        sys.argv[1]
    )
):
    fail(
        "Usage: python3 scripts/diagnose-study002-ambiguity.py --preflight OR 0001"
    )

number = sys.argv[1]

observation_id = (
    "CD-002-P1-" + number
)

output_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-output.json"
)

evaluation_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-quality-evaluation.json"
)

diagnostic_file = (
    ROOT
    / "data/raw"
    / f"{observation_id}-ambiguity-diagnostic.json"
)

if not output_file.exists():
    fail(
        "Observation output missing."
    )

if not evaluation_file.exists():
    fail(
        "Frozen quality evaluation missing."
    )

if diagnostic_file.exists():
    fail(
        "Diagnostic already exists. Refusing overwrite."
    )

output = read_json(
    output_file
)

evaluation = read_json(
    evaluation_file
)

if (
    evaluation.get(
        "primary_quality_gate_pass"
    )
    is not False
):
    fail(
        "Ambiguity diagnostic is intended for a failed frozen evaluation."
    )

public_rows = []

for source in authority["sources"]:
    role = source["role"]

    for row in walk(source):
        public_rows.append({
            "role": role,
            "path": row["path"],
            "value": row["value"]
        })

def exact_anywhere_matches(value):
    marker = canonical_json(
        value
    )

    return [
        {
            "role": row["role"],
            "path": row["path"]
        }
        for row in public_rows
        if canonical_json(
            row["value"]
        ) == marker
    ]

def same_key_matches(field, value):
    marker = canonical_json(
        value
    )

    matches = []

    for source in authority["sources"]:
        for row in collect_key_values(
            source,
            field
        ):
            if canonical_json(
                row["value"]
            ) == marker:
                matches.append({
                    "role":
                        source["role"],
                    "path":
                        row["path"]
                })

    return matches

def distinct_same_key_candidates(field):
    seen = {}

    for source in authority["sources"]:
        for row in collect_key_values(
            source,
            field
        ):
            marker = canonical_json(
                row["value"]
            )

            if marker not in seen:
                seen[marker] = {
                    "value":
                        row["value"],
                    "examples": []
                }

            if (
                len(
                    seen[marker][
                        "examples"
                    ]
                )
                < 3
            ):
                seen[marker][
                    "examples"
                ].append({
                    "role":
                        source["role"],
                    "path":
                        row["path"]
                })

    return list(
        seen.values()
    )

failed_exact = [
    field
    for field, result
    in evaluation[
        "exact_core"
    ][
        "results"
    ].items()
    if not result["pass"]
]

failed_semantic = [
    field
    for field, result
    in evaluation[
        "derivable_semantic"
    ][
        "results"
    ].items()
    if not result["pass"]
]

failed_transport = []

if not evaluation[
    "transport_normalized"
][
    "pass"
]:
    failed_transport.append(
        "@id"
    )

fields_to_review = (
    failed_exact
    + failed_transport
    + failed_semantic
)

field_results = {}

for field in fields_to_review:
    observed = output.get(
        field
    )

    observed_same_key = (
        same_key_matches(
            field,
            observed
        )
    )

    observed_anywhere = (
        exact_anywhere_matches(
            observed
        )
    )

    candidates = (
        distinct_same_key_candidates(
            field
        )
    )

    reference_value = None

    if field in reference.get(
        "exact_core",
        {}
    ):
        reference_value = (
            reference[
                "exact_core"
            ][
                field
            ][
                "value"
            ]
        )

    elif field == "@id":
        reference_value = (
            reference[
                "transport_normalized"
            ][
                "canonical_public_identity"
            ]
        )

    reference_same_key = (
        same_key_matches(
            field,
            reference_value
        )
        if reference_value
        is not None
        else []
    )

    observed_publicly_grounded = bool(
        observed_same_key
        or observed_anywhere
    )

    reference_publicly_grounded = bool(
        reference_same_key
    )

    multiple_public_candidates = (
        len(candidates) > 1
    )

    if (
        observed_same_key
        and reference_same_key
        and multiple_public_candidates
    ):
        classification = (
            "PUBLIC_MULTI_REPRESENTATION_CONFLICT"
        )

    elif observed_same_key:
        classification = (
            "OBSERVED_VALUE_EXPLICITLY_PUBLIC_AT_SAME_FIELD"
        )

    elif observed_anywhere:
        classification = (
            "OBSERVED_VALUE_EXPLICITLY_PUBLIC_ELSEWHERE"
        )

    else:
        classification = (
            "OBSERVED_VALUE_NOT_EXACTLY_PRESENT_IN_PUBLIC_PACKAGE"
        )

    field_results[field] = {
        "observed":
            observed,

        "reference_value":
            reference_value,

        "observed_same_key_public_support":
            observed_same_key,

        "observed_anywhere_public_support":
            observed_anywhere,

        "reference_same_key_public_support":
            reference_same_key,

        "distinct_public_same_key_candidate_count":
            len(candidates),

        "distinct_public_same_key_candidates":
            candidates,

        "observed_publicly_grounded":
            observed_publicly_grounded,

        "reference_publicly_grounded":
            reference_publicly_grounded,

        "multiple_public_candidates":
            multiple_public_candidates,

        "classification":
            classification
    }

total_failed = len(
    fields_to_review
)

publicly_grounded_failed = sum(
    1
    for result in field_results.values()
    if result[
        "observed_publicly_grounded"
    ]
)

multi_representation_conflicts = sum(
    1
    for result in field_results.values()
    if result[
        "classification"
    ]
    ==
    "PUBLIC_MULTI_REPRESENTATION_CONFLICT"
)

task_explicitly_selects_jsonld_path = bool(
    re.search(
        r"jsonld\s*\[\s*\d+\s*\]",
        task_text,
        flags=re.IGNORECASE
    )
)

task_explicitly_selects_biography_plate_fragment = (
    "#robbie-george-biography-plate"
    in task_text
)

diagnostic = {
    "study_id":
        STUDY_ID,

    "observation_id":
        observation_id,

    "diagnostic_id":
        DIAGNOSTIC_ID,

    "status":
        "TASK_AMBIGUITY_DIAGNOSTIC_COMPLETE",

    "frozen_quality_result_preserved": {
        "primary_quality_gate_pass":
            False,

        "quality_evaluation_file":
            str(
                evaluation_file.relative_to(
                    ROOT
                )
            ),

        "quality_result_modified":
            False
    },

    "diagnostic_question":
        "Did the failed P1 observation use values that were themselves explicitly present in the independently frozen public-authority evidence, indicating multiple plausible public representations rather than simple unsupported generation?",

    "task_specificity": {
        "explicit_jsonld_path_selection":
            task_explicitly_selects_jsonld_path,

        "explicit_biography_plate_fragment_selection":
            task_explicitly_selects_biography_plate_fragment,

        "canonical_biography_jsonld_block_count":
            len(
                canonical_source.get(
                    "jsonld",
                    []
                )
            )
    },

    "failed_field_count":
        total_failed,

    "failed_fields":
        fields_to_review,

    "publicly_grounded_failed_field_count":
        publicly_grounded_failed,

    "public_multi_representation_conflict_count":
        multi_representation_conflicts,

    "field_results":
        field_results,

    "interpretation_boundary":
        "This diagnostic does not alter CD002-QC-1.0, CD002-REFERENCE-1.0, CD002-EVAL-1.0, or the frozen PASS/FAIL result. It only characterizes whether rejected output values were independently present in the frozen public evidence.",

    "api_call_performed":
        False,

    "x402_payment_performed":
        False
}

diagnostic_file.write_text(
    json.dumps(
        diagnostic,
        indent=2,
        ensure_ascii=False
    ) + "\n",
    encoding="utf-8"
)

print(
    "========================================"
)
print(
    "STUDY 002 TASK AMBIGUITY DIAGNOSTIC"
)
print(
    "========================================"
)
print(
    "OBSERVATION_ID:",
    observation_id
)
print(
    "DIAGNOSTIC_ID:",
    DIAGNOSTIC_ID
)
print(
    "FROZEN_QUALITY_GATE_PASS:",
    False
)
print(
    "FAILED_FIELD_COUNT:",
    total_failed
)
print(
    "PUBLICLY_GROUNDED_FAILED_FIELDS:",
    f"{publicly_grounded_failed}/{total_failed}"
)
print(
    "MULTI_REPRESENTATION_CONFLICTS:",
    multi_representation_conflicts
)
print(
    "TASK_SELECTS_JSONLD_PATH:",
    task_explicitly_selects_jsonld_path
)
print(
    "TASK_SELECTS_BIOGRAPHY_PLATE_FRAGMENT:",
    task_explicitly_selects_biography_plate_fragment
)
print(
    "QUALITY_RESULT_MODIFIED:",
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
    "DIAGNOSTIC_FILE:",
    diagnostic_file.relative_to(
        ROOT
    )
)
