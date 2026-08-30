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
  './data/CD-WORKLOAD-20260829-004-FINAL-SUMMARY.json'
);
const measurement = readJson(
  './data/raw/CD-004-P1-0001-measurement.json'
);
const evaluation = readJson(
  './data/raw/CD-004-P1-0001-quality-evaluation.json'
);
const adjudication = readJson(
  './data/raw/CD-004-P1-0001-structural-adjudication.json'
);


test('Study 004 closes as quality-censored without an economic comparison', () => {
  assert.equal(summary.status, 'STUDY_COMPLETE');
  assert.equal(
    summary.benchmark_outcome,
    'QUALITY_CENSORED_STRUCTURAL_FIDELITY_FAILURE'
  );
  assert.equal(summary.quality_result.primary_quality_gate_pass, false);
  assert.equal(summary.quality_result.economic_comparison_permitted, false);
  assert.equal(summary.best_quality_equivalent_baseline.path, null);
  assert.equal(summary.best_quality_equivalent_baseline.cost_usd, null);
  assert.equal(summary.transition_surface_treatment.new_empirical_point_created, false);
  assert.equal(
    summary.transition_surface_treatment.new_transition_threshold_established,
    false
  );
  assert.equal(summary.transition_surface_treatment.classification, 'QUALITY_CENSORED');
});


test('closure reproduces the measured P1 and frozen quality result exactly', () => {
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


test('closure reproduces the structural adjudication without relaxing quality', () => {
  assert.equal(
    summary.structural_adjudication.primary_diagnostic_label,
    adjudication.primary_diagnostic_label
  );
  assert.equal(
    summary.structural_adjudication.failed_contract_criterion_count,
    adjudication.summary_counts.failed_contract_criterion_count
  );
  assert.equal(
    summary.structural_adjudication.model_visible_authority_supported_count,
    adjudication.summary_counts
      .exact_expected_value_present_in_model_visible_authority_count
  );
  assert.equal(
    summary.structural_adjudication.exact_value_present_anywhere_in_output_count,
    adjudication.summary_counts.exact_value_present_anywhere_in_output_count
  );
  assert.equal(
    summary.structural_adjudication.local_alias_or_location_failure_count,
    adjudication.summary_counts
      .exact_value_local_but_contract_location_or_alias_failed_count
  );
  assert.equal(
    summary.structural_adjudication.relocated_exact_value_count,
    adjudication.summary_counts.exact_value_relocated_elsewhere_in_output_count
  );
  assert.equal(
    summary.structural_adjudication.exact_value_absent_from_output_count,
    adjudication.summary_counts.exact_value_absent_from_output_count
  );
  assert.equal(summary.structural_adjudication.frozen_quality_result_modified, false);
});


test('closure pins every declared provenance artifact', () => {
  for (const [role, artifact] of Object.entries(summary.artifact_provenance)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
    assert.match(artifact.latest_commit, /^[0-9a-f]{40}$/, role);
  }
});


test('closure blocks spending, overclaiming, and retroactive changes', () => {
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
  assert.equal(
    summary.actions_performed_by_closure.structural_adjudication_modified,
    false
  );
  assert.equal(summary.actions_performed_by_closure.api_call, false);
  assert.equal(summary.actions_performed_by_closure.p2_probe, false);
  assert.equal(summary.actions_performed_by_closure.x402_payment, false);
  assert.equal(summary.actions_performed_by_closure.website_mutation, false);
  assert.equal(summary.actions_performed_by_closure.pricing_mutation, false);
});
