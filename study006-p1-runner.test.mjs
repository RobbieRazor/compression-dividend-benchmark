import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}


function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}


function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}


const runnerMetadata = readJson(
  './data/CD-WORKLOAD-20260830-006-p1-runner-metadata.json'
);
const provider = readJson('./data/CD-WORKLOAD-20260830-006-provider.json');
const taskMetadata = readJson(
  './data/CD-WORKLOAD-20260830-006-task-metadata.json'
);
const preregistration = readJson(
  './data/CD-WORKLOAD-20260830-006-preregistration-manifest.json'
);


test('Study 006 P1 runner metadata pins the exact runner and preregistration', () => {
  assert.equal(
    runnerMetadata.status,
    'P1_RUNNER_FROZEN_PREFLIGHT_PASS_MEASUREMENT_CREDENTIAL_BLOCKED'
  );
  assert.equal(
    runnerMetadata.runner.sha256,
    sha256('./scripts/run-study006-p1.mjs')
  );
  assert.equal(
    runnerMetadata.preregistration_manifest.sha256,
    sha256('./data/CD-WORKLOAD-20260830-006-preregistration-manifest.json')
  );
  assert.equal(
    preregistration.next_artifact.type,
    'P1_RUNNER_AND_SINGLE_INITIAL_FEASIBILITY_MEASUREMENT'
  );
});


test('runner preflight reproduces the exact request without API activity', () => {
  const result = spawnSync(
    'node',
    ['scripts/run-study006-p1.mjs', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = stripAnsi(result.stdout);
  assert.match(stdout, /OBSERVATION_RESERVED: CD-006-P1-0001/);
  assert.match(stdout, /MODEL_VISIBLE_INPUT_COUNT: 5/);
  assert.match(stdout, /MODEL_INPUT_BYTES: 176173/);
  assert.match(
    stdout,
    new RegExp('MODEL_INPUT_SHA256: ' + runnerMetadata.frozen_request.model_input_sha256)
  );
  assert.match(stdout, /NEUTRAL_SCHEMA_VISIBLE: true/);
  assert.match(stdout, /NEUTRAL_PRESERVATION_RULES_VISIBLE: true/);
  assert.match(stdout, /TARGET_VISIBLE: false/);
  assert.match(stdout, /STUDY005_FAILURE_DIAGNOSTICS_VISIBLE: false/);
  assert.match(stdout, /AUTOMATIC_RETRY_ALLOWED: false/);
  assert.match(stdout, /P2_PROBE_PERFORMED: false/);
  assert.match(stdout, /P3_PAYMENT_ALLOWED: false/);
  assert.match(stdout, /API_CALL_PERFORMED: false/);
  assert.match(stdout, /X402_PAYMENT_PERFORMED: false/);
  assert.match(stdout, /PREFLIGHT_PASS: true/);
});


test('P1 configuration is one pure-recomputation feasibility observation', () => {
  assert.equal(provider.p1_configuration.class, 'PURE_RECOMPUTATION');
  assert.equal(provider.p1_configuration.prompt_cache_mode, 'explicit');
  assert.equal(provider.p1_configuration.explicit_breakpoints, 0);
  assert.equal(provider.p1_configuration.prompt_cache_key, null);
  assert.equal(provider.p1_configuration.planned_observations_in_feasibility_phase, 1);
  assert.equal(provider.p1_configuration.automatic_retry_allowed, false);
  assert.equal(runnerMetadata.frozen_request.prompt_cache_mode, 'explicit');
  assert.equal(runnerMetadata.frozen_request.explicit_cache_breakpoints, 0);
  assert.equal(runnerMetadata.feasibility_boundary.planned_observation_count, 1);
  assert.equal(runnerMetadata.feasibility_boundary.automatic_retry_allowed, false);
});


test('runner reads only the five frozen model-visible inputs', () => {
  const runner = readFileSync(
    new URL('./scripts/run-study006-p1.mjs', import.meta.url),
    'utf8'
  );

  assert.equal(taskMetadata.model_visible_inputs.length, 5);
  assert.doesNotMatch(
    runner,
    /CD-WORKLOAD-20260830-006-enriched-biography-target-representation\.json/
  );
  assert.match(
    runner,
    /CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules\.json/
  );
  assert.doesNotMatch(
    runner,
    /CD-WORKLOAD-20260830-006-quality-contract\.json/
  );
  assert.doesNotMatch(runner, /evaluate-study006\.py/);
  assert.doesNotMatch(runner, /CD-005-P1-0001-output\.json/);
  assert.doesNotMatch(runner, /CD-005-P1-0001-quality-evaluation\.json/);
  assert.doesNotMatch(runner, /semantic-adjudication\.json/);
  assert.equal(runnerMetadata.visibility_boundary.neutral_schema_visible, true);
  assert.equal(runnerMetadata.visibility_boundary.neutral_preservation_rules_visible, true);
  assert.equal(runnerMetadata.visibility_boundary.target_representation_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.quality_contract_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.evaluator_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.study005_model_output_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.study005_quality_evaluation_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.study005_semantic_adjudication_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.protected_p3_payload_visible, false);
});


test('only reserved observation 0001 is accepted by the runner', () => {
  const result = spawnSync(
    'node',
    ['scripts/run-study006-p1.mjs', '0002'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8',
      env: { ...process.env, OPENAI_API_KEY: '' }
    }
  );

  assert.equal(result.status, 1);
  assert.match(
    stripAnsi(result.stderr),
    /Usage: node scripts\/run-study006-p1\.mjs --preflight OR 0001/
  );
});


test('observation 0001 is captured while runner metadata preserves its historical freeze', () => {
  for (const suffix of [
    'response.json',
    'output.json',
    'measurement.json',
    'quality-evaluation.json'
  ]) {
    assert.equal(
      existsSync(new URL(`./data/raw/CD-006-P1-0001-${suffix}`, import.meta.url)),
      true,
      suffix
    );
  }
  assert.equal(
    existsSync(new URL('./data/raw/CD-006-P1-0001-output.txt', import.meta.url)),
    false
  );
  const measurement = readJson('./data/raw/CD-006-P1-0001-measurement.json');
  const evaluation = readJson(
    './data/raw/CD-006-P1-0001-quality-evaluation.json'
  );
  assert.equal(measurement.measurement_valid_for_p1, true);
  assert.equal(measurement.api_call_performed, true);
  assert.equal(measurement.p2_probe_performed, false);
  assert.equal(measurement.x402_payment_performed, false);
  assert.equal(evaluation.primary_quality_gate_pass, false);
  assert.equal(evaluation.raw_measurement_modified, false);
  assert.equal(runnerMetadata.measurement_state.measurement_started, false);
  assert.equal(runnerMetadata.measurement_state.measurement_artifacts_created, false);
  assert.equal(runnerMetadata.measurement_state.quality_evaluation_started, false);
});


test('P2, P3, retry, and economics remain blocked by runner freeze', () => {
  assert.equal(runnerMetadata.next_action.p2_allowed_before_p1_quality_pass, false);
  assert.equal(runnerMetadata.next_action.p3_payment_allowed, false);
  assert.equal(runnerMetadata.next_action.automatic_retry_allowed, false);
  assert.equal(provider.p2_eligibility_configuration.accepted_p1_required_before_probe, true);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
  assert.equal(runnerMetadata.measurement_state.p2_probe_started, false);
  assert.equal(runnerMetadata.measurement_state.p3_payment_performed, false);
  assert.equal(runnerMetadata.measurement_state.economic_comparison_performed, false);
});
