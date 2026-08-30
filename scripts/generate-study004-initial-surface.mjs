import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ExactRational,
  MODEL_REGISTRY_ID,
  calculateStudy004Point,
  minimumSingleCycleFanout
} from '../study004-calculator.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = resolve(dirname(SCRIPT_PATH), '..');
const OUTPUT_RELATIVE_PATH =
  'data/CD-WORKLOAD-20260829-004-initial-study003-transition-surface.json';
const OUTPUT_PATH = resolve(REPOSITORY_ROOT, OUTPUT_RELATIVE_PATH);
const GENERATED_TIMESTAMP_UTC = '2026-08-30T11:40:22Z';
const LIVE_P3_PRICE = '0.25';

const BASELINES = [
  {
    id: 'P1_ONLY_WHEN_P2_UNAVAILABLE',
    path: 'P1',
    cost: '0.00654020',
    p2_available: false,
    evidence_status: 'MEASURED_QUALITY_EQUIVALENT_P1'
  },
  {
    id: 'P2_SUSTAINED_HIT_LOWER_BOUND',
    path: 'P2',
    cost: '0.00111572',
    p2_available: true,
    evidence_status:
      'MEASURED_SINGLE_CACHE_HIT_WITH_SUSTAINED_Q2_ONE_AND_W2_ZERO_ASSUMED_FOR_SURFACE'
  }
];

const DOWNSTREAM_COST_RATIOS = [
  '0',
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '0.5',
  '0.6',
  '0.7',
  '0.8',
  '0.9',
  '0.99'
];

const FANOUT_SLICES = [
  1,
  2,
  5,
  10,
  25,
  38,
  39,
  50,
  100,
  224,
  225,
  250,
  500,
  1000
];

function exact(value) {
  return ExactRational.fromDecimalString(value);
}

function exactInteger(value) {
  return ExactRational.fromInteger(value);
}

function exactValue(value) {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    decimal_18_rounded: value.toRoundedDecimal(18)
  };
}

function sha256File(relativePath) {
  return createHash('sha256')
    .update(readFileSync(resolve(REPOSITORY_ROOT, relativePath)))
    .digest('hex');
}

function sourceArtifact(relativePath) {
  return {
    path: relativePath,
    sha256: sha256File(relativePath)
  };
}

function conditionalPoint(baseline, fanout) {
  return calculateStudy004Point({
    eligibility: {
      p1: {
        available: true,
        quality_equivalent: true
      },
      p2: {
        available: baseline.p2_available,
        quality_equivalent: true
      },
      p3: {
        available: true,
        semantic_equivalent: true,
        representation_equivalent: true,
        quality_gate_pass: true,
        rights_supported: true,
        measurement_complete: true
      }
    },
    N: fanout,
    p1: {
      C1: '0.00654020'
    },
    p2: {
      q2: '1',
      C2hit: '0.00111572',
      C2miss: '0.00654020',
      W2: '0'
    },
    p3: {
      I3: '0',
      P3a: LIVE_P3_PRICE,
      Ktechnical: fanout,
      Krights: fanout,
      Klifetime: fanout,
      Kdemand: fanout,
      F3: '0',
      h: '1',
      Cr: '0',
      Cv: '0',
      Cre: '0.00654020',
      s: '1',
      Cmiss: '0',
      Cf: baseline.cost
    }
  });
}

function downstreamCostSurface(baseline) {
  const Cbest = exact(baseline.cost);

  return {
    baseline_id: baseline.id,
    baseline_path: baseline.path,
    baseline_cost_per_accepted_task: baseline.cost,
    p3_acquisition_price: LIVE_P3_PRICE,
    equation_id: 'CD004-EQ-K-MIN',
    slice_rule:
      'G is evaluated at every decile from zero through 0.9 of Cbest, plus a 0.99 near-limit slice.',
    points: DOWNSTREAM_COST_RATIOS.map((ratioValue) => {
      const ratio = exact(ratioValue);
      const G = Cbest.multiply(ratio);
      const threshold = minimumSingleCycleFanout({
        I3: '0',
        P3a: LIVE_P3_PRICE,
        F3: '0',
        Cbest: baseline.cost,
        G: G.toRoundedDecimal(18)
      });

      return {
        downstream_cost_fraction_of_baseline: ratioValue,
        G: exactValue(G),
        threshold_status: threshold.status,
        minimum_accepted_tasks:
          threshold.minimum_accepted_tasks ?? null
      };
    })
  };
}

function fanoutSurface(baseline) {
  const Cbest = exact(baseline.cost);
  const acquisitionPrice = exact(LIVE_P3_PRICE);

  return {
    baseline_id: baseline.id,
    baseline_path: baseline.path,
    baseline_cost_per_accepted_task: baseline.cost,
    p3_acquisition_price: LIVE_P3_PRICE,
    equation_ids: [
      'CD004-EQ-K-MIN',
      'CD004-EQ-LC3',
      'CD004-EQ-REGIME-III-BOUNDARY'
    ],
    slice_rule:
      'Use a 1-2-5 fan-out series with the adjacent preregistered boundary pairs 38 and 39 plus 224 and 225.',
    points: FANOUT_SLICES.map((fanout) => {
      const K = exactInteger(fanout);
      const maximumAcquisitionPriceAtZeroDownstreamCost =
        K.multiply(Cbest);
      const maximumDownstreamCostAtLivePrice = Cbest.subtract(
        acquisitionPrice.divide(K)
      );
      const feasibleAtNonnegativeDownstreamCost =
        maximumDownstreamCostAtLivePrice.compare(exact('0')) >= 0;
      const toleranceFraction = feasibleAtNonnegativeDownstreamCost
        ? maximumDownstreamCostAtLivePrice.divide(Cbest)
        : null;
      const classification = conditionalPoint(baseline, fanout);

      return {
        fanout,
        acquisition_count: classification.derived_counts.A,
        conditional_zero_downstream_cost_regime:
          classification.primary_label,
        maximum_acquisition_price_at_zero_downstream_cost:
          exactValue(maximumAcquisitionPriceAtZeroDownstreamCost),
        maximum_downstream_cost_at_live_price:
          exactValue(maximumDownstreamCostAtLivePrice),
        nonnegative_downstream_cost_feasible:
          feasibleAtNonnegativeDownstreamCost,
        downstream_cost_tolerance_fraction_of_baseline:
          toleranceFraction ? exactValue(toleranceFraction) : null
      };
    })
  };
}

function anchorSummary(baseline, thresholdFanout, priorFanout) {
  const Cbest = exact(baseline.cost);
  const acquisitionPrice = exact(LIVE_P3_PRICE);
  const K = exactInteger(thresholdFanout);
  const Gmax = Cbest.subtract(acquisitionPrice.divide(K));
  const toleranceFraction = Gmax.divide(Cbest);
  const before = conditionalPoint(baseline, priorFanout);
  const at = conditionalPoint(baseline, thresholdFanout);

  return {
    baseline_id: baseline.id,
    baseline_path: baseline.path,
    threshold_accepted_tasks_at_G_zero: thresholdFanout,
    immediately_prior_accepted_tasks: priorFanout,
    immediately_prior_regime:
      before.primary_label,
    threshold_regime: at.primary_label,
    maximum_G_at_threshold_fanout: exactValue(Gmax),
    maximum_G_fraction_of_baseline_at_threshold_fanout:
      exactValue(toleranceFraction)
  };
}

export function buildInitialStudy003TransitionSurface() {
  const p1Anchor = anchorSummary(BASELINES[0], 39, 38);
  const p2Anchor = anchorSummary(BASELINES[1], 225, 224);

  return {
    surface_id: 'CD004-STUDY003-INITIAL-TRANSITION-SURFACE-1.0',
    study_id: 'CD-WORKLOAD-20260829-004',
    source_study_id: 'CD-WORKLOAD-20260829-003',
    status: 'COMPUTED_BOUNDED_ANALYTICAL_SURFACE',
    generated_timestamp_utc: GENERATED_TIMESTAMP_UTC,
    economic_perspective: 'REQUESTING_AI_OR_AGENT',
    model_registry_id: MODEL_REGISTRY_ID,
    generator: {
      path: 'scripts/generate-study004-initial-surface.mjs',
      sha256: sha256File('scripts/generate-study004-initial-surface.mjs')
    },
    calculation_engine: sourceArtifact('study004-calculator.mjs'),
    source_artifacts: [
      sourceArtifact(
        'data/CD-WORKLOAD-20260829-004-model-registry.json'
      ),
      sourceArtifact(
        'data/CD-WORKLOAD-20260829-003-FINAL-SUMMARY.json'
      ),
      sourceArtifact(
        'data/CD-WORKLOAD-20260829-003-economic-dominance.json'
      ),
      sourceArtifact(
        'data/raw/CD-003-P2-0001-measurement.json'
      )
    ],
    measured_inputs: {
      P1_cost_usd_per_accepted_task: '0.00654020',
      P1_quality_gate_pass: true,
      P2_single_cache_hit_cost_usd_per_accepted_task: '0.00111572',
      P2_single_cache_hit_quality_gate_pass: true,
      P3_live_challenge_price_usdc: LIVE_P3_PRICE,
      P3_live_challenge_http_status: 402,
      P3_payment_performed: false,
      P3_semantic_quality_status: 'NOT_MEASURED'
    },
    scenario_assumptions: {
      currency_rule: 'Nominal 1 USDC to 1 USD for Study 003 anchors.',
      I3: '0',
      F3: '0',
      acquisition_count_per_single_cycle: 1,
      P2_sustained_hit_slice: {
        q2: '1',
        W2: '0',
        status:
          'OPTIMISTIC_LOWER_BOUND_NOT_A_MEASURED_LIFECYCLE_HIT_RATE'
      },
      P1_only_slice: {
        condition: 'P2 unavailable for the evaluated lifecycle'
      },
      G_definition:
        'Aggregate expected downstream Path 3 cost per accepted-task opportunity. G is not decomposed into invented h, s, Cr, Cv, Cres, Cmiss, or Cf values in this initial surface.',
      multi_use_rights:
        'ASSUMED_ONLY_FOR_CONDITIONAL_SURFACE_AND_NOT_EMPIRICALLY_ESTABLISHED'
    },
    boundaries: {
      p1_only: p1Anchor,
      p2_sustained_hit: p2Anchor
    },
    downstream_cost_sensitivity:
      BASELINES.map(downstreamCostSurface),
    live_price_fanout_sensitivity:
      BASELINES.map(fanoutSurface),
    unresolved_empirical_axes: [
      {
        axis: 'P3_SEMANTIC_EQUIVALENCE',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'P3_MULTI_USE_RIGHTS',
        status: 'NOT_ESTABLISHED'
      },
      {
        axis: 'P2_LIFECYCLE_HIT_RATE_Q2',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'P2_CACHE_MISS_OR_WRITE_COST_C2MISS',
        status: 'NOT_FROZEN_AS_A_FORMAL_ACCEPTED_TASK_MEASUREMENT'
      },
      {
        axis: 'P2_LIFECYCLE_WARMUP_COST_W2',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'PATH3_VERIFICATION_AND_POLICY_COST_CV',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'PATH3_LOCAL_ACCESS_COST_CR',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'PATH3_RESIDUAL_COMPUTE_CRES_OR_S',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'PATH3_STATE_LIFETIME_T',
        status: 'NOT_MEASURED'
      },
      {
        axis: 'PATH3_PRESERVATION_MAINTENANCE_REPAIR_F3',
        status: 'NOT_MEASURED'
      }
    ],
    findings: [
      {
        id: 'CD004-FINDING-INITIAL-001',
        statement:
          'Against P1 alone, one 0.25 acquisition requires at least 39 accepted downstream tasks when aggregate downstream Path 3 cost G is zero.',
        boundary: 'CONDITIONAL_IDEALIZED_LOWER_BOUND'
      },
      {
        id: 'CD004-FINDING-INITIAL-002',
        statement:
          'Against a sustained P2 cache-hit baseline of 0.00111572 per accepted task, one 0.25 acquisition requires at least 225 accepted downstream tasks when G is zero.',
        boundary: 'CONDITIONAL_OPTIMISTIC_P2_AND_ZERO_OVERHEAD_LOWER_BOUND'
      },
      {
        id: 'CD004-FINDING-INITIAL-003',
        statement:
          `At 225 accepted tasks against the P2 slice, the maximum aggregate downstream Path 3 cost is ${p2Anchor.maximum_G_at_threshold_fanout.decimal_18_rounded} USD per task, equal to ${p2Anchor.maximum_G_fraction_of_baseline_at_threshold_fanout.decimal_18_rounded} of the baseline cost.`,
        boundary: 'EXACT_ALGEBRAIC_TOLERANCE_AT_THE_DECLARED_SLICE'
      },
      {
        id: 'CD004-FINDING-INITIAL-004',
        statement:
          'Any required second acquisition creates a discontinuous lifecycle-cost step; smooth per-task amortization cannot replace the ceiling-based acquisition count.',
        boundary: 'FROZEN_MODEL_RULE'
      }
    ],
    evidence_conclusion:
      'The initial surface locates conditional economic boundaries but does not establish an empirical governed-state Compression Dividend because P3 semantic equivalence, reusable rights, and real downstream lifecycle costs remain unresolved.',
    pricing_conclusion:
      'No production pricing change or pricing-v4 recommendation is supported by this initial surface alone.',
    actions_performed: {
      model_api_call: false,
      x402_payment: false,
      production_pricing_change: false,
      website_change: false
    }
  };
}

export function canonicalSurfaceJson() {
  return `${JSON.stringify(buildInitialStudy003TransitionSurface(), null, 2)}\n`;
}

function main() {
  const output = canonicalSurfaceJson();

  if (process.argv.includes('--check')) {
    const existing = readFileSync(OUTPUT_PATH, 'utf8');

    if (existing !== output) {
      throw new Error(
        `Generated Study 004 surface does not match ${OUTPUT_RELATIVE_PATH}.`
      );
    }

    process.stdout.write(
      `Study 004 initial surface matches ${OUTPUT_RELATIVE_PATH}.\n`
    );
    return;
  }

  writeFileSync(OUTPUT_PATH, output, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT_RELATIVE_PATH}.\n`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === SCRIPT_PATH
) {
  main();
}
