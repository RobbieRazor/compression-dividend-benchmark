import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}


function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}


const summary = readJson(
  './data/CD-WORKLOAD-20260830-005-FINAL-SUMMARY.json'
);
const measurement = readJson(
  './data/raw/CD-005-P1-0001-measurement.json'
);
const evaluation = readJson(
  './data/raw/CD-005-P1-0001-quality-evaluation.json'
);
const adjudication = readJson(
  './data/raw/CD-005-P1-0001-semantic-adjudication.json'
);


test('Study 005 closes after structural success without quality equivalence', () => {
  assert.equal(summary.status, 'STUDY_COMPLETE');
  assert.equal(
    summary.benchmark_outcome,
    'QUALITY_CENSORED_CANONICAL_VALUE_FIDELITY_FAILURE_AFTER_STRUCTURAL_SUCCESS'
  );
  assert.equal(summary.quality_result.schema_pass, true);
  assert.equal(summary.quality_result.primary_quality_gate_pass, false);
  assert.equal(summary.quality_result.initial_feasibility_established, false);
  assert.equal(summary.quality_result.economic_comparison_permitted, false);
  assert.equal(summary.best_quality_equivalent_baseline.path, null);
  assert.equal(summary.best_quality_equivalent_baseline.cost_usd, null);
  assert.equal(summary.transition_surface_treatment.new_empirical_point_created, false);
  assert.equal(summary.transition_surface_treatment.classification, 'QUALITY_CENSORED');
});


test('closure reproduces the measured P1 and frozen strict quality result', () => {
  assert.equal(summary.p1_observation.observation_id, measurement.observation_id);
  assert.equal(summary.p1_observation.model, measurement.model);
  assert.equal(
    summary.p1_observation.requester_model_cost_usd,
    measurement.cost_usd.total_requester_model_cost
  );
  assert.equal(summary.p1_observation.input_tokens, measurement.usage.input_tokens);
  assert.equal(summary.p1_observation.output_tokens, measurement.usage.output_tokens);
  assert.equal(summary.p1_observation.measurement_valid_for_p1, true);
  assert.equal(summary.p1_observation.accepted_quality_equivalent_task, false);
  assert.equal(summary.quality_result.schema_pass, evaluation.result.schema.pass);
  assert.equal(summary.quality_result.subject_pass, evaluation.result.subject.pass);
  assert.equal(
    summary.quality_result.relationships_pass_count,
    evaluation.result.relationships.pass_count
  );
  assert.equal(
    summary.quality_result.retrieval_rights_pass,
    evaluation.result.retrieval_rights.pass
  );
  assert.equal(summary.quality_result.raw_measurement_modified, false);
});


test('closure records schema success without relaxing canonical fidelity', () => {
  assert.equal(
    summary.semantic_adjudication.primary_diagnostic_label,
    adjudication.primary_diagnostic_label
  );
  assert.equal(
    summary.semantic_adjudication.secondary_diagnostic_label,
    adjudication.secondary_diagnostic_label
  );
  assert.equal(
    summary.semantic_adjudication.schema_and_graph_placement_intervention_succeeded,
    adjudication.structural_intervention_result
      .schema_and_graph_placement_intervention_succeeded
  );
  assert.equal(
    summary.semantic_adjudication.structural_placement_failure_count,
    adjudication.structural_intervention_result.structural_placement_failure_count
  );
  assert.equal(
    summary.semantic_adjudication.provenance_pass_count,
    adjudication.structural_intervention_result.provenance_pass_count
  );
  assert.equal(
    summary.semantic_adjudication.total_exact_fact_pass_count,
    adjudication.exact_value_fidelity.total_exact_fact_pass_count
  );
  assert.equal(
    summary.semantic_adjudication.total_exact_fact_count,
    adjudication.exact_value_fidelity.total_exact_fact_count
  );
  assert.equal(
    summary.semantic_adjudication.total_exact_mismatch_count,
    adjudication.exact_value_fidelity.total_exact_mismatch_count
  );
  assert.equal(
    summary.semantic_adjudication.semantic_rights_boundary_preserved,
    adjudication.rights_adjudication.semantic_rights_boundary_preserved
  );
  assert.equal(summary.semantic_adjudication.frozen_quality_result_modified, false);
});


test('closure pins every declared provenance artifact', () => {
  for (const [role, artifact] of Object.entries(summary.artifact_provenance)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
    assert.match(artifact.latest_commit, /^[0-9a-f]{40}$/, role);
  }
});


test('closure blocks retry, spending, overclaiming, and retroactive changes', () => {
  assert.equal(summary.p1_observation.automatic_retry_allowed, false);
  assert.equal(summary.path_treatment.p2.eligibility_probe_performed, false);
  assert.equal(summary.path_treatment.p2.measurement_performed, false);
  assert.equal(summary.path_treatment.p3.payment_performed, false);
  assert.equal(summary.pricing_and_public_claims.pricing_change_supported, false);
  assert.equal(
    summary.pricing_and_public_claims.website_pricing_change_recommended,
    false
  );
  assert.equal(
    summary.pricing_and_public_claims.positive_compression_dividend_claim_supported,
    false
  );
  assert.equal(summary.actions_performed_by_closure.raw_measurement_modified, false);
  assert.equal(summary.actions_performed_by_closure.quality_evaluation_modified, false);
  assert.equal(summary.actions_performed_by_closure.semantic_adjudication_modified, false);
  assert.equal(summary.actions_performed_by_closure.api_call, false);
  assert.equal(summary.actions_performed_by_closure.retry, false);
  assert.equal(summary.actions_performed_by_closure.p2_probe, false);
  assert.equal(summary.actions_performed_by_closure.x402_payment, false);
  assert.equal(summary.actions_performed_by_closure.economic_comparison, false);
  assert.equal(summary.actions_performed_by_closure.website_mutation, false);
  assert.equal(summary.actions_performed_by_closure.pricing_mutation, false);
});
