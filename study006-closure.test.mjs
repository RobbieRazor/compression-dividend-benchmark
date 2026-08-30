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

const summary = readJson('./data/CD-WORKLOAD-20260830-006-FINAL-SUMMARY.json');
const measurement = readJson('./data/raw/CD-006-P1-0001-measurement.json');
const evaluation = readJson('./data/raw/CD-006-P1-0001-quality-evaluation.json');
const adjudication = readJson('./data/raw/CD-006-P1-0001-canonical-fidelity-adjudication.json');

test('Study 006 closes with bounded gains but without quality equivalence', () => {
  assert.equal(summary.status, 'STUDY_COMPLETE');
  assert.equal(summary.quality_result.schema_pass, true);
  assert.equal(summary.quality_result.subject_pass, true);
  assert.equal(summary.quality_result.retrieval_rights_pass, true);
  assert.equal(summary.quality_result.primary_quality_gate_pass, false);
  assert.equal(summary.best_quality_equivalent_baseline.path, null);
  assert.equal(summary.transition_surface_treatment.classification, 'QUALITY_CENSORED');
});

test('closure reproduces measurement and frozen quality exactly', () => {
  assert.equal(summary.p1_observation.observation_id, measurement.observation_id);
  assert.equal(summary.p1_observation.requester_model_cost_usd, measurement.cost_usd.total_requester_model_cost);
  assert.equal(summary.p1_observation.input_tokens, measurement.usage.input_tokens);
  assert.equal(summary.p1_observation.output_tokens, measurement.usage.output_tokens);
  assert.equal(summary.quality_result.subject_pass, evaluation.result.subject.pass);
  assert.equal(summary.quality_result.relationships_pass_count, evaluation.result.relationships.pass_count);
  assert.equal(summary.quality_result.retrieval_rights_pass, evaluation.result.retrieval_rights.pass);
});

test('closure freezes exact Study 005 to Study 006 gains', () => {
  const result = summary.canonical_fidelity_adjudication;
  assert.equal(result.total_exact_fact_pass_count, 59);
  assert.equal(result.total_exact_fact_count, 73);
  assert.equal(result.total_exact_mismatch_count, 14);
  assert.equal(result.total_exact_fact_gain, 12);
  assert.equal(result.subject_exact_fact_gain, 1);
  assert.equal(result.relationship_exact_fact_gain, 0);
  assert.equal(result.rights_exact_fact_gain, 11);
  assert.equal(result.primary_diagnostic_label, adjudication.primary_diagnostic_label);
  assert.equal(result.frozen_quality_result_modified, false);
});

test('closure pins every declared provenance artifact', () => {
  for (const [role, artifact] of Object.entries(summary.artifact_provenance)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
    assert.match(artifact.latest_commit, /^[0-9a-f]{40}$/, role);
  }
});

test('closure blocks retry, spending, economic claims, and mutation', () => {
  assert.equal(summary.p1_observation.automatic_retry_allowed, false);
  assert.equal(summary.path_treatment.p2.eligibility_probe_performed, false);
  assert.equal(summary.path_treatment.p3.payment_performed, false);
  assert.equal(summary.pricing_and_public_claims.pricing_change_supported, false);
  assert.equal(summary.pricing_and_public_claims.positive_compression_dividend_claim_supported, false);
  for (const value of Object.values(summary.actions_performed_by_closure)) {
    assert.equal(value, false);
  }
});
