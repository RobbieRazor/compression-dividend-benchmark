import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ExactRational } from './study004-calculator.mjs';

const registry = JSON.parse(
  readFileSync(
    new URL(
      './data/CD-WORKLOAD-20260829-004-workload-class-calibration-registry.json',
      import.meta.url
    ),
    'utf8'
  )
);

test('workload-class registry identity and state are frozen', () => {
  assert.equal(
    registry.registry_id,
    'CD004-WORKLOAD-CLASS-CALIBRATION-REGISTRY-1.0'
  );
  assert.equal(
    registry.status,
    'FIRST_LARGER_WORKLOAD_SELECTED_PRE_SOURCE_FREEZE'
  );
  assert.equal(registry.model_registry_id, 'CD004-MODEL-REGISTRY-1.0');
});

test('gate and candidate identifiers are unique', () => {
  const gateIds = registry.selection_method.required_gates.map(
    (gate) => gate.gate_id
  );
  const candidateIds = registry.candidates.map(
    (candidate) => candidate.candidate_id
  );

  assert.equal(new Set(gateIds).size, gateIds.length);
  assert.equal(new Set(candidateIds).size, candidateIds.length);
});

test('candidate eligibility exactly matches the required-gate rule', () => {
  const requiredGateIds = registry.selection_method.required_gates.map(
    (gate) => gate.gate_id
  );

  for (const candidate of registry.candidates) {
    const allPass = requiredGateIds.every(
      (gateId) => candidate.gates[gateId] === 'PASS'
    );

    assert.equal(candidate.eligible, allPass, candidate.candidate_id);
  }
});

test('selected candidate is the lowest-price eligible route', () => {
  const eligible = registry.candidates.filter(
    (candidate) => candidate.eligible
  );
  const sorted = [...eligible].sort((left, right) => {
    const leftPrice = ExactRational.fromDecimalString(left.price_usdc);
    const rightPrice = ExactRational.fromDecimalString(right.price_usdc);
    const priceOrder = leftPrice.compare(rightPrice);

    if (priceOrder !== 0) return priceOrder;

    const relationshipOrder =
      (right.declared_relationships?.length ?? 0) -
      (left.declared_relationships?.length ?? 0);

    if (relationshipOrder !== 0) return relationshipOrder;

    return left.candidate_id.localeCompare(right.candidate_id);
  });

  assert.equal(
    registry.selection.selected_candidate_id,
    sorted[0].candidate_id
  );
  assert.equal(sorted[0].price_usdc, '0.025');
});

test('Enriched Biography route is the selected first module', () => {
  const selected = registry.candidates.find(
    (candidate) =>
      candidate.candidate_id === registry.selection.selected_candidate_id
  );

  assert.equal(selected.selection_status, 'SELECTED_FIRST');
  assert.equal(selected.access_class, 'enriched');
  assert.equal(selected.route_status, 'LIVE_HTTP_402_VERIFIED');
  assert.equal(selected.price_atomic_units, '25000');
  assert.equal(selected.declared_relationships.length, 9);
  assert.equal(
    registry.selection.module_id,
    'CD004-CAL-ENRICHED-BIOGRAPHY-001'
  );
});

test('primary empirical fan-out is fixed at one by current rights', () => {
  assert.equal(
    registry.live_production_evidence.rights_boundary
      .study004_primary_empirical_Krights,
    1
  );
  assert.equal(registry.selection.primary_empirical_fanout, 1);
  assert.equal(registry.selection.primary_empirical_acquisition_count, 1);
  assert.match(
    registry.selection.rights_rule,
    /Krights equal to one/
  );
});

test('live evidence hashes and production version are preserved', () => {
  assert.equal(
    registry.live_production_evidence.pricing_manifest.version,
    '3.0.0'
  );
  assert.equal(
    registry.live_production_evidence.pricing_manifest
      .sha256_observed_2026_08_30,
    '0c84a749f5f0eb1df1e9c5f16987ba30f7646da3fdcd52ae8aa2bdc261cc7d02'
  );
  assert.equal(
    registry.live_production_evidence.ai_catalog
      .sha256_observed_2026_08_30,
    'a793e9a760800fc0d3cbd4cfd4592e7e76ddf742f83d0b54854bcb6845b95539'
  );
});

test('high-price registry and mesh routes fail the bounded-pilot gate', () => {
  const highPriceCandidates = registry.candidates.filter(
    (candidate) =>
      candidate.price_usdc === '5.00' ||
      candidate.price_usdc === '25.00'
  );

  assert.equal(highPriceCandidates.length >= 3, true);

  for (const candidate of highPriceCandidates) {
    assert.equal(candidate.gates.G6, 'FAIL', candidate.candidate_id);
    assert.equal(candidate.eligible, false, candidate.candidate_id);
  }
});

test('payment remains blocked until every preregistered gate is frozen', () => {
  const state = registry.selection.current_state;

  assert.equal(state.candidate_selected, true);
  assert.equal(state.public_authority_package_frozen, false);
  assert.equal(state.target_representation_frozen, false);
  assert.equal(state.quality_contract_frozen, false);
  assert.equal(state.task_frozen, false);
  assert.equal(state.evaluator_frozen, false);
  assert.equal(state.P3_payment_performed, false);
});

test('selection performs no paid, production, or website mutation', () => {
  assert.deepEqual(registry.actions_performed, {
    read_only_live_recon: true,
    model_api_call: false,
    x402_payment: false,
    production_pricing_change: false,
    website_change: false
  });
});

test('next artifact freezes independent evidence before measurement', () => {
  assert.equal(
    registry.next_artifact.type,
    'INDEPENDENT_PUBLIC_AUTHORITY_PACKAGE_AND_TARGET_REPRESENTATION'
  );
  assert.equal(registry.next_artifact.required_before_measurement, true);
  assert.equal(
    registry.next_artifact.module_id,
    registry.selection.module_id
  );
});
