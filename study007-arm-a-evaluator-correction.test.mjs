import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const correction = json('./data/CD-WORKLOAD-20260831-007-arm-a-evaluator-runtime-correction.json');

test('runtime correction preserves the original preregistered evaluator', () => {
  assert.equal(sha256(`./${correction.frozen_original.path}`), correction.frozen_original.sha256);
  assert.equal(correction.frozen_original.modified, false);
  assert.equal(sha256(`./${correction.corrected_runtime.path}`), correction.corrected_runtime.sha256);
  assert.notEqual(correction.frozen_original.sha256, correction.corrected_runtime.sha256);
});

test('correction pins unchanged task metadata and quality contract', () => {
  assert.equal(sha256(`./${correction.pinned_controls.task_metadata_path}`), correction.pinned_controls.task_metadata_sha256);
  assert.equal(sha256(`./${correction.pinned_controls.quality_contract_path}`), correction.pinned_controls.quality_contract_sha256);
  assert.equal(Object.values(correction.prohibited_changes).every(Boolean), true);
});

test('corrected evaluator preflight remains deterministic and read-only', () => {
  const result = spawnSync('python3', ['scripts/evaluate-study007-arm-a-runtime-correction.py', '--preflight'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TARGET_FIELDS_REQUIRED: 52/);
  assert.match(result.stdout, /OBSERVATION_READ: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
});

test('corrected evaluator accepts only the reserved Arm A argument', () => {
  for (const argument of ['P1-0001', 'P2-0001', 'P3-0001', 'P1A-0002']) {
    const result = spawnSync('python3', ['scripts/evaluate-study007-arm-a-runtime-correction.py', argument], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
    assert.equal(result.status, 1, argument);
    assert.match(result.stdout, /P1A-0001/, argument);
  }
});

test('correction authorizes no retry or downstream spending', () => {
  assert.equal(correction.authorization.corrected_evaluation_allowed, true);
  assert.equal(correction.authorization.model_retry_allowed, false);
  assert.equal(correction.authorization.arm_b_measurement_allowed, false);
  assert.equal(correction.authorization.p2_probe_allowed, false);
  assert.equal(correction.authorization.p3_payment_allowed, false);
  assert.equal(correction.authorization.economic_comparison_allowed, false);
});
