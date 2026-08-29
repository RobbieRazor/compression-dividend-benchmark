from pathlib import Path
import json
import re
import sys

STUDY_ID = "CD-WORKLOAD-20260829-002"
CONTRACT_ID = "CD002-QC-1.0"
REFERENCE_ID = "CD002-REFERENCE-1.0"
EVALUATOR_ID = "CD002-EVAL-1.0"

ROOT = Path.cwd()

QC_FILE = ROOT / "data/CD-WORKLOAD-20260829-002-quality-contract.json"
REF_FILE = ROOT / "data/CD-WORKLOAD-20260829-002-reference-projection.json"

def fail(message):
    print("STUDY002_EVALUATOR_ERROR:", message)
    raise SystemExit(1)

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def normalize_text(value):
    text = str(value)
    text = text.replace("’", "'")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def flatten_strings(value):
    values = []

    if isinstance(value, dict):
        for v in value.values():
            values.extend(flatten_strings(v))

    elif isinstance(value, list):
        for v in value:
            values.extend(flatten_strings(v))

    elif isinstance(value, str):
        values.append(value)

    return values

def combined_text(value):
    return normalize_text(
        " ".join(flatten_strings(value))
    )

def string_values(value):
    return set(flatten_strings(value))

def has(text, phrase):
    return normalize_text(phrase) in normalize_text(text)

def concept_result(label, passed, evidence):
    return {
        "criterion": label,
        "pass": bool(passed),
        "evidence": evidence
    }

qc = read_json(QC_FILE)
ref = read_json(REF_FILE)

if qc.get("study_id") != STUDY_ID:
    fail("Unexpected Quality Contract study ID.")

if qc.get("contract_id") != CONTRACT_ID:
    fail("Unexpected Quality Contract ID.")

if ref.get("study_id") != STUDY_ID:
    fail("Unexpected reference study ID.")

if ref.get("reference_id") != REFERENCE_ID:
    fail("Unexpected reference ID.")

exact_fields = qc["comparison_layers"]["exact_core"]["fields"]

transport_fields = qc["comparison_layers"]["transport_normalized"]["fields"]

semantic_fields = qc["comparison_layers"]["derivable_semantic"]["fields"]

diagnostic_fields = qc["comparison_layers"]["diagnostic_only"]["fields"]

if exact_fields != [
    "@context",
    "@type",
    "name",
    "alternateName",
    "headline",
    "url",
    "inLanguage",
    "creator",
    "author",
    "publisher",
    "license",
    "copyrightHolder",
    "copyrightNotice"
]:
    fail("Exact-core field set differs from frozen evaluator expectation.")

if transport_fields != ["@id"]:
    fail("Transport field set differs from frozen evaluator expectation.")

if semantic_fields != [
    "description",
    "mainEntity",
    "isPartOf",
    "about",
    "subjectOf",
    "citation",
    "usageInfo",
    "creditText"
]:
    fail("Semantic field set differs from frozen evaluator expectation.")

if diagnostic_fields != [
    "identifier",
    "dateModified",
    "keywords"
]:
    fail("Diagnostic field set differs from frozen evaluator expectation.")

if len(sys.argv) == 2 and sys.argv[1] == "--preflight":
    print("========================================")
    print("STUDY 002 QUALITY EVALUATOR PREFLIGHT")
    print("========================================")
    print("STUDY_ID:", STUDY_ID)
    print("CONTRACT_ID:", CONTRACT_ID)
    print("REFERENCE_ID:", REFERENCE_ID)
    print("EVALUATOR_ID:", EVALUATOR_ID)
    print("EXACT_CORE_FIELDS:", len(exact_fields))
    print("TRANSPORT_FIELDS:", len(transport_fields))
    print("SEMANTIC_FIELDS:", len(semantic_fields))
    print("DIAGNOSTIC_FIELDS:", len(diagnostic_fields))
    print("OBSERVATION_READ: false")
    print("API_CALL_PERFORMED: false")
    print("X402_PAYMENT_PERFORMED: false")
    print("PREFLIGHT_PASS: true")
    raise SystemExit(0)

if len(sys.argv) != 2 or not re.fullmatch(r"\d{4}", sys.argv[1]):
    fail(
        "Usage: python3 scripts/evaluate-study002.py --preflight OR 0001"
    )

number = sys.argv[1]
observation_id = "CD-002-P1-" + number

output_file = (
    ROOT / "data/raw" /
    f"{observation_id}-output.json"
)

measurement_file = (
    ROOT / "data/raw" /
    f"{observation_id}-measurement.json"
)

evaluation_file = (
    ROOT / "data/raw" /
    f"{observation_id}-quality-evaluation.json"
)

if not output_file.exists():
    fail("Observation output file not found.")

if not measurement_file.exists():
    fail("Observation measurement manifest not found.")

if evaluation_file.exists():
    fail("Evaluation file already exists. Refusing overwrite.")

output = read_json(output_file)
measurement = read_json(measurement_file)

if measurement.get("study_id") != STUDY_ID:
    fail("Measurement study ID mismatch.")

if measurement.get("observation_id") != observation_id:
    fail("Measurement observation ID mismatch.")

if measurement.get("quality", {}).get("status") != "NOT_YET_EVALUATED":
    fail("Raw measurement is not in NOT_YET_EVALUATED state.")

exact_results = {}

for field in exact_fields:
    expected = ref["exact_core"][field]["value"]
    observed = output.get(field)

    exact_results[field] = {
        "pass": observed == expected,
        "expected": expected,
        "observed": observed
    }

accepted_ids = set(
    qc["comparison_layers"]
      ["transport_normalized"]
      ["accepted_identity_representations"]
)

observed_id = output.get("@id")

transport_result = {
    "field": "@id",
    "pass": observed_id in accepted_ids,
    "observed": observed_id,
    "accepted_identity_representations": sorted(accepted_ids)
}

semantic = {}

text = combined_text(output.get("description", ""))

description_checks = [
    concept_result(
        "Robbie George",
        has(text, "Robbie George"),
        text
    ),
    concept_result(
        "National Geographic-published",
        has(text, "National Geographic-published"),
        text
    ),
    concept_result(
        "wildlife and/or nature photographer",
        (
            "photograph" in text and
            (
                "wildlife" in text or
                "nature" in text
            )
        ),
        text
    ),
    concept_result(
        "Naturepedia",
        has(text, "Naturepedia"),
        text
    ),
    concept_result(
        "Robbie's Razor",
        has(text, "Robbie's Razor"),
        text
    ),
    concept_result(
        "Grand Compression",
        has(text, "Grand Compression"),
        text
    )
]

semantic["description"] = {
    "pass": all(x["pass"] for x in description_checks),
    "checks": description_checks
}

main = output.get("mainEntity", {})
main_text = combined_text(main)

main_checks = [
    concept_result(
        "identity Robbie George",
        isinstance(main, dict) and main.get("name") == "Robbie George",
        main.get("name") if isinstance(main, dict) else None
    ),
    concept_result(
        "type Person",
        isinstance(main, dict) and main.get("@type") == "Person",
        main.get("@type") if isinstance(main, dict) else None
    ),
    concept_result(
        "canonical URL",
        (
            isinstance(main, dict) and
            main.get("url") ==
            "https://www.robbiegeorgephotography.com/who-is-robbie-george"
        ),
        main.get("url") if isinstance(main, dict) else None
    ),
    concept_result(
        "wildlife or nature photography",
        (
            "photograph" in main_text and
            (
                "wildlife" in main_text or
                "nature" in main_text
            )
        ),
        main_text
    ),
    concept_result(
        "Naturepedia",
        has(main_text, "Naturepedia"),
        main_text
    ),
    concept_result(
        "Robbie's Razor",
        has(main_text, "Robbie's Razor"),
        main_text
    ),
    concept_result(
        "Plate Architecture",
        (
            has(main_text, "Plate Architecture") or
            has(main_text, "Plate Systems") or
            has(main_text, "Plate System")
        ),
        main_text
    ),
    concept_result(
        "Architect of Record",
        has(main_text, "Architect of Record"),
        main_text
    )
]

semantic["mainEntity"] = {
    "pass": all(x["pass"] for x in main_checks),
    "checks": main_checks
}

part = output.get("isPartOf", {})
part_text = combined_text(part)
part_values = string_values(part)

ispart_checks = [
    concept_result(
        "Naturepedia",
        has(part_text, "Naturepedia"),
        part_text
    ),
    concept_result(
        "Naturepedia canonical URL",
        "https://www.robbiegeorgephotography.com/naturepedia"
        in part_values,
        sorted(part_values)
    )
]

semantic["isPartOf"] = {
    "pass": all(x["pass"] for x in ispart_checks),
    "checks": ispart_checks
}

about = output.get("about")
about_text = combined_text(about)

about_checks = [
    concept_result(
        "Naturepedia",
        has(about_text, "Naturepedia"),
        about_text
    ),
    concept_result(
        "Robbie's Razor",
        has(about_text, "Robbie's Razor"),
        about_text
    ),
    concept_result(
        "Grand Compression",
        has(about_text, "Grand Compression"),
        about_text
    ),
    concept_result(
        "RKCA",
        (
            has(
                about_text,
                "Recursive Knowledge Compression Architecture"
            ) or
            re.search(r"\brkca\b", about_text) is not None
        ),
        about_text
    ),
    concept_result(
        "RRIP",
        (
            has(
                about_text,
                "Recursive Registry Inheritance Principle"
            ) or
            re.search(r"\brrip\b", about_text) is not None
        ),
        about_text
    ),
    concept_result(
        "Plate Architecture",
        (
            has(about_text, "Plate Architecture") or
            has(about_text, "Plate Systems") or
            has(about_text, "Plate System")
        ),
        about_text
    ),
    concept_result(
        "Machine-Readable Governance",
        has(about_text, "Machine-Readable Governance"),
        about_text
    )
]

semantic["about"] = {
    "pass": all(x["pass"] for x in about_checks),
    "checks": about_checks
}

subject_values = string_values(
    output.get("subjectOf")
)

subject_required = (
    "https://www.robbiegeorgephotography.com/"
    "publications-exhibitions-recognition"
)

semantic["subjectOf"] = {
    "pass": subject_required in subject_values,
    "required_url": subject_required,
    "observed_string_values": sorted(subject_values),
    "comparison_note":
        "Strict string comparison. Fragment normalization was frozen only for the transport @id layer."
}

citation_values = string_values(
    output.get("citation")
)

required_citations = qc[
    "comparison_layers"
][
    "derivable_semantic"
][
    "field_rules"
][
    "citation"
][
    "required_targets"
]

citation_checks = [
    {
        "target": target,
        "pass": target in citation_values
    }
    for target in required_citations
]

semantic["citation"] = {
    "pass": all(x["pass"] for x in citation_checks),
    "checks": citation_checks,
    "observed_string_values": sorted(citation_values)
}

usage_text = combined_text(
    output.get("usageInfo", "")
)

usage_checks = [
    concept_result(
        "x402 endpoint-level retrieval only",
        (
            "x402" in usage_text and
            "endpoint-level retrieval" in usage_text and
            "only" in usage_text
        ),
        usage_text
    ),
    concept_result(
        "training rights not automatically granted",
        (
            "training" in usage_text and
            (
                "require rights" in usage_text or
                "require rights expressly granted" in usage_text or
                "require" in usage_text
            )
        ),
        usage_text
    ),
    concept_result(
        "embedding rights not automatically granted",
        (
            "embedding" in usage_text and
            "require" in usage_text
        ),
        usage_text
    ),
    concept_result(
        "redistribution or resale rights not automatically granted",
        (
            (
                "redistribution" in usage_text or
                "resale" in usage_text
            ) and
            "require" in usage_text
        ),
        usage_text
    ),
    concept_result(
        "framework implementation rights not automatically granted",
        (
            "framework implementation" in usage_text and
            "require" in usage_text
        ),
        usage_text
    )
]

semantic["usageInfo"] = {
    "pass": all(x["pass"] for x in usage_checks),
    "checks": usage_checks
}

credit_text = combined_text(
    output.get("creditText", "")
)

credit_checks = [
    concept_result(
        "created by Robbie George",
        has(credit_text, "Created by Robbie George"),
        credit_text
    ),
    concept_result(
        "Naturepedia creator",
        (
            has(credit_text, "Naturepedia Creator") or
            has(credit_text, "Creator of Naturepedia")
        ),
        credit_text
    ),
    concept_result(
        "Architect of Record",
        has(credit_text, "Architect of Record"),
        credit_text
    )
]

semantic["creditText"] = {
    "pass": all(x["pass"] for x in credit_checks),
    "checks": credit_checks
}

exact_pass_count = sum(
    1 for result in exact_results.values()
    if result["pass"]
)

semantic_pass_count = sum(
    1 for result in semantic.values()
    if result["pass"]
)

exact_all_pass = (
    exact_pass_count == len(exact_fields)
)

semantic_all_pass = (
    semantic_pass_count == len(semantic_fields)
)

primary_pass = bool(
    exact_all_pass and
    transport_result["pass"] and
    semantic_all_pass
)

diagnostic = {
    field: {
        "present": field in output,
        "value": output.get(field)
    }
    for field in diagnostic_fields
}

evaluation = {
    "study_id": STUDY_ID,
    "observation_id": observation_id,
    "evaluator_id": EVALUATOR_ID,
    "contract_id": CONTRACT_ID,
    "reference_id": REFERENCE_ID,

    "status": "QUALITY_EVALUATION_COMPLETE",

    "evaluation_policy": {
        "exact_core":
            "Deep exact-value comparison against frozen independent reference projection.",
        "transport":
            "Membership in the frozen accepted @id representation set.",
        "semantic":
            "Explicit conservative concept checks derived from the frozen CD002-QC-1.0 field rules.",
        "diagnostic_only":
            "Recorded but excluded from primary pass/fail."
    },

    "exact_core": {
        "pass": exact_all_pass,
        "pass_count": exact_pass_count,
        "field_count": len(exact_fields),
        "results": exact_results
    },

    "transport_normalized": transport_result,

    "derivable_semantic": {
        "pass": semantic_all_pass,
        "pass_count": semantic_pass_count,
        "field_count": len(semantic_fields),
        "results": semantic
    },

    "diagnostic_only": diagnostic,

    "primary_quality_gate_pass": primary_pass,

    "economic_comparison_permitted_for_this_observation":
        primary_pass,

    "raw_measurement_modified": False,

    "x402_payment_performed_by_evaluator": False
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
print("STUDY 002 QUALITY EVALUATION")
print("========================================")
print("OBSERVATION_ID:", observation_id)
print("EVALUATOR_ID:", EVALUATOR_ID)
print(
    "EXACT_CORE_PASS:",
    f"{exact_pass_count}/{len(exact_fields)}"
)
print(
    "TRANSPORT_PASS:",
    transport_result["pass"]
)
print(
    "SEMANTIC_PASS:",
    f"{semantic_pass_count}/{len(semantic_fields)}"
)
print(
    "PRIMARY_QUALITY_GATE_PASS:",
    primary_pass
)
print(
    "ECONOMIC_COMPARISON_PERMITTED:",
    primary_pass
)
print("RAW_MEASUREMENT_MODIFIED: false")
print("API_CALL_PERFORMED: false")
print("X402_PAYMENT_PERFORMED: false")
print(
    "EVALUATION_FILE:",
    evaluation_file.relative_to(ROOT)
)
