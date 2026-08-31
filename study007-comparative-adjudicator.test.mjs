import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const metadata = json('./data/CD-WORKLOAD-20260831-007-comparative-adjudicator-metadata.json');
const result = json('./data/raw/CD-007-comparative-adjudication.json');

test('comparative adjudicator and completed result are pinned exactly', () => {
  assert.equal(sha256(`./${metadata.script.path}`), metadata.script.sha256);
  assert.equal(sha256(`./${metadata.result.path}`), metadata.result.sha256);
  for (const artifact of Object.values(result.frozen_inputs)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256);
  }
});

test('comparative result freezes zero instruction gain and Arm B ceiling', () => {
  assert.equal(result.arm_a_observed_result.relationship_target_fact_pass_count, 38);
  assert.equal(result.arm_a_observed_result.relationship_target_fact_count, 52);
  assert.equal(result.arm_a_vs_study006.relationship_exact_fact_gain, 0);
  assert.equal(result.arm_a_vs_study006.instruction_intervention_improved_relationship_exactness, false);
  assert.equal(result.arm_b_premeasurement_result.exact_fact_available_count, 46);
  assert.equal(result.arm_b_premeasurement_result.exact_fact_count, 52);
  assert.equal(result.arm_b_premeasurement_result.measurement_performed, false);
  assert.equal(result.comparative_finding.refreshed_authority_availability_gain, 8);
});

test('adjudicator preflight remains deterministic and read-only after completion', () => {
  const before = sha256(`./${metadata.result.path}`);
  const run = spawnSync('python3', ['scripts/adjudicate-study007.py', '--preflight'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /ARM_A_GAIN_VS_STUDY006: 0/);
  assert.match(run.stdout, /ARM_B_AUTHORITY_CEILING: 46\/52/);
  assert.match(run.stdout, /ADJUDICATION_FILE_CREATED: False/);
  assert.match(run.stdout, /PREFLIGHT_PASS: True/);
  assert.equal(sha256(`./${metadata.result.path}`), before);
});

test('quality failure and downstream blocks remain unchanged', () => {
  assert.equal(result.arm_a_observed_result.primary_quality_gate_pass, false);
  assert.equal(result.comparative_finding.quality_equivalent_p1_established, false);
  assert.equal(result.comparative_finding.stable_cost_calibration_established, false);
  assert.equal(result.comparative_finding.economic_comparison_permitted, false);
  assert.equal(result.interpretation_boundary.quality_result_modified, false);
  assert.equal(result.interpretation_boundary.production_tuning_to_hidden_target_allowed, false);
  assert.deepEqual(metadata.actions_performed, {
    model_api_call: false,
    automatic_retry: false,
    arm_b_measurement: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false
  });
});
