import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
}

const summary = readJson('./data/CD-WORKLOAD-20260831-007-FINAL-SUMMARY.json');
const measurement = readJson('./data/raw/CD-007-P1A-0001-measurement.json');
const evaluation = readJson('./data/raw/CD-007-P1A-0001-quality-evaluation.json');
const audit = readJson('./data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json');
const adjudication = readJson('./data/raw/CD-007-comparative-adjudication.json');

test('Study 007 closes with both arms quality-censored', () => {
  assert.equal(summary.status, 'STUDY_COMPLETE');
  assert.equal(summary.arm_a_quality_result.primary_quality_gate_pass, false);
  assert.equal(summary.arm_b_authority_result.state, 'AVAILABILITY_CENSORED_BEFORE_MEASUREMENT');
  assert.equal(summary.best_quality_equivalent_baseline.path, null);
  assert.equal(summary.transition_surface_treatment.classification, 'QUALITY_CENSORED');
});

test('closure reproduces the measured Arm A result exactly', () => {
  assert.equal(summary.arm_a_observation.observation_id, measurement.observation_id);
  assert.equal(summary.arm_a_observation.requester_model_cost_usd, measurement.cost_usd.total_requester_model_cost);
  assert.equal(summary.arm_a_observation.input_tokens, measurement.usage.input_tokens);
  assert.equal(summary.arm_a_observation.output_tokens, measurement.usage.output_tokens);
  assert.equal(summary.arm_a_quality_result.schema_pass, evaluation.result.schema.pass);
  assert.equal(summary.arm_a_quality_result.subject_pass, evaluation.result.subject.pass);
  assert.equal(summary.arm_a_quality_result.relationships_pass_count, evaluation.result.relationships.pass_count);
  assert.equal(summary.arm_a_quality_result.retrieval_rights_pass, evaluation.result.retrieval_rights.pass);
});

test('closure freezes zero instruction gain and the Arm B authority ceiling', () => {
  assert.equal(summary.arm_a_instruction_effect.relationship_exact_fact_gain, 0);
  assert.equal(summary.arm_a_instruction_effect.study007_arm_a_relationship_target_fact_pass_count, 38);
  assert.equal(summary.arm_b_authority_result.exact_fact_available_count, audit.result.exact_fact_available_count);
  assert.equal(summary.arm_b_authority_result.exact_fact_unavailable_count, 6);
  assert.equal(summary.arm_b_authority_result.measurement_performed, false);
  assert.equal(summary.comparative_adjudication.primary_diagnostic_label, adjudication.comparative_finding.primary_label);
  assert.equal(summary.comparative_adjudication.refreshed_authority_availability_gain, 8);
  assert.equal(summary.comparative_adjudication.frozen_quality_result_modified, false);
});

test('closure pins every declared provenance artifact', () => {
  for (const [role, artifact] of Object.entries(summary.artifact_provenance)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
    assert.match(artifact.latest_commit, /^[0-9a-f]{7,40}$/, role);
  }
});

test('closure blocks measurement retry spending tuning and economic claims', () => {
  assert.equal(summary.arm_a_observation.automatic_retry_allowed, false);
  assert.equal(summary.path_treatment.p1b.measurement_performed, false);
  assert.equal(summary.path_treatment.p2.eligibility_probe_performed, false);
  assert.equal(summary.path_treatment.p3.payment_performed, false);
  assert.equal(summary.pricing_and_public_claims.pricing_change_supported, false);
  assert.equal(summary.pricing_and_public_claims.positive_compression_dividend_claim_supported, false);
  assert.equal(summary.pricing_and_public_claims.negative_compression_dividend_claim_supported_for_study007, false);
  for (const value of Object.values(summary.actions_performed_by_closure)) {
    assert.equal(value, false);
  }
});
