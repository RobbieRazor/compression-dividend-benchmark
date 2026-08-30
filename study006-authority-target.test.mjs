import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
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


const freeze = readJson(
  './data/CD-WORKLOAD-20260830-006-authority-target-freeze.json'
);
const study005Authority = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-public-authority-package.json'
);
const study005Target = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json'
);
const rules = readJson(
  './data/CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules.json'
);


test('Study 006 freezes exact Study 005 authority, schema, and target reuse', () => {
  assert.equal(
    freeze.status,
    'EXACT_STUDY005_AUTHORITY_SCHEMA_AND_TARGET_REUSE_FROZEN'
  );
  assert.equal(freeze.experimental_isolation.authority_bytes_changed_relative_to_study005, false);
  assert.equal(freeze.experimental_isolation.schema_bytes_changed_relative_to_study005, false);
  assert.equal(freeze.experimental_isolation.target_bytes_changed_relative_to_study005, false);
  assert.equal(freeze.experimental_isolation.target_semantics_changed_relative_to_study005, false);
  assert.equal(freeze.experimental_isolation.new_target_values_added_to_authority, false);
  assert.equal(freeze.experimental_isolation.target_mapping_added_to_model_visible_input, false);
});


test('every frozen artifact is pinned to exact bytes and a full commit', () => {
  const artifacts = [
    ...Object.values(freeze.frozen_design),
    ...Object.values(freeze.exact_reuse_controls),
    ...freeze.model_visible_authority_evidence
  ];

  for (const artifact of artifacts) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.path);
    assert.match(artifact.commit, /^[0-9a-f]{40}$/, artifact.path);
  }
});


test('model-visible authority evidence is byte-identical to Study 005', () => {
  const prior = study005Authority.model_visible_authority_evidence.map((item) => ({
    path: item.path,
    sha256: item.sha256
  }));
  const current = freeze.model_visible_authority_evidence.map((item) => ({
    path: item.path,
    sha256: item.sha256
  }));

  assert.deepEqual(current, prior);
  for (const item of freeze.model_visible_authority_evidence) {
    assert.equal(item.study005_model_visible, true);
    assert.equal(item.study006_future_model_visible, true);
    assert.equal(item.byte_content_changed_for_study006, false);
  }
});


test('target remains the exact hidden Study 005 target', () => {
  const targetControl = freeze.exact_reuse_controls.study005_target;
  assert.equal(targetControl.future_model_visible, false);
  assert.equal(targetControl.byte_content_changed_for_study006, false);
  assert.equal(targetControl.semantic_value_changed_for_study006, false);
  assert.equal(study005Target.status, 'SCHEMA_CONFORMING_INDEPENDENT_PUBLIC_TARGET_FROZEN');
  assert.equal(freeze.model_visibility_boundary.target_visible_to_future_p1_p2, false);
  assert.equal(freeze.model_visibility_boundary.target_metadata_visible_to_future_p1_p2, false);
});


test('neutral rules remain value-free against the reused target', () => {
  const targetStrings = new Set(collectStrings(study005Target));
  const ruleStrings = new Set(collectStrings(rules));
  for (const targetValue of targetStrings) {
    assert.equal(
      ruleStrings.has(targetValue),
      false,
      `Protected target value leaked into neutral rules: ${targetValue}`
    );
  }
  assert.equal(rules.disclosure_boundary.contains_target_payload_values, false);
  assert.equal(rules.disclosure_boundary.contains_target_field_value_mapping, false);
});


test('protected output, live refresh, API, retry, and spending stay excluded', () => {
  assert.deepEqual(freeze.construction_boundary, {
    study005_model_output_read: false,
    study005_quality_evaluation_used: false,
    study005_semantic_adjudication_used_to_change_target: false,
    protected_p3_payload_read: false,
    protected_p3_payload_used: false,
    live_public_source_refresh_performed: false,
    model_api_call_performed: false,
    automatic_retry_performed: false,
    p2_probe_performed: false,
    x402_payment_performed: false,
    production_mutation_performed: false,
    pricing_mutation_performed: false
  });
  assert.equal(freeze.current_state.measurement_authorized, false);
  assert.equal(freeze.current_state.p2_allowed, false);
  assert.equal(freeze.current_state.p3_payment_allowed, false);
  assert.equal(freeze.current_state.economic_comparison_allowed, false);
  assert.equal(freeze.next_artifact.api_call_allowed, false);
  assert.equal(freeze.next_artifact.retry_allowed, false);
  assert.equal(freeze.next_artifact.p2_probe_allowed, false);
  assert.equal(freeze.next_artifact.p3_payment_allowed, false);
});
