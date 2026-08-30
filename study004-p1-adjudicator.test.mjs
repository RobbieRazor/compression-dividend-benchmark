import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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


const metadata = readJson(
  './data/CD-WORKLOAD-20260829-004-p1-structural-adjudicator.json'
);


test('post-hoc adjudicator pins its script and every frozen input', () => {
  assert.equal(
    metadata.status,
    'POST_HOC_STRUCTURAL_ADJUDICATOR_FROZEN_PRE_EXECUTION'
  );
  assert.equal(metadata.design_timing.post_hoc, true);
  assert.equal(
    metadata.design_timing.designed_after_observation_and_frozen_evaluation,
    true
  );
  assert.equal(
    metadata.adjudicator.sha256,
    sha256('./scripts/adjudicate-study004-p1.py')
  );

  for (const artifact of metadata.frozen_inputs) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
  }
});


test('adjudicator preflight reproduces frozen counts without writing an artifact', () => {
  const result = spawnSync(
    'python3',
    ['scripts/adjudicate-study004-p1.py', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FAILED_CONTRACT_CRITERIA: 9/);
  assert.match(result.stdout, /EXACT_VALUES_PRESENT_IN_OUTPUT: 8/);
  assert.match(result.stdout, /MODEL_VISIBLE_AUTHORITY_SUPPORT: 9/);
  assert.match(result.stdout, /ADJUDICATION_FILE_CREATED: False/);
  assert.match(result.stdout, /QUALITY_RESULT_MODIFIED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
  assert.equal(
    existsSync(
      new URL(
        './data/raw/CD-004-P1-0001-structural-adjudication.json',
        import.meta.url
      )
    ),
    false
  );
});


test('adjudicator self-test is local and deterministic', () => {
  const result = spawnSync(
    'python3',
    ['scripts/adjudicate-study004-p1.py', '--self-test'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /STUDY004_P1_ADJUDICATOR_SELF_TEST_PASS: true/);
  assert.match(result.stdout, /API_CALL_PERFORMED: false/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: false/);
});


test('adjudicator cannot relax quality or authorize downstream spending', () => {
  assert.equal(
    metadata.interpretation_boundary.quality_result_may_be_modified,
    false
  );
  assert.equal(
    metadata.interpretation_boundary.economic_comparison_may_be_performed,
    false
  );
  assert.equal(metadata.interpretation_boundary.p2_probe_allowed, false);
  assert.equal(metadata.interpretation_boundary.p3_payment_allowed, false);
  assert.equal(metadata.interpretation_boundary.new_api_measurement_allowed, false);

  const script = readText('./scripts/adjudicate-study004-p1.py');
  assert.doesNotMatch(script, /OPENAI_API_KEY/);
  assert.doesNotMatch(script, /requests\s*\./);
  assert.doesNotMatch(script, /urllib\s*\./);
  assert.doesNotMatch(script, /subprocess\s*\./);
  assert.doesNotMatch(script, /socket\s*\./);
});
