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
const record = readJson(
  './data/CD-WORKLOAD-20260829-004-p1-structural-adjudication-record.json'
);
const adjudication = readJson(
  './data/raw/CD-004-P1-0001-structural-adjudication.json'
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


test('completed adjudication is pinned to its frozen inputs and evidence commit', () => {
  assert.equal(
    record.status,
    'POST_HOC_STRUCTURAL_ADJUDICATION_RECORDED'
  );
  assert.equal(record.adjudication_artifact.commit, 'cb49d2c');
  assert.equal(
    record.adjudication_artifact.sha256,
    sha256('./data/raw/CD-004-P1-0001-structural-adjudication.json')
  );
  assert.equal(
    record.frozen_adjudicator_metadata.sha256,
    sha256('./data/CD-WORKLOAD-20260829-004-p1-structural-adjudicator.json')
  );
  assert.equal(
    record.frozen_quality_evaluation.sha256,
    sha256('./data/raw/CD-004-P1-0001-quality-evaluation.json')
  );
  assert.equal(
    adjudication.primary_diagnostic_label,
    'STRUCTURAL_FIDELITY_FAILURE_WITH_SINGLE_EXACT_IDENTIFIER_LOSS'
  );
  assert.deepEqual(adjudication.summary_counts, record.summary_counts);
  assert.deepEqual(
    adjudication.summary_counts,
    metadata.frozen_post_hoc_expectations
  );
});


test('completed adjudication classifies all nine failed contract criteria', () => {
  const results = adjudication.failed_criterion_results;
  const classificationCount = (classification) =>
    results.filter((item) => item.classification === classification).length;

  assert.equal(results.length, 9);
  assert.equal(
    results.filter(
      (item) => item.exact_expected_value_present_in_model_visible_authority
    ).length,
    9
  );
  assert.equal(
    results.filter((item) => item.exact_value_present_anywhere_in_output).length,
    8
  );
  assert.equal(
    classificationCount(
      'EXACT_VALUE_LOCAL_BUT_CONTRACT_LOCATION_OR_ALIAS_FAILED'
    ),
    5
  );
  assert.equal(
    classificationCount('EXACT_VALUE_RELOCATED_ELSEWHERE_IN_OUTPUT'),
    3
  );
  assert.equal(
    classificationCount('EXACT_VALUE_ABSENT_SUFFIX_ONLY_IDENTIFIER_OBSERVED'),
    1
  );

  const exactLoss = results.find(
    (item) => item.classification
      === 'EXACT_VALUE_ABSENT_SUFFIX_ONLY_IDENTIFIER_OBSERVED'
  );
  assert.equal(exactLoss.criterion_id, 'SUBJECT.canonical_plate_id');
});


test('adjudicator preflight remains read-only after completion', () => {
  assert.equal(
    existsSync(
      new URL(
        './data/raw/CD-004-P1-0001-structural-adjudication.json',
        import.meta.url
      )
    ),
    true
  );
  const hashBefore = sha256(
    './data/raw/CD-004-P1-0001-structural-adjudication.json'
  );
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
  assert.match(result.stdout, /QUALITY_RESULT_MODIFIED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
  assert.equal(
    sha256('./data/raw/CD-004-P1-0001-structural-adjudication.json'),
    hashBefore
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
  assert.equal(adjudication.frozen_quality_result.primary_quality_gate_pass, false);
  assert.equal(adjudication.frozen_quality_result.quality_result_modified, false);
  assert.equal(adjudication.study_boundary.quality_censored, true);
  assert.equal(adjudication.study_boundary.p2_probe_allowed, false);
  assert.equal(adjudication.study_boundary.p3_payment_allowed, false);
  assert.equal(adjudication.study_boundary.economic_comparison_allowed, false);
  assert.equal(adjudication.api_call_performed, false);
  assert.equal(adjudication.x402_payment_performed, false);

  const script = readText('./scripts/adjudicate-study004-p1.py');
  assert.doesNotMatch(script, /OPENAI_API_KEY/);
  assert.doesNotMatch(script, /requests\s*\./);
  assert.doesNotMatch(script, /urllib\s*\./);
  assert.doesNotMatch(script, /subprocess\s*\./);
  assert.doesNotMatch(script, /socket\s*\./);
});
