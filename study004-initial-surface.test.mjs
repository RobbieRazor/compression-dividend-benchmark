import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildInitialStudy003TransitionSurface,
  canonicalSurfaceJson
} from './scripts/generate-study004-initial-surface.mjs';

const artifactPath = new URL(
  './data/CD-WORKLOAD-20260829-004-initial-study003-transition-surface.json',
  import.meta.url
);
const frozenArtifactText = readFileSync(artifactPath, 'utf8');
const frozenArtifact = JSON.parse(frozenArtifactText);

test('initial Study 003 surface is deterministically reproducible', () => {
  assert.equal(canonicalSurfaceJson(), frozenArtifactText);
});

test('surface identity and model registry are frozen', () => {
  assert.equal(
    frozenArtifact.surface_id,
    'CD004-STUDY003-INITIAL-TRANSITION-SURFACE-1.0'
  );
  assert.equal(
    frozenArtifact.model_registry_id,
    'CD004-MODEL-REGISTRY-1.0'
  );
  assert.equal(
    frozenArtifact.status,
    'COMPUTED_BOUNDED_ANALYTICAL_SURFACE'
  );
});

test('generator returns the same measured Study 003 inputs', () => {
  const generated = buildInitialStudy003TransitionSurface();

  assert.deepEqual(generated.measured_inputs, {
    P1_cost_usd_per_accepted_task: '0.00654020',
    P1_quality_gate_pass: true,
    P2_single_cache_hit_cost_usd_per_accepted_task: '0.00111572',
    P2_single_cache_hit_quality_gate_pass: true,
    P3_live_challenge_price_usdc: '0.25',
    P3_live_challenge_http_status: 402,
    P3_payment_performed: false,
    P3_semantic_quality_status: 'NOT_MEASURED'
  });
});

test('P1-only zero-overhead boundary is 38 to 39', () => {
  const boundary = frozenArtifact.boundaries.p1_only;

  assert.equal(boundary.immediately_prior_accepted_tasks, 38);
  assert.equal(boundary.immediately_prior_regime, 'REGIME_I_DEFICIT');
  assert.equal(boundary.threshold_accepted_tasks_at_G_zero, 39);
  assert.equal(
    boundary.threshold_regime,
    'REGIME_III_BEST_BASELINE_ADVANTAGE'
  );
});

test('P2 sustained-hit zero-overhead boundary is 224 to 225', () => {
  const boundary = frozenArtifact.boundaries.p2_sustained_hit;

  assert.equal(boundary.immediately_prior_accepted_tasks, 224);
  assert.equal(
    boundary.immediately_prior_regime,
    'REGIME_II_INTERMEDIATE_ADVANTAGE'
  );
  assert.equal(boundary.threshold_accepted_tasks_at_G_zero, 225);
  assert.equal(
    boundary.threshold_regime,
    'REGIME_III_BEST_BASELINE_ADVANTAGE'
  );
});

test('P2 threshold leaves only the exact declared downstream-cost budget', () => {
  const boundary = frozenArtifact.boundaries.p2_sustained_hit;

  assert.equal(
    boundary.maximum_G_at_threshold_fanout.numerator,
    '1037'
  );
  assert.equal(
    boundary.maximum_G_at_threshold_fanout.denominator,
    '225000000'
  );
  assert.equal(
    boundary.maximum_G_at_threshold_fanout.decimal_18_rounded,
    '0.000004608888888889'
  );
});

test('downstream-cost sensitivity contains 22 systematic points', () => {
  const points = frozenArtifact.downstream_cost_sensitivity.flatMap(
    (surface) => surface.points
  );

  assert.equal(points.length, 22);
});

test('required fan-out never decreases as downstream cost rises', () => {
  for (const surface of frozenArtifact.downstream_cost_sensitivity) {
    let previous = 0;

    for (const point of surface.points) {
      assert.equal(point.threshold_status, 'FEASIBLE');
      assert.equal(point.minimum_accepted_tasks >= previous, true);
      previous = point.minimum_accepted_tasks;
    }
  }
});

test('fan-out sensitivity contains 28 declared slices', () => {
  const points = frozenArtifact.live_price_fanout_sensitivity.flatMap(
    (surface) => surface.points
  );

  assert.equal(points.length, 28);
});

test('maximum viable acquisition price rises monotonically with fan-out', () => {
  for (const surface of frozenArtifact.live_price_fanout_sensitivity) {
    let previousNumerator = 0n;
    let previousDenominator = 1n;

    for (const point of surface.points) {
      const current = point.maximum_acquisition_price_at_zero_downstream_cost;
      const numerator = BigInt(current.numerator);
      const denominator = BigInt(current.denominator);

      assert.equal(
        numerator * previousDenominator >=
          previousNumerator * denominator,
        true
      );

      previousNumerator = numerator;
      previousDenominator = denominator;
    }
  }
});

test('all unmeasured lifecycle axes remain explicitly unresolved', () => {
  const unresolved = new Map(
    frozenArtifact.unresolved_empirical_axes.map((entry) => [
      entry.axis,
      entry.status
    ])
  );

  assert.equal(unresolved.get('P3_SEMANTIC_EQUIVALENCE'), 'NOT_MEASURED');
  assert.equal(unresolved.get('P3_MULTI_USE_RIGHTS'), 'NOT_ESTABLISHED');
  assert.equal(
    unresolved.get('P2_LIFECYCLE_HIT_RATE_Q2'),
    'NOT_MEASURED'
  );
  assert.equal(
    unresolved.get('PATH3_VERIFICATION_AND_POLICY_COST_CV'),
    'NOT_MEASURED'
  );
});

test('surface performs no external paid or production action', () => {
  assert.deepEqual(frozenArtifact.actions_performed, {
    model_api_call: false,
    x402_payment: false,
    production_pricing_change: false,
    website_change: false
  });
});

test('surface does not claim an empirical governed-state dividend', () => {
  assert.match(
    frozenArtifact.evidence_conclusion,
    /does not establish an empirical governed-state Compression Dividend/
  );
  assert.match(
    frozenArtifact.pricing_conclusion,
    /No production pricing change/
  );
});
