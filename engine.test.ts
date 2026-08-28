import { describe, expect, test } from 'vitest';
import {
  approximatelyEqual,
  computeCompressionDividendV1,
  ValidationError
} from './engine';

function assertApprox(
  actual: number,
  expected: number,
  label = 'value'
): void {
  expect(
    approximatelyEqual(actual, expected),
    `${label}: actual=${actual}, expected=${expected}`
  ).toBe(true);
}

function expectValidation(
  inputs: Parameters<typeof computeCompressionDividendV1>[0],
  expectedField: 'h' | 's' | 'Isetup' | 'N'
): void {
  try {
    computeCompressionDividendV1(inputs);

    throw new Error(
      `Expected ValidationError for ${expectedField}, but calculation succeeded.`
    );
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);

    if (error instanceof ValidationError) {
      expect(error.field).toBe(expectedField);
    }
  }
}

describe(
  'Compression Dividend Benchmark v1.0 — Hardened Operational Test Grid',
  () => {

    // ==========================================
    // CANONICAL REGRESSION FIXTURES
    // ==========================================

    test('P1 — Deficit fixture', () => {
      const res = computeCompressionDividendV1({
        h: 0.25,
        s: 0.30,
        Isetup: 600,
        N: 10000
      });

      assertApprox(res.C3_marginal, 0.128125, 'P1 C3');
      assertApprox(res.LC1, 1350, 'P1 LC1');
      assertApprox(res.LC2, 900, 'P1 LC2');
      assertApprox(res.LC3, 1881.25, 'P1 LC3');

      assertApprox(res.Dpure, -531.25, 'P1 Dpure');
      assertApprox(res.Dcache, -981.25, 'P1 Dcache');
      assertApprox(
        res.Dincremental,
        -981.25,
        'P1 Dincremental'
      );

      expect(res.hmin_best.type).toBe(
        'NO_VIABLE_HIT_RATE'
      );

      if (
        res.hmin_best.type ===
        'NO_VIABLE_HIT_RATE'
      ) {
        assertApprox(
          res.hmin_best.value,
          2.7341772151898738,
          'P1 hmin'
        );
      }

      expect(res.smin_best.type).toBe(
        'NO_VIABLE_SUBSTITUTION_FRACTION'
      );

      if (
        res.smin_best.type ===
        'NO_VIABLE_SUBSTITUTION_FRACTION'
      ) {
        assertApprox(
          res.smin_best.value,
          3.2074074074074077,
          'P1 smin'
        );
      }

      expect(res.Nbe_best.type).toBe(
        'NO_FINITE_BREAK_EVEN_AT_CURRENT_H_S'
      );

      expect(res.regime).toBe(
        'REGIME_I_DEFICIT'
      );
    });

    test('P2 — Intermediate Advantage fixture', () => {
      const res = computeCompressionDividendV1({
        h: 0.60,
        s: 0.65,
        Isetup: 300,
        N: 20000
      });

      assertApprox(res.C3_marginal, 0.08595, 'P2 C3');
      assertApprox(res.LC1, 2700, 'P2 LC1');
      assertApprox(res.LC2, 1800, 'P2 LC2');
      assertApprox(res.LC3, 2019, 'P2 LC3');

      assertApprox(res.Dpure, 681, 'P2 Dpure');
      assertApprox(res.Dcache, -219, 'P2 Dcache');
      assertApprox(
        res.Dincremental,
        -219,
        'P2 Dincremental'
      );

      expect(res.hmin_best.type).toBe('FEASIBLE');

      if (res.hmin_best.type === 'FEASIBLE') {
        assertApprox(
          res.hmin_best.value,
          0.7262247838616718,
          'P2 hmin'
        );
      }

      expect(res.smin_best.type).toBe('FEASIBLE');

      if (res.smin_best.type === 'FEASIBLE') {
        assertApprox(
          res.smin_best.value,
          0.7851851851851852,
          'P2 smin'
        );
      }

      expect(res.Nbe_best.type).toBe('FEASIBLE');

      if (res.Nbe_best.type === 'FEASIBLE') {
        assertApprox(
          res.Nbe_best.value,
          74074.07407407407,
          'P2 Nbe'
        );
      }

      expect(res.regime).toBe(
        'REGIME_II_INTERMEDIATE_ADVANTAGE'
      );
    });

    test('P3 — Best-Baseline Advantage fixture', () => {
      const res = computeCompressionDividendV1({
        h: 0.90,
        s: 0.85,
        Isetup: 200,
        N: 35000
      });

      assertApprox(res.C3_marginal, 0.035625, 'P3 C3');
      assertApprox(res.LC1, 4725, 'P3 LC1');
      assertApprox(res.LC2, 3150, 'P3 LC2');
      assertApprox(res.LC3, 1446.875, 'P3 LC3');

      assertApprox(
        res.Dpure,
        3278.125,
        'P3 Dpure'
      );

      assertApprox(
        res.Dcache,
        1703.125,
        'P3 Dcache'
      );

      assertApprox(
        res.Dincremental,
        1703.125,
        'P3 Dincremental'
      );

      expect(res.hmin_best.type).toBe('FEASIBLE');

      if (res.hmin_best.type === 'FEASIBLE') {
        assertApprox(
          res.hmin_best.value,
          0.4722135007849296,
          'P3 hmin'
        );
      }

      expect(res.smin_best.type).toBe('FEASIBLE');

      if (res.smin_best.type === 'FEASIBLE') {
        assertApprox(
          res.smin_best.value,
          0.4495002939447384,
          'P3 smin'
        );
      }

      expect(res.Nbe_best.type).toBe('FEASIBLE');

      if (res.Nbe_best.type === 'FEASIBLE') {
        assertApprox(
          res.Nbe_best.value,
          3678.16091954023,
          'P3 Nbe'
        );
      }

      expect(res.regime).toBe(
        'REGIME_III_BEST_BASELINE_ADVANTAGE'
      );
    });

    test('Live Point — Intermediate Advantage', () => {
      const res = computeCompressionDividendV1({
        h: 0.65,
        s: 0.58,
        Isetup: 350,
        N: 15000
      });

      assertApprox(
        res.C3_marginal,
        0.087755,
        'Live C3'
      );

      assertApprox(res.LC1, 2025, 'Live LC1');
      assertApprox(res.LC2, 1350, 'Live LC2');
      assertApprox(
        res.LC3,
        1666.325,
        'Live LC3'
      );

      assertApprox(
        res.Dpure,
        358.675,
        'Live Dpure'
      );

      assertApprox(
        res.Dcache,
        -316.325,
        'Live Dcache'
      );

      assertApprox(
        res.Dincremental,
        -316.325,
        'Live Dincremental'
      );

      expect(res.hmin_best.type).toBe('FEASIBLE');

      if (res.hmin_best.type === 'FEASIBLE') {
        assertApprox(
          res.hmin_best.value,
          0.9228115567054769,
          'Live hmin'
        );
      }

      expect(res.smin_best.type).toBe('FEASIBLE');

      if (res.smin_best.type === 'FEASIBLE') {
        assertApprox(
          res.smin_best.value,
          0.8203228869895537,
          'Live smin'
        );
      }

      expect(res.Nbe_best.type).toBe('FEASIBLE');

      if (res.Nbe_best.type === 'FEASIBLE') {
        assertApprox(
          res.Nbe_best.value,
          155902.00445434298,
          'Live Nbe'
        );
      }

      expect(res.regime).toBe(
        'REGIME_II_INTERMEDIATE_ADVANTAGE'
      );
    });

    // ==========================================
    // BOUNDARY CONDITIONS
    // ==========================================

    test('Boundary — h equals zero', () => {
      const res = computeCompressionDividendV1({
        h: 0,
        s: 0.50,
        Isetup: 100,
        N: 5000
      });

      assertApprox(res.C3_marginal, 0.138);
      assertApprox(res.LC1, 675);
      assertApprox(res.LC2, 450);
      assertApprox(res.LC3, 790);
      assertApprox(res.Dpure, -115);
      assertApprox(res.Dcache, -340);
      assertApprox(res.Dincremental, -340);

      expect(res.smin_best.type).toBe(
        'INFEASIBLE_AT_ZERO_HIT_RATE'
      );

      expect(res.regime).toBe(
        'REGIME_I_DEFICIT'
      );
    });

    test('Boundary — h equals one', () => {
      const res = computeCompressionDividendV1({
        h: 1,
        s: 0.50,
        Isetup: 100,
        N: 5000
      });

      assertApprox(res.C3_marginal, 0.0715);
      assertApprox(res.LC1, 675);
      assertApprox(res.LC2, 450);
      assertApprox(res.LC3, 457.5);
      assertApprox(res.Dpure, 217.5);
      assertApprox(res.Dcache, -7.5);
      assertApprox(res.Dincremental, -7.5);

      expect(res.regime).toBe(
        'REGIME_II_INTERMEDIATE_ADVANTAGE'
      );
    });

    test('Boundary — s equals zero', () => {
      const res = computeCompressionDividendV1({
        h: 0.80,
        s: 0,
        Isetup: 100,
        N: 10000
      });

      assertApprox(res.C3_marginal, 0.1388);
      assertApprox(res.LC3, 1488);
      assertApprox(res.Dpure, -138);
      assertApprox(res.Dcache, -588);
      assertApprox(res.Dincremental, -588);

      expect(res.hmin_best.type).toBe(
        'INFEASIBLE_AT_CURRENT_S'
      );

      expect(res.regime).toBe(
        'REGIME_I_DEFICIT'
      );
    });

    test('Boundary — s equals one', () => {
      const res = computeCompressionDividendV1({
        h: 0.80,
        s: 1,
        Isetup: 100,
        N: 10000
      });

      assertApprox(res.C3_marginal, 0.0308);
      assertApprox(res.LC3, 408);
      assertApprox(res.Dpure, 942);
      assertApprox(res.Dcache, 492);
      assertApprox(res.Dincremental, 492);

      expect(res.regime).toBe(
        'REGIME_III_BEST_BASELINE_ADVANTAGE'
      );
    });

    test('Boundary — Isetup equals zero', () => {
      const res = computeCompressionDividendV1({
        h: 0.50,
        s: 0.50,
        Isetup: 0,
        N: 10000
      });

      assertApprox(res.C3_marginal, 0.10475);
      assertApprox(res.LC3, 1047.5);
      assertApprox(res.Dpure, 302.5);
      assertApprox(res.Dcache, -147.5);
      assertApprox(res.Dincremental, -147.5);

      expect(res.regime).toBe(
        'REGIME_II_INTERMEDIATE_ADVANTAGE'
      );
    });

    test('Boundary — N equals one', () => {
      const res = computeCompressionDividendV1({
        h: 0.70,
        s: 0.70,
        Isetup: 50,
        N: 1
      });

      assertApprox(res.C3_marginal, 0.07255);
      assertApprox(res.LC3, 50.07255);
      assertApprox(res.Dpure, -49.93755);
      assertApprox(res.Dcache, -49.98255);
      assertApprox(
        res.Dincremental,
        -49.98255
      );

      expect(res.regime).toBe(
        'REGIME_I_DEFICIT'
      );
    });

    test(
      'Boundary — zero marginal savings and zero setup',
      () => {
        const targetH = 24 / 67;

        const res = computeCompressionDividendV1({
          h: targetH,
          s: 1,
          Isetup: 0,
          N: 10000
        });

        assertApprox(
          res.C3_marginal,
          0.09,
          'Zero-savings C3'
        );

        expect(res.Nbe_best.type).toBe(
          'BREAK_EVEN_AT_ALL_VOLUMES'
        );

        assertApprox(
          res.Dincremental,
          0,
          'Zero-savings dividend'
        );

        expect(res.regime).toBe(
          'REGIME_III_BEST_BASELINE_ADVANTAGE'
        );
      }
    );

    // ==========================================
    // DECOUPLED FEASIBILITY
    // ==========================================

    test(
      'hmin can fail while smin remains finite',
      () => {
        const res = computeCompressionDividendV1({
          h: 0.80,
          s: 0.005,
          Isetup: 50,
          N: 20000
        });

        expect(res.hmin_best.type).toBe(
          'INFEASIBLE_AT_CURRENT_S'
        );

        expect(res.smin_best.type).toBe(
          'FEASIBLE'
        );

        if (res.smin_best.type === 'FEASIBLE') {
          assertApprox(
            res.smin_best.value,
            0.475,
            'Decoupled smin'
          );
        }
      }
    );

    // ==========================================
    // INPUT VALIDATION
    // ==========================================

    test('Validation — non-finite h', () => {
      expectValidation(
        {
          h: Number.NaN,
          s: 0.5,
          Isetup: 100,
          N: 1000
        },
        'h'
      );

      expectValidation(
        {
          h: Number.POSITIVE_INFINITY,
          s: 0.5,
          Isetup: 100,
          N: 1000
        },
        'h'
      );
    });

    test('Validation — non-finite s', () => {
      expectValidation(
        {
          h: 0.5,
          s: Number.NaN,
          Isetup: 100,
          N: 1000
        },
        's'
      );

      expectValidation(
        {
          h: 0.5,
          s: Number.POSITIVE_INFINITY,
          Isetup: 100,
          N: 1000
        },
        's'
      );
    });

    test('Validation — non-finite Isetup', () => {
      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: Number.NaN,
          N: 1000
        },
        'Isetup'
      );

      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: Number.POSITIVE_INFINITY,
          N: 1000
        },
        'Isetup'
      );
    });

    test('Validation — invalid N', () => {
      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: 100,
          N: 0
        },
        'N'
      );

      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: 100,
          N: 50.5
        },
        'N'
      );

      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: 100,
          N: Number.POSITIVE_INFINITY
        },
        'N'
      );
    });

    test('Validation — out-of-range values', () => {
      expectValidation(
        {
          h: -0.01,
          s: 0.5,
          Isetup: 100,
          N: 1000
        },
        'h'
      );

      expectValidation(
        {
          h: 1.01,
          s: 0.5,
          Isetup: 100,
          N: 1000
        },
        'h'
      );

      expectValidation(
        {
          h: 0.5,
          s: -0.01,
          Isetup: 100,
          N: 1000
        },
        's'
      );

      expectValidation(
        {
          h: 0.5,
          s: 1.01,
          Isetup: 100,
          N: 1000
        },
        's'
      );

      expectValidation(
        {
          h: 0.5,
          s: 0.5,
          Isetup: -1,
          N: 1000
        },
        'Isetup'
      );
    });

    // ==========================================
    // DETERMINISTIC PROPERTY GRID
    // ==========================================

    test(
      'Deterministic parameter-grid sweep',
      () => {
        let iterations = 0;

        for (
          let hIndex = 0;
          hIndex <= 20;
          hIndex++
        ) {
          const h = hIndex * 0.05;

          for (
            let sIndex = 0;
            sIndex <= 10;
            sIndex++
          ) {
            const s = sIndex * 0.10;

            for (
              let setupIndex = 0;
              setupIndex <= 4;
              setupIndex++
            ) {
              const Isetup =
                setupIndex * 150;

              for (
                let nIndex = 1;
                nIndex <= 10;
                nIndex++
              ) {
                const N =
                  nIndex * 2500;

                const res =
                  computeCompressionDividendV1({
                    h,
                    s,
                    Isetup,
                    N
                  });

                assertApprox(
                  res.LC1,
                  N * 0.135,
                  'Grid LC1'
                );

                assertApprox(
                  res.LC2,
                  N * 0.09,
                  'Grid LC2'
                );

                assertApprox(
                  res.Dpure,
                  res.LC1 - res.LC3,
                  'Grid Dpure'
                );

                assertApprox(
                  res.Dcache,
                  res.LC2 - res.LC3,
                  'Grid Dcache'
                );

                assertApprox(
                  res.Dincremental,
                  Math.min(
                    res.Dpure,
                    res.Dcache
                  ),
                  'Grid Dincremental'
                );

                assertApprox(
                  res.Dincremental,
                  res.Dcache,
                  'Grid optimized baseline'
                );

                assertApprox(
                  res.Dpure -
                    res.Dcache,
                  0.045 * N,
                  'Grid structural spacing'
                );

                iterations++;
              }
            }
          }
        }

        expect(iterations).toBe(11550);
      }
    );
  }
);
