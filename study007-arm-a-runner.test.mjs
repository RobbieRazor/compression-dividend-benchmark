import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*m/g, '');
const metadata = json('./data/CD-WORKLOAD-20260831-007-arm-a-runner-metadata.json');
const provider = json('./data/CD-WORKLOAD-20260831-007-arm-a-provider.json');
const preregistration = json('./data/CD-WORKLOAD-20260831-007-arm-a-preregistration-manifest.json');
const taskMetadata = json('./data/CD-WORKLOAD-20260831-007-arm-a-task-metadata.json');

test('Arm A runner pins its implementation and preregistration', () => {
  assert.equal(metadata.status, 'ARM_A_RUNNER_FROZEN_PREFLIGHT_PASS_MEASUREMENT_CREDENTIAL_BLOCKED');
  assert.equal(metadata.runner.sha256, sha256('./scripts/run-study007-arm-a.mjs'));
  assert.equal(metadata.preregistration_manifest.sha256, sha256('./data/CD-WORKLOAD-20260831-007-arm-a-preregistration-manifest.json'));
  assert.equal(preregistration.arm_state.arm_a_preregistered, true);
  assert.equal(preregistration.arm_state.arm_a_runner_frozen, false);
});

test('runner preflight reproduces the frozen request without API activity', () => {
  const result = spawnSync('node', ['scripts/run-study007-arm-a.mjs', '--preflight'], { cwd: new URL('.', import.meta.url), encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' } });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = stripAnsi(result.stdout);
  assert.match(output, /OBSERVATION_RESERVED: CD-007-P1A-0001/);
  assert.match(output, /MODEL_VISIBLE_INPUT_COUNT: 6/);
  assert.match(output, /MODEL_INPUT_BYTES: 179953/);
  assert.match(output, new RegExp('MODEL_INPUT_SHA256: ' + metadata.frozen_request.model_input_sha256));
  assert.match(output, /NEUTRAL_SOURCE_GROUNDING_RULES_VISIBLE: true/);
  assert.match(output, /ARM_B_MEASUREMENT_ALLOWED: false/);
  assert.match(output, /API_CALL_PERFORMED: false/);
  assert.match(output, /X402_PAYMENT_PERFORMED: false/);
  assert.match(output, /PREFLIGHT_PASS: true/);
});

test('runner reads only the six frozen model-visible inputs', () => {
  const runner = readFileSync(new URL('./scripts/run-study007-arm-a.mjs', import.meta.url), 'utf8');
  assert.equal(taskMetadata.model_visible_inputs.length, 6);
  assert.match(runner, /CD-WORKLOAD-20260831-007-neutral-source-grounding-rules\.json/);
  assert.match(runner, /CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules\.json/);
  assert.doesNotMatch(runner, /enriched-biography-target-representation\.json/);
  assert.doesNotMatch(runner, /arm-b-authority-availability-audit\.json/);
  assert.doesNotMatch(runner, /evaluate-study007-arm-a\.py/);
});

test('only reserved Arm A observation 0001 is accepted', () => {
  const result = spawnSync('node', ['scripts/run-study007-arm-a.mjs', '0002'], { cwd: new URL('.', import.meta.url), encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' } });
  assert.equal(result.status, 1);
  assert.match(stripAnsi(result.stderr), /Usage: node scripts\/run-study007-arm-a\.mjs --preflight OR 0001/);
  const reservedMeasurement = new URL('./data/raw/CD-007-P1A-0001-measurement.json', import.meta.url);
  if (existsSync(reservedMeasurement)) {
    const measurement = json('./data/raw/CD-007-P1A-0001-measurement.json');
    assert.equal(measurement.observation_id, 'CD-007-P1A-0001');
    assert.equal(measurement.measurement_valid_for_p1, true);
    assert.equal(measurement.automatic_retry_allowed, false);
    assert.equal(measurement.p2_probe_performed, false);
    assert.equal(measurement.x402_payment_performed, false);
  }
  assert.equal(existsSync(new URL('./data/raw/CD-007-P1A-0002-measurement.json', import.meta.url)), false);
});

test('runner preserves pure recomputation and one-shot boundaries', () => {
  assert.equal(provider.p1_configuration.class, 'PURE_RECOMPUTATION');
  assert.equal(provider.p1_configuration.prompt_cache_mode, 'explicit');
  assert.equal(provider.p1_configuration.explicit_breakpoints, 0);
  assert.equal(provider.p1_configuration.prompt_cache_key, null);
  assert.equal(metadata.feasibility_boundary.planned_observation_count, 1);
  assert.equal(metadata.feasibility_boundary.automatic_retry_allowed, false);
  assert.equal(metadata.feasibility_boundary.passing_observation_establishes_stable_cost_calibration, false);
});

test('Arm B, retry, P2, P3, and economics remain blocked', () => {
  assert.equal(metadata.arm_boundary.arm_b_measurement_allowed, false);
  assert.equal(metadata.next_action.automatic_retry_allowed, false);
  assert.equal(metadata.next_action.p2_allowed_before_p1_quality_pass, false);
  assert.equal(metadata.next_action.p3_payment_allowed, false);
  assert.equal(provider.p2_eligibility_configuration.accepted_p1_required_before_probe, true);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
  assert.equal(metadata.measurement_state.economic_comparison_performed, false);
});
