import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}


function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}


function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}


function collectStrings(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
  } else if (Array.isArray(value)) {
    for (const child of value) {
      collectStrings(child, results);
    }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectStrings(child, results);
    }
  }
  return results;
}


const manifest = readJson(
  './data/CD-WORKLOAD-20260830-006-design-manifest.json'
);
const rules = readJson(
  './data/CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules.json'
);
const study005Closure = readJson(
  './data/CD-WORKLOAD-20260830-005-FINAL-SUMMARY.json'
);
const study005Adjudication = readJson(
  './data/raw/CD-005-P1-0001-semantic-adjudication.json'
);
const study005Target = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json'
);


test('Study 006 begins as a design-only successor to closed Study 005', () => {
  assert.equal(manifest.study_id, 'CD-WORKLOAD-20260830-006');
  assert.equal(
    manifest.status,
    'DESIGN_AND_NEUTRAL_PRESERVATION_RULES_FROZEN_BEFORE_AUTHORITY_TARGET_TASK_PROVIDER_OR_MEASUREMENT'
  );
  assert.equal(
    manifest.predecessor_evidence.study005_outcome,
    study005Closure.benchmark_outcome
  );
  assert.equal(manifest.predecessor_evidence.study005_schema_intervention_succeeded, true);
  assert.equal(manifest.predecessor_evidence.study005_quality_result_modified, false);
  assert.equal(
    manifest.predecessor_evidence.study005_cost_inherited_as_accepted_baseline,
    false
  );
  assert.equal(manifest.current_freeze_state.design_frozen, true);
  assert.equal(manifest.current_freeze_state.neutral_preservation_rules_frozen, true);
  assert.equal(manifest.current_freeze_state.measurement_authorized, false);
});


test('design, rules, and predecessor evidence are pinned exactly', () => {
  for (const [role, artifact] of Object.entries(manifest.frozen_design_artifacts)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
  }
  for (const [role, artifact] of Object.entries(manifest.predecessor_evidence)) {
    if (!artifact || typeof artifact !== 'object' || !artifact.path) {
      continue;
    }
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
    assert.match(artifact.commit, /^[0-9a-f]{40}$/, role);
  }
});


test('neutral rules cover every observed canonical-fidelity failure family', () => {
  const familyIds = new Set(rules.preservation_families.map((item) => item.family_id));
  assert.deepEqual(familyIds, new Set([
    'COMPLETE_CANONICAL_IDENTIFIER',
    'UNICODE_AND_TRADEMARK_MARKS',
    'AUTHORITY_SUPPORTED_ONTOLOGY_TOKEN',
    'CANONICAL_DESCRIPTOR',
    'RETRIEVAL_RIGHTS_LEXICON'
  ]));
  assert.equal(rules.preservation_families.length, 5);
  assert.equal(
    study005Adjudication.target_mismatch_classification.category_counts
      .SHORTENED_CANONICAL_IDENTIFIER,
    1
  );
  assert.equal(
    study005Adjudication.target_mismatch_classification.category_counts
      .ONTOLOGY_TYPE_SUBSTITUTION,
    5
  );
  assert.equal(
    study005Adjudication.target_mismatch_classification.category_counts
      .CANONICAL_DESCRIPTOR_PARAPHRASE,
    4
  );
  assert.equal(
    study005Adjudication.target_mismatch_classification.category_counts
      .TRADEMARK_MARK_OMISSION,
    5
  );
  assert.equal(
    study005Adjudication.rights_adjudication.semantic_rights_boundary_preserved,
    true
  );
  assert.equal(study005Adjudication.rights_adjudication.frozen_exact_gate_pass, false);
});


test('neutral rules contain no protected target value or mapping', () => {
  const protectedStrings = new Set(collectStrings(study005Target));
  const ruleStrings = new Set(collectStrings(rules));

  for (const protectedValue of protectedStrings) {
    assert.equal(
      ruleStrings.has(protectedValue),
      false,
      `Protected target value leaked into neutral rules: ${protectedValue}`
    );
  }

  for (const family of rules.preservation_families) {
    assert.equal(family.target_values_disclosed, false, family.family_id);
  }
  assert.equal(rules.disclosure_boundary.contains_target_payload_values, false);
  assert.equal(rules.disclosure_boundary.contains_target_field_value_mapping, false);
  assert.equal(rules.disclosure_boundary.contains_prior_failure_locations, false);
  assert.equal(rules.disclosure_boundary.contains_protected_p3_payload, false);
});


test('rules prohibit semantic substitution without inventing unavailable facts', () => {
  assert.equal(rules.global_rule.semantic_equivalence_satisfies_exact_contract, false);
  assert.equal(rules.global_rule.paraphrase_allowed_for_governed_fields, false);
  assert.equal(rules.global_rule.normalization_allowed_for_governed_fields, false);
  assert.equal(rules.global_rule.near_synonym_substitution_allowed, false);
  assert.equal(rules.authority_resolution_rules.invent_missing_value, false);
  assert.equal(rules.authority_resolution_rules.infer_hidden_target_mapping, false);
  assert.equal(rules.authority_resolution_rules.prefer_exact_explicit_authority_value, true);
  assert.equal(
    rules.authority_resolution_rules
      .report_unresolved_ambiguity_instead_of_silent_substitution,
    true
  );
});


test('visibility, retry, spending, and economics remain blocked', () => {
  const hidden = manifest.future_model_visibility_boundary.always_hidden_from_p1_p2;
  assert.equal(hidden.includes('completed target representation'), true);
  assert.equal(hidden.includes('target field-to-value mapping'), true);
  assert.equal(hidden.includes('Study 005 model output'), true);
  assert.equal(hidden.includes('Study 005 semantic adjudication'), true);
  assert.equal(manifest.quality_and_economic_boundary.complete_quality_gate_required, true);
  assert.equal(manifest.quality_and_economic_boundary.semantic_similarity_changes_exact_pass, false);
  assert.equal(manifest.quality_and_economic_boundary.automatic_retry_allowed, false);
  assert.equal(manifest.quality_and_economic_boundary.p2_allowed_before_accepted_p1, false);
  assert.equal(
    manifest.quality_and_economic_boundary
      .p3_payment_allowed_before_quality_equivalent_baseline,
    false
  );
  assert.equal(manifest.quality_and_economic_boundary.economic_comparison_allowed_now, false);
  assert.deepEqual(manifest.actions_performed, {
    api_call: false,
    retry: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    website_mutation: false,
    pricing_mutation: false
  });
});


test('design preserves one-shot feasibility and cross-study boundaries', () => {
  const design = readText('./WORKLOAD-CD-20260830-006.md');
  assert.match(design, /one explicitly labeled initial-feasibility observation/);
  assert.match(design, /no automatic retry/);
  assert.match(design, /requester costs are not directly interchangeable/);
  assert.match(design, /Do not tune the successor to force governed retrieval to win/);
  assert.equal(manifest.sampling_boundary.automatic_retry_allowed, false);
  assert.equal(manifest.sampling_boundary.one_observation_sufficient_for_stable_cost_calibration, false);
  assert.equal(manifest.sampling_boundary.repeated_accepted_observations_required_for_calibration, true);
  assert.equal(manifest.cross_study_boundary.raw_requester_costs_directly_interchangeable, false);
  assert.equal(manifest.next_artifact.api_call_allowed, false);
  assert.equal(manifest.next_artifact.retry_allowed, false);
  assert.equal(manifest.next_artifact.p2_probe_allowed, false);
  assert.equal(manifest.next_artifact.p3_payment_allowed, false);
});
