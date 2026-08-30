import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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


const quality = readJson('./data/CD-WORKLOAD-20260830-006-quality-contract.json');
const metadata = readJson('./data/CD-WORKLOAD-20260830-006-task-metadata.json');
const provider = readJson('./data/CD-WORKLOAD-20260830-006-provider.json');
const manifest = readJson('./data/CD-WORKLOAD-20260830-006-preregistration-manifest.json');
const target = readJson('./data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json');


test('preregistration pins every Study 006 premeasurement artifact', () => {
  assert.equal(
    manifest.status,
    'QUALITY_TASK_VISIBILITY_PROVIDER_AND_EVALUATOR_FROZEN_PRE_MEASUREMENT'
  );
  for (const artifact of manifest.artifacts) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
  }
  assert.equal(manifest.frozen_state.evaluator_frozen, true);
  assert.equal(manifest.frozen_state.runner_frozen, false);
  assert.equal(manifest.frozen_state.p1_measurement_started, false);
  assert.equal(manifest.frozen_state.automatic_retry_performed, false);
});


test('quality contract reuses the exact target and does not relax Study 005', () => {
  assert.equal(quality.target_representation.sha256, sha256(quality.target_representation.path));
  assert.equal(quality.target_representation.changed_relative_to_study005, false);
  assert.equal(quality.predecessor_quality_contract.gate_relaxed, false);
  assert.equal(quality.predecessor_quality_contract.target_changed, false);
  assert.equal(quality.gate_summary.same_target_and_gate_as_study005, true);
  assert.equal(quality.comparison_model.semantic_equivalence_credited_for_exact_value, false);
  assert.equal(quality.comparison_model.omitted_meaningful_marks_credited, false);
  assert.equal(quality.comparison_model.shortened_identifiers_credited, false);
  assert.equal(quality.comparison_model.ontology_substitutions_credited, false);
  assert.equal(quality.comparison_model.paraphrased_descriptors_credited, false);
  assert.equal(quality.comparison_model.semantically_equivalent_rights_credited, false);
  assert.equal(target.target.relationships.length, 9);
  assert.equal(
    target.target.relationships.reduce((sum, item) => sum + Object.keys(item.target).length, 0),
    52
  );
});


test('neutral task adds preservation instructions without protected values', () => {
  const task = readText('./prompts/CD-WORKLOAD-20260830-006-neutral-task.txt');
  assert.match(task, /complete authority-supported identifier/);
  assert.match(task, /Unicode and trademark marks/);
  assert.match(task, /exact authority-supported ontology token/);
  assert.match(task, /Semantically similar wording does not satisfy/);
  assert.doesNotMatch(task, /robbie-george#robbie-george-biography-plate/);
  assert.doesNotMatch(task, /ProfilePage/);
  assert.doesNotMatch(task, /0\.9-draft/);
  assert.doesNotMatch(task, /0\.025/);
  assert.doesNotMatch(task, /25000/);
  assert.doesNotMatch(task, /CD006-QC-1\.0/);
  assert.doesNotMatch(task, /SHORTENED_CANONICAL_IDENTIFIER/);
  assert.doesNotMatch(task, /TRADEMARK_MARK_OMISSION/);
});


test('model-visible input composition is exactly reproducible', () => {
  const read = (path) => readText(path).trim();
  const d = provider.request_input_delimiters;
  const input =
    read('./prompts/CD-WORKLOAD-20260830-006-neutral-task.txt') +
    '\n\n' + d.neutral_schema_begin +
    '\n\n' + read('./data/CD-WORKLOAD-20260830-005-neutral-schema.json') +
    '\n\n' + d.neutral_schema_end +
    '\n\n' + d.preservation_rules_begin +
    '\n\n' + read('./data/CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules.json') +
    '\n\n' + d.preservation_rules_end +
    '\n\n' + d.public_authority_begin +
    '\n\n' + read('./data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json') +
    '\n\n' + d.public_authority_end +
    '\n\n' + d.inherited_authority_begin +
    '\n\n' + read('./data/CD-WORKLOAD-20260829-002-public-authority-sources.json') +
    '\n\n' + d.inherited_authority_end;
  const hash = createHash('sha256').update(input).digest('hex');

  assert.equal(metadata.model_visible_inputs.length, 5);
  assert.equal(Buffer.byteLength(input), metadata.model_visible_input_composition.byte_count);
  assert.equal(hash, metadata.model_visible_input_composition.sha256);
  for (const item of metadata.model_visible_inputs) {
    assert.equal(sha256(`./${item.path}`), item.sha256, item.role);
  }
});


test('only the value-free lexical intervention changes the Study 005 boundary', () => {
  const unchanged = metadata.model_visible_inputs.filter(
    (item) => item.introduced_relative_to_study005 === false
  );
  assert.equal(unchanged.length, 3);
  assert.equal(
    unchanged.every((item) => item.byte_content_changed_relative_to_study005 === false),
    true
  );
  assert.equal(manifest.experimental_control.study005_schema_bytes_preserved, true);
  assert.equal(manifest.experimental_control.study005_authority_bytes_preserved, true);
  assert.equal(manifest.experimental_control.study005_target_bytes_preserved, true);
  assert.equal(manifest.experimental_control.protected_target_values_added_to_model_input, false);
  assert.equal(manifest.experimental_control.target_mapping_added_to_model_input, false);
});


test('deterministic evaluator preflight passes without observation or external action', () => {
  const result = spawnSync('python3', ['scripts/evaluate-study006.py', '--preflight'], {
    cwd: new URL('.', import.meta.url),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TARGET_FIELDS_REQUIRED: 52/);
  assert.match(result.stdout, /CANONICAL_PASS_FIXTURE: True/);
  assert.match(result.stdout, /MISSING_RELATIONSHIP_REJECTED: True/);
  assert.match(result.stdout, /RELOCATED_VALUE_REJECTED: True/);
  assert.match(result.stdout, /OBSERVATION_READ: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
});


test('one-shot feasibility, retry, P2, P3, and economics remain frozen', () => {
  assert.equal(provider.p1_configuration.planned_observations_in_feasibility_phase, 1);
  assert.equal(provider.p1_configuration.automatic_retry_allowed, false);
  assert.equal(metadata.feasibility_boundary.one_pass_establishes_stable_cost_calibration, false);
  assert.equal(metadata.feasibility_boundary.rejected_observation_cost_eligible_as_baseline, false);
  assert.equal(provider.p2_eligibility_configuration.accepted_p1_required_before_probe, true);
  assert.equal(provider.p2_eligibility_configuration.synthetic_cache_hit_allowed, false);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
  assert.equal(manifest.payment_gate.p2_probe_allowed_now, false);
  assert.equal(manifest.payment_gate.p3_payment_allowed_now, false);
  assert.equal(manifest.payment_gate.economic_comparison_allowed_now, false);
  assert.deepEqual(manifest.actions_performed, {
    model_api_call: false,
    automatic_retry: false,
    provider_cache_probe: false,
    x402_payment: false,
    economic_comparison: false,
    production_pricing_change: false,
    website_change: false
  });
});
