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


const metadata = readJson(
  './data/CD-WORKLOAD-20260830-006-p1-canonical-fidelity-adjudicator-metadata.json'
);
const evaluation = readJson(
  './data/raw/CD-006-P1-0001-quality-evaluation.json'
);


test('Study 006 post-hoc adjudicator pins its implementation and frozen evidence', () => {
  assert.equal(
    metadata.status,
    'POST_HOC_CANONICAL_FIDELITY_ADJUDICATOR_FROZEN_BEFORE_EXECUTION'
  );
  assert.equal(metadata.evidence_commit, '1d27c73');
  assert.equal(
    metadata.adjudicator.sha256,
    sha256('./scripts/adjudicate-study006-p1.py')
  );
  for (const item of metadata.frozen_inputs) {
    assert.equal(sha256(`./${item.path}`), item.sha256, item.role);
  }
});


test('adjudicator preflight reproduces exact cross-study gains without writing', () => {
  const resultPath = new URL(
    './data/raw/CD-006-P1-0001-canonical-fidelity-adjudication.json',
    import.meta.url
  );
  assert.equal(existsSync(resultPath), false);
  const result = spawnSync(
    'python3',
    ['scripts/adjudicate-study006-p1.py', '--preflight'],
    { cwd: new URL('.', import.meta.url), encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FROZEN_QUALITY_GATE_PASS: False/);
  assert.match(result.stdout, /EXACT_FACTS_PASS: 59\/73/);
  assert.match(result.stdout, /EXACT_MISMATCHES: 14/);
  assert.match(result.stdout, /SUBJECT_EXACT_FACT_GAIN_VS_STUDY005: 1/);
  assert.match(result.stdout, /RELATIONSHIP_EXACT_FACT_GAIN_VS_STUDY005: 0/);
  assert.match(result.stdout, /QUALITY_RESULT_MODIFIED: False/);
  assert.match(result.stdout, /RETRY_AUTHORIZED: False/);
  assert.match(result.stdout, /P2_PROBE_PERFORMED: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
  assert.equal(existsSync(resultPath), false);
});


test('frozen failed quality result remains economically ineligible', () => {
  assert.deepEqual(metadata.frozen_observed_state, {
    schema_pass: true,
    subject_pass: true,
    relationship_pass_count: 1,
    relationship_count: 9,
    rights_pass: true,
    primary_quality_gate_pass: false,
    initial_feasibility_established: false,
    stable_cost_calibration_established: false,
    economic_comparison_permitted: false
  });
  assert.equal(evaluation.primary_quality_gate_pass, false);
  assert.equal(evaluation.initial_feasibility_established, false);
  assert.equal(evaluation.stable_cost_calibration_established, false);
  assert.equal(evaluation.economic_comparison_permitted_for_this_observation, false);
});


test('adjudicator cannot relax quality or authorize downstream activity', () => {
  assert.equal(metadata.adjudication_scope.modify_frozen_quality_result, false);
  assert.equal(metadata.adjudication_scope.authorize_retry, false);
  assert.equal(metadata.adjudication_scope.authorize_p2_probe, false);
  assert.equal(metadata.adjudication_scope.authorize_p3_payment, false);
  assert.equal(metadata.adjudication_scope.perform_economic_comparison, false);
  assert.equal(metadata.preflight.model_api_call_allowed, false);
  assert.equal(metadata.preflight.provider_cache_probe_allowed, false);
  assert.equal(metadata.preflight.x402_payment_allowed, false);
  assert.equal(metadata.preflight.production_mutation_allowed, false);
});
