import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');

const summary = readJson('./data/CD-WORKLOAD-20260831-008-FINAL-SUMMARY.json');
const audit = readJson('./data/CD-WORKLOAD-20260831-008-authority-completeness-audit.json');
const capture = readJson('./data/raw/CD-008-authority-capture/capture-manifest.json');
const study003 = readJson('./data/CD-WORKLOAD-20260829-003-FINAL-SUMMARY.json');

test('Study 008 closes at the prospective authority binding gate', () => {
  assert.equal(summary.study_id, 'CD-WORKLOAD-20260831-008');
  assert.equal(summary.module_id, 'CD008-PROSPECTIVE-GOVERNED-STATE-001');
  assert.equal(summary.status, 'STUDY_COMPLETE');
  assert.equal(summary.benchmark_outcome, 'AUTHORITY_BINDING_CENSORED_BEFORE_TARGET_CONSTRUCTION');
  assert.match(summary.closure_timestamp_utc, /^2026-08-31T/);
});

test('closure reproduces the immutable contemporaneous capture', () => {
  assert.equal(capture.source_count, 14);
  assert.equal(capture.total_byte_count, 3129699);
  assert.equal(capture.all_http_status_200, true);
  assert.equal(summary.capture_result.source_count, capture.source_count);
  assert.equal(summary.capture_result.total_byte_count, capture.total_byte_count);
  assert.equal(summary.capture_result.all_http_status_200, true);
  assert.equal(summary.capture_result.authorization_header_sent, false);
  assert.equal(summary.capture_result.payment_header_sent, false);
  assert.equal(summary.capture_result.model_api_call_performed, false);
  assert.equal(summary.capture_result.x402_payment_performed, false);
});

test('closure reproduces the exact completeness result without relaxation', () => {
  const result = summary.authority_completeness_result;
  assert.equal(result.primary_decision, audit.result.primary_decision);
  assert.equal(result.authority_complete_and_unambiguous, false);
  assert.equal(result.selector_pass_count, 11);
  assert.equal(result.selector_required_count, 11);
  assert.equal(result.governed_leaf_pass_count, 63);
  assert.equal(result.governed_leaf_count, 63);
  assert.equal(result.relationship_pass_count, 9);
  assert.equal(result.relationship_count, 10);
  assert.equal(result.rights_leaf_pass_count, 8);
  assert.equal(result.rights_leaf_count, 8);
  assert.equal(result.cross_source_check_pass_count, 16);
  assert.equal(result.cross_source_check_count, 17);
  assert.equal(result.unresolved_availability_issue_count, 0);
  assert.equal(result.unresolved_ambiguity_issue_count, 0);
  assert.equal(result.unresolved_binding_issue_count, 1);
  assert.equal(result.raw_target_values_emitted, false);
  assert.equal(result.completed_target_constructed, false);
});

test('closure preserves the exact meaningful-mark binding diagnosis', () => {
  const diagnostic = summary.binding_diagnostic;
  assert.equal(diagnostic.relationship_id, 'has_reference_implementation');
  assert.equal(diagnostic.issue_code, 'CROSS_SOURCE_BINDING_FAILED');
  assert.equal(diagnostic.issue_location, 'relationship.has_reference_implementation.binding_check.2');
  assert.equal(diagnostic.governing_mrd_value, 'Naturepedia');
  assert.equal(diagnostic.canonical_page_value, 'Naturepedia™');
  assert.equal(diagnostic.url_binding_passed, true);
  assert.equal(diagnostic.exact_name_binding_passed, false);
  assert.equal(diagnostic.missing_evidence, false);
  assert.equal(diagnostic.ambiguous_selector, false);
  assert.equal(diagnostic.normalization_allowed, false);
  assert.deepEqual(audit.issues.binding, [{
    code: 'CROSS_SOURCE_BINDING_FAILED',
    location: 'relationship.has_reference_implementation.binding_check.2'
  }]);
});

test('closure pins every declared provenance artifact to exact bytes', () => {
  for (const artifact of Object.values(summary.artifact_provenance)) {
    assert.equal(sha256('./' + artifact.path), artifact.sha256, artifact.path);
    assert.match(artifact.latest_commit, /^[0-9a-f]{40}$/, artifact.path);
  }
});

test('failed authority gate blocks target model payment and economics', () => {
  assert.equal(audit.next_step_boundary.independent_target_construction_protocol_permitted, false);
  assert.equal(audit.next_step_boundary.target_construction_performed, false);
  assert.equal(audit.next_step_boundary.model_visible_input_construction_performed, false);
  assert.equal(audit.next_step_boundary.model_measurement_authorized, false);
  assert.equal(audit.next_step_boundary.p2_probe_authorized, false);
  assert.equal(audit.next_step_boundary.p3_retrieval_authorized, false);
  assert.equal(audit.next_step_boundary.x402_payment_authorized, false);
  assert.equal(audit.next_step_boundary.economic_comparison_authorized, false);
  assert.equal(audit.next_step_boundary.production_repair_authorized, false);
  assert.equal(audit.next_step_boundary.recapture_authorized, false);
  assert.equal(summary.path_treatment.p1.measurement_performed, false);
  assert.equal(summary.path_treatment.p2.probe_performed, false);
  assert.equal(summary.path_treatment.p3.payment_performed, false);
});

test('Study 003 remains the unmodified historical economic anchor', () => {
  assert.equal(study003.status, 'STUDY_COMPLETE');
  assert.equal(study003.benchmark_outcome, 'NEGATIVE_INCREMENTAL_COMPRESSION_DIVIDEND_AT_LIVE_P3_PRICE');
  assert.equal(study003.best_quality_equivalent_baseline.path, 'P2');
  assert.equal(study003.best_quality_equivalent_baseline.cost_usd, 0.00111572);
  assert.equal(summary.best_quality_equivalent_baseline.status, 'NONE_MEASURED_FOR_STUDY008');
  assert.equal(summary.best_quality_equivalent_baseline.historical_study003_anchor_modified, false);
  assert.equal(summary.transition_surface_treatment.study003_anchors_modified, false);
});

test('closure authorizes no retry mutation pricing or economic claim', () => {
  assert.deepEqual(summary.actions_performed_by_closure, {
    authority_capture: true,
    local_authority_audit: true,
    target_construction: false,
    model_visible_input_construction: false,
    model_api_call: false,
    automatic_retry: false,
    p2_probe: false,
    p3_retrieval: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false,
    website_mutation: false,
    pricing_mutation: false
  });
  assert.equal(summary.pricing_and_public_claims.pricing_change_supported, false);
  assert.equal(summary.pricing_and_public_claims.website_pricing_change_recommended, false);
  assert.equal(summary.pricing_and_public_claims.positive_compression_dividend_claim_supported, false);
  assert.equal(summary.pricing_and_public_claims.negative_compression_dividend_claim_supported_for_study008, false);
});
