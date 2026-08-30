import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ExactRational,
  MODEL_REGISTRY_ID,
  Study004ValidationError,
  calculateStudy004Point,
  maximumViableAcquisitionPrice,
  minimumGovernedHitRate,
  minimumSingleCycleFanout,
  minimumStableLifecycleVolume,
  minimumSubstitutionFraction
} from './study004-calculator.mjs';

const registry = JSON.parse(
  readFileSync(
    new URL(
      './data/CD-WORKLOAD-20260829-004-model-registry.json',
      import.meta.url
    ),
    'utf8'
  )
);

function makePoint({
  N,
  p2Available = true,
  p2Quality = true,
  Keff = N,
  Klifetime = Keff,
  overrides = {}
}) {
  const point = {
    eligibility: {
      p1: {
        available: true,
        quality_equivalent: true
      },
      p2: {
        available: p2Available,
        quality_equivalent: p2Quality
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
    N,
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
      P3a: '0.25',
      Ktechnical: Keff,
      Krights: Keff,
      Klifetime,
      Kdemand: N,
      F3: '0',
      h: '1',
      Cr: '0',
      Cv: '0',
      Cre: '0.00654020',
      s: '1',
      Cmiss: '0',
      Cf: '0.00111572'
    }
  };

  return {
    ...point,
    ...overrides,
    eligibility: {
      ...point.eligibility,
      ...overrides.eligibility,
      p1: {
        ...point.eligibility.p1,
        ...overrides.eligibility?.p1
      },
      p2: {
        ...point.eligibility.p2,
        ...overrides.eligibility?.p2
      },
      p3: {
        ...point.eligibility.p3,
        ...overrides.eligibility?.p3
      }
    },
    p1: {
      ...point.p1,
      ...overrides.p1
    },
    p2: {
      ...point.p2,
      ...overrides.p2
    },
    p3: {
      ...point.p3,
      ...overrides.p3
    }
  };
}

function rationalFromResult(value) {
  return new ExactRational(
    BigInt(value.numerator),
    BigInt(value.denominator)
  );
}

test('calculator identifies the frozen model registry', () => {
  assert.equal(MODEL_REGISTRY_ID, registry.registry_id);
});

test('exact rational arithmetic avoids binary floating-point drift', () => {
  const left = ExactRational.fromDecimalString('0.1');
  const right = ExactRational.fromDecimalString('0.2');
  const expected = ExactRational.fromDecimalString('0.3');

  assert.equal(left.add(right).compare(expected), 0);
  assert.equal(left.add(right).toRoundedDecimal(18), '0.3');
});

test('Study 003 P1 anchor freezes at 39 accepted tasks', () => {
  const result = minimumSingleCycleFanout({
    I3: '0',
    P3a: '0.25',
    F3: '0',
    Cbest: '0.00654020',
    G: '0'
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.minimum_accepted_tasks, 39);
});

test('Study 003 P2 anchor freezes at 225 accepted tasks', () => {
  const result = minimumSingleCycleFanout({
    I3: '0',
    P3a: '0.25',
    F3: '0',
    Cbest: '0.00111572',
    G: '0'
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.minimum_accepted_tasks, 225);
});

test('P1 anchor is still Regime I at 38 accepted tasks', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 38, p2Available: false })
  );

  assert.equal(result.primary_label, 'REGIME_I_DEFICIT');
  assert.equal(result.derived_counts.A, 1);
  assert.equal(result.derived_costs.LC1.decimal_18_rounded, '0.2485276');
  assert.equal(result.derived_costs.LC3.decimal_18_rounded, '0.25');
});

test('P1 anchor enters Regime III at 39 accepted tasks', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 39, p2Available: false })
  );

  assert.equal(
    result.primary_label,
    'REGIME_III_BEST_BASELINE_ADVANTAGE'
  );
  assert.deepEqual(result.best_available_baselines, ['P1']);
  assert.equal(result.derived_costs.LC1.decimal_18_rounded, '0.2550678');
});

test('P2 anchor remains Regime II at 224 accepted tasks', () => {
  const result = calculateStudy004Point(makePoint({ N: 224 }));

  assert.equal(
    result.primary_label,
    'REGIME_II_INTERMEDIATE_ADVANTAGE'
  );
  assert.deepEqual(result.best_available_baselines, ['P2']);
  assert.equal(result.derived_costs.LC2.decimal_18_rounded, '0.24992128');
  assert.equal(result.derived_costs.LC3.decimal_18_rounded, '0.25');
});

test('P2 anchor enters Regime III at 225 accepted tasks', () => {
  const result = calculateStudy004Point(makePoint({ N: 225 }));

  assert.equal(
    result.primary_label,
    'REGIME_III_BEST_BASELINE_ADVANTAGE'
  );
  assert.deepEqual(result.best_available_baselines, ['P2']);
  assert.equal(result.derived_costs.LC2.decimal_18_rounded, '0.251037');
  assert.equal(result.derived_costs.Dincremental.decimal_18_rounded, '0.001037');
});

test('ceiling-based acquisition count prevents smooth over-amortization', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 226, Keff: 225 })
  );

  assert.equal(result.derived_counts.A, 2);
  assert.equal(result.derived_costs.LC3.decimal_18_rounded, '0.5');
  assert.equal(
    result.primary_label,
    'REGIME_II_INTERMEDIATE_ADVANTAGE'
  );
});

test('an unavailable P2 is excluded without censoring a valid P1 comparison', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 39, p2Available: false })
  );

  assert.equal(result.result_type, 'ECONOMIC_CLASSIFICATION');
  assert.deepEqual(result.excluded_baselines, [
    { id: 'P2', reason: 'UNAVAILABLE' }
  ]);
});

test('a non-quality-equivalent P2 is excluded from best-baseline selection', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 39, p2Quality: false })
  );

  assert.deepEqual(result.best_available_baselines, ['P1']);
  assert.deepEqual(result.excluded_baselines, [
    { id: 'P2', reason: 'NOT_QUALITY_EQUIVALENT' }
  ]);
});

test('zero effective lifetime fan-out is availability-censored', () => {
  const result = calculateStudy004Point(
    makePoint({ N: 39, Klifetime: 0 })
  );

  assert.equal(result.result_type, 'CENSORED');
  assert.equal(result.primary_label, 'AVAILABILITY_CENSORED');
  assert.equal(result.economic_classification_performed, false);
});

test('censoring precedence places quality before availability and rights', () => {
  const result = calculateStudy004Point(
    makePoint({
      N: 39,
      overrides: {
        eligibility: {
          p3: {
            available: false,
            semantic_equivalent: false,
            quality_gate_pass: false,
            rights_supported: false,
            measurement_complete: false
          }
        }
      }
    })
  );

  assert.equal(result.primary_label, 'QUALITY_CENSORED');
  assert.deepEqual(result.censor_reasons, [
    'QUALITY_CENSORED',
    'AVAILABILITY_CENSORED',
    'RIGHTS_CENSORED',
    'MEASUREMENT_INCOMPLETE'
  ]);
});

test('unsupported reuse rights produce rights censoring', () => {
  const result = calculateStudy004Point(
    makePoint({
      N: 225,
      overrides: {
        eligibility: {
          p3: {
            rights_supported: false
          }
        }
      }
    })
  );

  assert.equal(result.primary_label, 'RIGHTS_CENSORED');
});

test('unsupported fan-out rights do not censor a declared single-use point', () => {
  const result = calculateStudy004Point(
    makePoint({
      N: 1,
      Keff: 1,
      overrides: {
        eligibility: {
          p3: {
            rights_supported: false
          }
        }
      }
    })
  );

  assert.equal(result.result_type, 'ECONOMIC_CLASSIFICATION');
});

test('Cres and s cannot both be independent inputs', () => {
  const result = calculateStudy004Point(
    makePoint({
      N: 225,
      overrides: {
        p3: {
          Cres: '0'
        }
      }
    })
  );

  assert.equal(result.primary_label, 'MEASUREMENT_INCOMPLETE');
});

test('measured residual cost cannot exceed its replaceable cost boundary', () => {
  const point = makePoint({ N: 225 });
  delete point.p3.s;
  point.p3.Cres = '0.01';

  const result = calculateStudy004Point(point);

  assert.equal(result.primary_label, 'MEASUREMENT_INCOMPLETE');
});

test('maximum viable acquisition price is exact at the P2 boundary', () => {
  const result = maximumViableAcquisitionPrice({
    LCbest: '0.251037',
    I3: '0',
    F3: '0',
    N: 225,
    G: '0',
    A: 1
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.value.decimal_18_rounded, '0.251037');
});

test('minimum hit-rate threshold evaluates exactly', () => {
  const result = minimumGovernedHitRate({
    I3: '0',
    P3a: '0',
    F3: '0',
    N: 10,
    A: 1,
    Chit: '0',
    Cmisspath: '0.01',
    LCbest: '0.05'
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.raw_threshold.decimal_18_rounded, '0.5');
});

test('minimum substitution threshold evaluates exactly', () => {
  const result = minimumSubstitutionFraction({
    I3: '0',
    P3a: '0',
    F3: '0',
    N: 10,
    A: 1,
    h: '1',
    Cr: '0',
    Cv: '0',
    Cre: '0.01',
    Cmisspath: '0',
    LCbest: '0.05'
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.raw_threshold.decimal_18_rounded, '0.5');
});

test('minimum stable lifecycle volume reproduces the P2 anchor', () => {
  const result = minimumStableLifecycleVolume({
    I3: '0',
    P3a: '0.25',
    F3: '0',
    A: 1,
    Cbest: '0.00111572',
    G: '0'
  });

  assert.equal(result.status, 'FEASIBLE');
  assert.equal(result.minimum_accepted_tasks, 225);
});

test('zero fixed cost is feasible at every positive lifecycle volume', () => {
  const result = minimumStableLifecycleVolume({
    I3: '0',
    P3a: '0',
    F3: '0',
    A: 1,
    Cbest: '0.001',
    G: '0'
  });

  assert.equal(result.status, 'FEASIBLE_AT_ALL_POSITIVE_VOLUMES');
  assert.equal(result.raw_ceiling, 0);
  assert.equal(result.minimum_valid_accepted_tasks, 1);
});

test('nonpositive marginal savings makes fan-out improvement infeasible', () => {
  const result = minimumSingleCycleFanout({
    I3: '0',
    P3a: '0.25',
    F3: '0',
    Cbest: '0.001',
    G: '0.001'
  });

  assert.equal(
    result.status,
    'INFEASIBLE_NONPOSITIVE_MARGINAL_SAVINGS'
  );
});

test('decimal inputs reject binary numbers and exponent notation', () => {
  assert.throws(
    () =>
      minimumSingleCycleFanout({
        I3: 0,
        P3a: '0.25',
        F3: '0',
        Cbest: '0.001',
        G: '0'
      }),
    Study004ValidationError
  );

  assert.throws(
    () =>
      minimumSingleCycleFanout({
        I3: '0',
        P3a: '2.5e-1',
        F3: '0',
        Cbest: '0.001',
        G: '0'
      }),
    Study004ValidationError
  );
});

test('calculator-emitted equation identifiers exist in the frozen registry', () => {
  const result = calculateStudy004Point(makePoint({ N: 225 }));
  const registryEquationIds = new Set(
    Object.values(registry.equations).map((equation) => equation.id)
  );

  for (const equationId of result.equation_ids) {
    assert.equal(registryEquationIds.has(equationId), true, equationId);
  }
});

test('deterministic property grid preserves lifecycle and regime invariants', () => {
  const volumes = [1, 39, 225, 451];
  const fanouts = [1, 39, 225];
  const p2Availability = [false, true];
  const prices = ['0', '0.00111572', '0.25'];
  const hitRates = ['0', '0.5', '1'];
  const substitutions = ['0', '0.5', '1'];
  const fixedCosts = ['0', '0.01'];
  let evaluated = 0;

  for (const N of volumes) {
    for (const requestedFanout of fanouts) {
      for (const p2Available of p2Availability) {
        for (const P3a of prices) {
          for (const h of hitRates) {
            for (const s of substitutions) {
              for (const F3 of fixedCosts) {
                const result = calculateStudy004Point(
                  makePoint({
                    N,
                    Keff: Math.min(requestedFanout, N),
                    p2Available,
                    overrides: {
                      p3: {
                        P3a,
                        h,
                        s,
                        F3
                      }
                    }
                  })
                );

                assert.equal(
                  result.result_type,
                  'ECONOMIC_CLASSIFICATION'
                );

                const LC1 = rationalFromResult(result.derived_costs.LC1);
                const LCbest = rationalFromResult(
                  result.derived_costs.LCbest
                );
                const LC3 = rationalFromResult(result.derived_costs.LC3);
                const dividend = rationalFromResult(
                  result.derived_costs.Dincremental
                );

                assert.equal(dividend.compare(LCbest.subtract(LC3)), 0);
                assert.equal(
                  result.derived_counts.A,
                  Math.ceil(N / result.derived_counts.Keff)
                );

                if (
                  result.primary_label ===
                  'REGIME_III_BEST_BASELINE_ADVANTAGE'
                ) {
                  assert.equal(LC3.compare(LCbest) <= 0, true);
                } else if (
                  result.primary_label ===
                  'REGIME_II_INTERMEDIATE_ADVANTAGE'
                ) {
                  assert.equal(LC3.compare(LCbest) > 0, true);
                  assert.equal(LC3.compare(LC1) <= 0, true);
                } else {
                  assert.equal(
                    result.primary_label,
                    'REGIME_I_DEFICIT'
                  );
                  assert.equal(LC3.compare(LC1) > 0, true);
                }

                evaluated += 1;
              }
            }
          }
        }
      }
    }
  }

  assert.equal(evaluated, 1296);
});
