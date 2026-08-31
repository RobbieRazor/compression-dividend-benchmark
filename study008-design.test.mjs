import assert from 'node:assert/strict';

import { createHash } from 'node:crypto';

import { readFileSync } from 'node:fs';

import test from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

const readText = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

const manifest = readJson('./data/CD-WORKLOAD-20260831-008-design-manifest.json');

const policy = readJson('./data/CD-WORKLOAD-20260831-008-authority-completeness-policy.json');

const study007Closure = readJson('./data/CD-WORKLOAD-20260831-007-FINAL-SUMMARY.json');

const study007Adjudication = readJson('./data/raw/CD-007-comparative-adjudication.json');

const study007Availability = readJson('./data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json');

const study006Closure = readJson('./data/CD-WORKLOAD-20260830-006-FINAL-SUMMARY.json');

const study003Closure = readJson('./data/CD-WORKLOAD-20260829-003-FINAL-SUMMARY.json');

test('Study 008 is a prospective design-only successor to immutable predecessor evidence', () => {
  assert.equal(manifest.study_id, 'CD-WORKLOAD-20260831-008');
  assert.equal(manifest.status, 'DESIGN_ONLY_FROZEN_BEFORE_CAPTURE_TARGET_CONSTRUCTION_OR_MEASUREMENT');
  assert.equal(manifest.predecessor_evidence.study007_outcome, study007Closure.benchmark_outcome);
  assert.equal(manifest.predecessor_evidence.study007_arm_a_relationship_target_facts_pass, 38);
  assert.equal(manifest.predecessor_evidence.study007_arm_a_relationship_target_facts_total, 52);
  assert.equal(manifest.predecessor_evidence.study007_arm_b_authority_values_available, 46);
  assert.equal(manifest.predecessor_evidence.study007_arm_b_authority_values_total, 52);
  assert.equal(manifest.predecessor_evidence.study007_arm_b_missing_values, 6);
  assert.equal(manifest.predecessor_evidence.study007_cost_inherited_as_accepted_baseline, false);
  assert.equal(manifest.predecessor_evidence.study006_cost_inherited_as_accepted_baseline, false);
  assert.equal(manifest.predecessor_evidence.study003_last_quality_equivalent_anchor_path, 'P2');
  assert.equal(manifest.predecessor_evidence.study003_last_quality_equivalent_anchor_cost_usd, '0.00111572');
  assert.equal(study007Adjudication.comparative_finding.quality_equivalent_p1_established, false);
  assert.equal(study006Closure.quality_result.primary_quality_gate_pass, false);
  assert.equal(study003Closure.p2.quality_gate_pass, true);
});

test('design artifacts and predecessor evidence are pinned exactly', () => {
  for (const artifact of Object.values(manifest.frozen_design_artifacts)) {
    assert.equal(sha256('./' + artifact.path), artifact.sha256);
  }

  const pinnedPredecessors = [
    manifest.predecessor_evidence.study007_closure,
    manifest.predecessor_evidence.study007_comparative_adjudication,
    manifest.predecessor_evidence.study007_arm_b_availability_audit,
    manifest.predecessor_evidence.study006_closure,
    manifest.predecessor_evidence.study003_closure
  ];

  for (const artifact of pinnedPredecessors) {
    assert.equal(sha256('./' + artifact.path), artifact.sha256);
    assert.match(artifact.commit, /^[0-9a-f]{40}$/);
  }
});

test('prospective phase order prevents historical target leakage and post-hoc tuning', () => {
  const order = manifest.required_phase_order;
  assert.ok(order.indexOf('DESIGN_FREEZE') < order.indexOf('CAPTURE_PROTOCOL_FREEZE'));
  assert.ok(order.indexOf('CAPTURE_PROTOCOL_FREEZE') < order.indexOf('CONTEMPORANEOUS_AUTHORITY_CAPTURE'));
  assert.ok(order.indexOf('CONTEMPORANEOUS_AUTHORITY_CAPTURE') < order.indexOf('AUTHORITY_COMPLETENESS_AUDIT'));
  assert.ok(order.indexOf('AUTHORITY_COMPLETENESS_AUDIT') < order.indexOf('INDEPENDENT_TARGET_CONSTRUCTION'));
  assert.ok(order.indexOf('INDEPENDENT_TARGET_CONSTRUCTION') < order.indexOf('QUALITY_CONTRACT_AND_EVALUATOR_FREEZE'));
  assert.ok(order.indexOf('QUALITY_CONTRACT_AND_EVALUATOR_FREEZE') < order.indexOf('ONE_P1_INITIAL_FEASIBILITY_OBSERVATION'));
  assert.equal(manifest.prospective_design.authority_must_be_frozen_before_target_construction, true);
  assert.equal(manifest.prospective_design.authority_completeness_must_pass_before_target_construction, true);
  assert.equal(manifest.prospective_design.target_must_be_constructed_only_from_frozen_authority, true);
  assert.equal(manifest.prospective_design.historical_target_governs_new_target, false);
  assert.equal(manifest.prospective_design.study005_through_007_target_reuse_allowed, false);
  assert.equal(manifest.prospective_design.production_tuning_after_target_inspection_allowed, false);
  assert.equal(manifest.prospective_design.capture_repair_after_completeness_failure_allowed, false);
  assert.equal(manifest.prospective_design.target_relaxation_after_model_output_allowed, false);
});

test('authority completeness requires exact support and unambiguous bindings', () => {
  assert.equal(policy.policy_id, 'CD008-AUTHORITY-COMPLETENESS-1.0');
  assert.equal(policy.prospective_boundary.historical_target_governs_audit, false);
  assert.equal(policy.prospective_boundary.study005_through_007_target_comparison_allowed, false);
  assert.equal(policy.audit_unit.all_required_units_must_pass, true);
  assert.equal(policy.audit_unit.semantic_equivalence_counts_as_exact_support, false);
  assert.equal(policy.audit_unit.partial_credit_changes_primary_decision, false);
  assert.equal(policy.audit_unit.missing_value_invention_allowed, false);
  assert.equal(policy.required_leaf_support_record.source_artifact_id, true);
  assert.equal(policy.required_leaf_support_record.source_sha256, true);
  assert.equal(policy.required_leaf_support_record.canonical_selection_rule, true);
  assert.equal(policy.required_leaf_support_record.relationship_binding, true);
  assert.equal(policy.required_leaf_support_record.field_binding, true);
  assert.equal(policy.ambiguity_rules.unresolved_conflict_causes_completeness_failure, true);
  assert.equal(policy.ambiguity_rules.silent_source_preference_allowed, false);
  assert.equal(policy.primary_decision_rule.pass_requires_every_target_leaf_supported, true);
  assert.equal(policy.primary_decision_rule.pass_requires_zero_unresolved_conflicts, true);
});

test('historical missing values are not disclosed into the new design package', () => {
  const design = readText('./WORKLOAD-CD-20260831-008.md');
  const exposed = new Set([
    ...collectStrings(manifest),
    ...collectStrings(policy),
    design
  ]);

  for (const fact of study007Availability.unavailable_exact_facts) {
    assert.equal(exposed.has(fact.required_value), false, 'historical protected value disclosed: ' + fact.required_value);
  }
});

test('future visibility and exact quality boundaries remain strict', () => {
  const visible = manifest.future_visibility_boundary.model_may_see_after_later_freeze;
  const hidden = manifest.future_visibility_boundary.always_hidden;
  assert.equal(visible.includes('frozen contemporaneous authority evidence'), true);
  assert.equal(hidden.includes('completed hidden target'), true);
  assert.equal(hidden.includes('target-construction mapping'), true);
  assert.equal(hidden.includes('Quality Contract'), true);
  assert.equal(hidden.includes('evaluator implementation and output'), true);
  assert.equal(hidden.includes('Study 004 through 007 failed-field diagnostics'), true);

  const quality = manifest.quality_and_sampling_boundary;
  assert.equal(quality.complete_quality_gate_required, true);
  assert.equal(quality.exact_schema_required, true);
  assert.equal(quality.exact_subject_required, true);
  assert.equal(quality.exact_relationship_count_and_labels_required, true);
  assert.equal(quality.exact_target_field_placement_required, true);
  assert.equal(quality.exact_target_values_required, true);
  assert.equal(quality.exact_provenance_required, true);
  assert.equal(quality.exact_rights_required, true);
  assert.equal(quality.semantic_similarity_changes_primary_pass, false);
  assert.equal(quality.partial_credit_changes_primary_pass, false);
});

test('one-shot sampling spending and economics remain blocked', () => {
  const boundary = manifest.quality_and_sampling_boundary;
  assert.equal(boundary.maximum_initial_feasibility_observations, 1);
  assert.equal(boundary.automatic_retry_allowed, false);
  assert.equal(boundary.one_passing_observation_establishes_stable_cost, false);
  assert.equal(boundary.p2_allowed_before_quality_equivalent_p1, false);
  assert.equal(boundary.p3_allowed_before_quality_equivalent_p1, false);
  assert.equal(boundary.economic_comparison_allowed_now, false);

  assert.deepEqual(manifest.actions_performed, {
    network_capture: false,
    api_call: false,
    automatic_retry: false,
    p2_probe: false,
    p3_retrieval: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false,
    website_mutation: false,
    pricing_mutation: false
  });

  assert.equal(manifest.current_freeze_state.capture_protocol_frozen, false);
  assert.equal(manifest.current_freeze_state.live_authority_captured, false);
  assert.equal(manifest.current_freeze_state.hidden_target_constructed, false);
  assert.equal(manifest.current_freeze_state.measurement_authorized, false);
  assert.equal(manifest.next_artifact.network_capture_allowed_by_current_freeze, false);
  assert.equal(manifest.next_artifact.model_api_call_allowed, false);
  assert.equal(manifest.next_artifact.x402_payment_allowed, false);
});

test('failure rules stop before invalid spending or production repair', () => {
  assert.equal(policy.failure_stopping_rule.construct_target, false);
  assert.equal(policy.failure_stopping_rule.construct_model_visible_input, false);
  assert.equal(policy.failure_stopping_rule.perform_model_api_call, false);
  assert.equal(policy.failure_stopping_rule.automatic_retry, false);
  assert.equal(policy.failure_stopping_rule.repair_production_within_study, false);
  assert.equal(policy.failure_stopping_rule.recapture_within_study, false);
  assert.equal(policy.failure_stopping_rule.perform_p2_probe, false);
  assert.equal(policy.failure_stopping_rule.perform_p3_retrieval, false);
  assert.equal(policy.failure_stopping_rule.perform_x402_payment, false);
  assert.equal(policy.failure_stopping_rule.perform_economic_comparison, false);
});

test('workload document preserves the prospective scientific boundary', () => {
  const design = readText('./WORKLOAD-CD-20260831-008.md');
  assert.match(design, /Study 008 reverses the order/);
  assert.match(design, /No historical hidden target governs Study 008/);
  assert.match(design, /stop Study 008 before target construction/);
  assert.match(design, /Only one preregistered P1 initial-feasibility observation/);
  assert.match(design, /One passing observation establishes initial feasibility only/);
  assert.match(design, /do not repair or recapture production within Study 008/);
  assert.match(design, /tune the experiment to force governed retrieval to win/);
  assert.match(design, /no economic comparison is authorized/);
});
