import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const readText = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

const manifest = readJson('./data/CD-WORKLOAD-20260831-007-design-manifest.json');
const rules = readJson('./data/CD-WORKLOAD-20260831-007-neutral-source-grounding-rules.json');
const closure = readJson('./data/CD-WORKLOAD-20260830-006-FINAL-SUMMARY.json');
const adjudication = readJson('./data/raw/CD-006-P1-0001-canonical-fidelity-adjudication.json');
const target = readJson('./data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json');

test('Study 007 starts as a design-only successor to immutable Study 006', () => {
  assert.equal(manifest.study_id, 'CD-WORKLOAD-20260831-007');
  assert.equal(manifest.predecessor_evidence.study006_outcome, closure.benchmark_outcome);
  assert.equal(manifest.predecessor_evidence.study006_exact_facts_pass, 59);
  assert.equal(manifest.predecessor_evidence.study006_remaining_relationship_mismatches, 14);
  assert.equal(manifest.predecessor_evidence.study006_cost_inherited_as_accepted_baseline, false);
  assert.equal(manifest.current_freeze_state.measurement_authorized, false);
});

test('design, rules, and predecessor evidence are pinned exactly', () => {
  for (const artifact of Object.values(manifest.frozen_design_artifacts)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256);
  }
  for (const artifact of Object.values(manifest.predecessor_evidence)) {
    if (!artifact || typeof artifact !== 'object' || !artifact.path) continue;
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256);
    assert.match(artifact.commit, /^[0-9a-f]{40}$/);
  }
});

test('two arms isolate instruction and refreshed-authority effects', () => {
  const design = manifest.two_arm_design;
  assert.equal(design.arm_a.causal_role, 'INSTRUCTION_EFFECT');
  assert.equal(design.arm_a.authority_refresh_allowed, false);
  assert.equal(design.arm_b.causal_role, 'INCREMENTAL_AUTHORITY_ARCHITECTURE_EFFECT');
  assert.equal(design.arm_b.authority_snapshot_frozen_now, false);
  assert.equal(design.arm_b.new_model_visible_component_relative_to_arm_a, 'refreshed authority evidence only');
  assert.equal(design.cross_arm_tuning_allowed, false);
  assert.equal(design.common_between_arms.includes('hidden target'), true);
  assert.equal(design.common_between_arms.includes('evaluator'), true);
});

test('rules address remaining mismatch families without target disclosure', () => {
  assert.equal(adjudication.exact_value_fidelity.relationship_target_fact_pass_count, 38);
  assert.equal(adjudication.exact_value_fidelity.relationship_target_fact_count, 52);
  assert.deepEqual(rules.coverage_families, {
    ontology_type_substitution: true,
    canonical_descriptor_paraphrase: true,
    trademark_mark_omission: true,
    identifier_shortening: true
  });
  const protectedValues = new Set(collectStrings(target));
  const exposed = new Set(collectStrings(rules));
  for (const value of protectedValues) assert.equal(exposed.has(value), false, `target value disclosed: ${value}`);
  rules.selection_rules.forEach((rule) => assert.equal(rule.protected_values_disclosed, false));
});

test('source grounding requires exact selection and honest unresolved state', () => {
  assert.equal(rules.global_rule.semantic_equivalence_satisfies_exact_contract, false);
  assert.equal(rules.global_rule.paraphrase_allowed_for_governed_fields, false);
  assert.equal(rules.global_rule.invent_missing_value, false);
  const ids = new Set(rules.selection_rules.map((rule) => rule.rule_id));
  assert.equal(ids.has('FIELD_ROLE_BEFORE_SURFACE_SIMILARITY'), true);
  assert.equal(ids.has('VALUE_NOT_CONTAINER_METADATA'), true);
  assert.equal(ids.has('CONFLICT_RESOLUTION'), true);
  assert.equal(ids.has('NO_CROSS_ARTIFACT_INVENTION'), true);
});

test('one-shot sampling, quality, spending, and economics remain blocked', () => {
  const boundary = manifest.quality_and_sampling_boundary;
  assert.equal(boundary.relationship_gate_required, '9/9');
  assert.equal(boundary.maximum_initial_feasibility_observations_per_arm, 1);
  assert.equal(boundary.automatic_retry_allowed, false);
  assert.equal(boundary.one_passing_observation_establishes_stable_cost, false);
  assert.equal(boundary.p2_allowed_before_quality_equivalent_p1, false);
  assert.equal(boundary.p3_payment_allowed_before_quality_equivalent_p1, false);
  assert.equal(boundary.economic_comparison_allowed_now, false);
  assert.deepEqual(manifest.actions_performed, {
    live_authority_refresh: false,
    api_call: false,
    retry: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    website_mutation: false,
    pricing_mutation: false
  });
});

test('design preserves causal and cross-study boundaries', () => {
  const design = readText('./WORKLOAD-CD-20260831-007.md');
  assert.match(design, /only intended difference is an independently captured post-RRIP 2\.1\.0 public-authority snapshot/);
  assert.match(design, /at most one initial-feasibility observation/);
  assert.match(design, /Do not tune the experiment to force governed retrieval to win/);
  assert.match(design, /Pisano Plate is an architectural update but is not evidence/);
  assert.equal(manifest.next_artifact.api_call_allowed, false);
  assert.equal(manifest.next_artifact.p3_payment_allowed, false);
});
