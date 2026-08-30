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
  './data/CD-WORKLOAD-20260829-004-p1-runner-metadata.json'
);
const provider = readJson('./data/CD-WORKLOAD-20260829-004-provider.json');
const taskMetadata = readJson(
  './data/CD-WORKLOAD-20260829-004-task-metadata.json'
);


test('P1 runner metadata pins the exact runner and preregistration', () => {
  assert.equal(
    runnerMetadata.status,
    'P1_RUNNER_FROZEN_PREFLIGHT_PASS_MEASUREMENT_CREDENTIAL_BLOCKED'
  );
  assert.equal(
    runnerMetadata.runner.sha256,
    sha256('./scripts/run-study004-p1.mjs')
  );
  assert.equal(
    runnerMetadata.preregistration_manifest.sha256,
    sha256('./data/CD-WORKLOAD-20260829-004-preregistration-manifest.json')
  );
});


test('runner preflight reproduces the frozen request without API activity', () => {
  const result = spawnSync(
    'node',
    ['scripts/run-study004-p1.mjs', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const stdout = stripAnsi(result.stdout);
  assert.match(stdout, /PREFLIGHT_PASS: true/);
  assert.match(stdout, /API_CALL_PERFORMED: false/);
  assert.match(stdout, /P2_PROBE_PERFORMED: false/);
  assert.match(stdout, /X402_PAYMENT_PERFORMED: false/);
  assert.match(
    stdout,
    new RegExp('MODEL_INPUT_SHA256: ' + runnerMetadata.frozen_request.model_input_sha256)
  );
});


test('P1 configuration is pure recomputation', () => {
  assert.equal(provider.p1_configuration.class, 'PURE_RECOMPUTATION');
  assert.equal(provider.p1_configuration.prompt_cache_mode, 'explicit');
  assert.equal(provider.p1_configuration.explicit_breakpoints, 0);
  assert.equal(provider.p1_configuration.prompt_cache_key, null);
  assert.equal(runnerMetadata.frozen_request.prompt_cache_mode, 'explicit');
  assert.equal(runnerMetadata.frozen_request.explicit_cache_breakpoints, 0);
});


test('runner model input excludes evaluator-only artifacts', () => {
  const runner = readFileSync(
    new URL('./scripts/run-study004-p1.mjs', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(
    runner,
    /CD-WORKLOAD-20260829-004-enriched-biography-target-representation\.json/
  );
  assert.doesNotMatch(
    runner,
    /CD-WORKLOAD-20260829-004-quality-contract\.json/
  );
  assert.doesNotMatch(runner, /evaluate-study004\.py/);
  assert.equal(taskMetadata.model_visible_inputs.length, 3);
  assert.equal(runnerMetadata.visibility_boundary.target_representation_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.quality_contract_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.evaluator_visible, false);
  assert.equal(runnerMetadata.visibility_boundary.protected_p3_payload_visible, false);
});


test('observation 0001 is captured while runner metadata preserves its historical freeze', () => {
  const capturedNames = [
    'response.json',
    'output.json',
    'measurement.json',
    'quality-evaluation.json'
  ];

  for (const suffix of capturedNames) {
    assert.equal(
      existsSync(
        new URL(`./data/raw/CD-004-P1-0001-${suffix}`, import.meta.url)
      ),
      true,
      suffix
    );
  }

  assert.equal(
    existsSync(
      new URL('./data/raw/CD-004-P1-0001-output.txt', import.meta.url)
    ),
    false
  );

  const measurement = readJson(
    './data/raw/CD-004-P1-0001-measurement.json'
  );
  const evaluation = readJson(
    './data/raw/CD-004-P1-0001-quality-evaluation.json'
  );

  assert.equal(measurement.measurement_valid_for_p1, true);
  assert.equal(measurement.api_call_performed, true);
  assert.equal(evaluation.primary_quality_gate_pass, false);
  assert.equal(evaluation.raw_measurement_modified, false);
  assert.equal(runnerMetadata.preflight.api_credential_present, false);
  assert.equal(runnerMetadata.measurement_state.measurement_started, false);
  assert.equal(runnerMetadata.measurement_state.measurement_artifacts_created, false);
});


test('P2 and P3 remain blocked by the runner freeze', () => {
  assert.equal(runnerMetadata.next_action.p2_allowed_before_p1_quality_pass, false);
  assert.equal(runnerMetadata.next_action.p3_payment_allowed, false);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
});
