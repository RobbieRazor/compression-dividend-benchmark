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
  './data/CD-WORKLOAD-20260830-005-p1-semantic-adjudicator-metadata.json'
);
const evaluation = readJson(
  './data/raw/CD-005-P1-0001-quality-evaluation.json'
);
const record = readJson(
  './data/CD-WORKLOAD-20260830-005-p1-semantic-adjudication-record.json'
);
const adjudication = readJson(
  './data/raw/CD-005-P1-0001-semantic-adjudication.json'
);


test('post-hoc adjudicator pins its implementation and every frozen input', () => {
  assert.equal(
    metadata.status,
    'POST_HOC_SEMANTIC_ADJUDICATOR_FROZEN_BEFORE_EXECUTION'
  );
  assert.equal(
    metadata.adjudicator.sha256,
    sha256('./scripts/adjudicate-study005-p1.py')
  );

  for (const item of metadata.frozen_inputs) {
    assert.equal(sha256(`./${item.path}`), item.sha256, item.role);
  }

  assert.equal(metadata.evidence_commit, '2d8a976');
});


test('completed adjudication is pinned to its frozen inputs and evidence commit', () => {
  assert.equal(record.status, 'POST_HOC_SEMANTIC_ADJUDICATION_RECORDED');
  assert.equal(record.adjudication_artifact.commit, '64c0142');
  assert.equal(
    record.adjudication_artifact.sha256,
    sha256('./data/raw/CD-005-P1-0001-semantic-adjudication.json')
  );
  assert.equal(
    record.frozen_adjudicator_metadata.sha256,
    sha256(
      './data/CD-WORKLOAD-20260830-005-p1-semantic-adjudicator-metadata.json'
    )
  );
  assert.equal(
    record.frozen_quality_evaluation.sha256,
    sha256('./data/raw/CD-005-P1-0001-quality-evaluation.json')
  );
  assert.equal(
    adjudication.primary_diagnostic_label,
    record.primary_diagnostic_label
  );
  assert.equal(
    adjudication.secondary_diagnostic_label,
    record.secondary_diagnostic_label
  );
});


test('completed adjudication records structural success and exact-value failure', () => {
  assert.equal(
    adjudication.structural_intervention_result
      .schema_and_graph_placement_intervention_succeeded,
    true
  );
  assert.equal(
    adjudication.structural_intervention_result.structural_placement_failure_count,
    0
  );
  assert.equal(
    adjudication.structural_intervention_result.provenance_pass_count,
    9
  );
  assert.deepEqual(
    record.exact_value_fidelity,
    {
      subject_fact_pass_count: 7,
      subject_fact_count: 8,
      relationship_target_fact_pass_count: 38,
      relationship_target_fact_count: 52,
      rights_fact_pass_count: 2,
      rights_fact_count: 13,
      total_exact_fact_pass_count: 47,
      total_exact_fact_count: 73,
      total_exact_mismatch_count: 26
    }
  );
  assert.equal(adjudication.target_mismatch_classification.mismatch_count, 15);
  assert.deepEqual(
    adjudication.target_mismatch_classification.category_counts,
    {
      SHORTENED_CANONICAL_IDENTIFIER: 1,
      ONTOLOGY_TYPE_SUBSTITUTION: 5,
      CANONICAL_DESCRIPTOR_PARAPHRASE: 4,
      TRADEMARK_MARK_OMISSION: 5
    }
  );
  assert.equal(
    adjudication.rights_adjudication.semantic_rights_boundary_preserved,
    true
  );
  assert.equal(adjudication.rights_adjudication.frozen_exact_gate_pass, false);
});


test('adjudicator preflight remains read-only after completion', () => {
  const resultPath = new URL(
    './data/raw/CD-005-P1-0001-semantic-adjudication.json',
    import.meta.url
  );
  assert.equal(existsSync(resultPath), true);
  const hashBefore = sha256(
    './data/raw/CD-005-P1-0001-semantic-adjudication.json'
  );

  const result = spawnSync(
    'python3',
    ['scripts/adjudicate-study005-p1.py', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /FROZEN_QUALITY_GATE_PASS: False/);
  assert.match(result.stdout, /SCHEMA_PASS: True/);
  assert.match(result.stdout, /PROVENANCE_PASS: 9\/9/);
  assert.match(result.stdout, /EXACT_FACTS_PASS: 47\/73/);
  assert.match(result.stdout, /EXACT_MISMATCHES: 26/);
  assert.match(result.stdout, /RIGHTS_SEMANTICS_PRESERVED: True/);
  assert.match(result.stdout, /ADJUDICATION_FILE_CREATED: False/);
  assert.match(result.stdout, /QUALITY_RESULT_MODIFIED: False/);
  assert.match(result.stdout, /RETRY_AUTHORIZED: False/);
  assert.match(result.stdout, /P2_PROBE_PERFORMED: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
  assert.equal(existsSync(resultPath), true);
  assert.equal(
    sha256('./data/raw/CD-005-P1-0001-semantic-adjudication.json'),
    hashBefore
  );
});


test('frozen quality result remains failed and economically ineligible', () => {
  assert.deepEqual(metadata.frozen_observed_state, {
    schema_pass: true,
    subject_pass: false,
    relationship_pass_count: 1,
    relationship_count: 9,
    rights_pass: false,
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
  assert.equal(metadata.next_action.quality_result_remains_frozen, true);
  assert.equal(metadata.next_action.retry_allowed, false);
  assert.equal(metadata.next_action.p2_probe_allowed, false);
  assert.equal(metadata.next_action.p3_payment_allowed, false);
  assert.equal(adjudication.frozen_quality_result.primary_quality_gate_pass, false);
  assert.equal(
    adjudication.interpretation_boundary.quality_result_modified,
    false
  );
  assert.equal(adjudication.interpretation_boundary.retry_authorized, false);
  assert.equal(adjudication.interpretation_boundary.p2_probe_authorized, false);
  assert.equal(adjudication.interpretation_boundary.p3_payment_authorized, false);
  assert.equal(
    adjudication.interpretation_boundary.economic_comparison_authorized,
    false
  );
  assert.equal(adjudication.actions_performed.model_api_call, false);
  assert.equal(adjudication.actions_performed.x402_payment, false);
});
