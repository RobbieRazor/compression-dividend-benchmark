/**
 * COMPRESSION DIVIDEND BENCHMARK v1.0 — HARDENED CORE ENGINE
 * Frozen mathematical core for independent Vitest verification.
 */

// ==========================================
// 1. HARDENED TYPES
// ==========================================

export interface EngineInputs {
  /** Hit Rate: 0 <= h <= 1 */
  h: number;

  /** Economic Substitution Fraction: 0 <= s <= 1 */
  s: number;

  /** Setup Investment in dollars: Isetup >= 0 */
  Isetup: number;

  /** Lifecycle Volume: N > 0 safe integer */
  N: number;
}

export type HitRateThresholdResult =
  | { type: 'FEASIBLE'; value: number }
  | { type: 'INFEASIBLE_AT_CURRENT_S' }
  | { type: 'NO_VIABLE_HIT_RATE'; value: number };

export type SubstitutionThresholdResult =
  | { type: 'FEASIBLE'; value: number }
  | { type: 'INFEASIBLE_AT_ZERO_HIT_RATE' }
  | { type: 'NO_VIABLE_SUBSTITUTION_FRACTION'; value: number };

export type BreakEvenResult =
  | { type: 'FEASIBLE'; value: number }
  | { type: 'BREAK_EVEN_AT_ALL_VOLUMES' }
  | { type: 'NO_FINITE_BREAK_EVEN_AT_CURRENT_H_S' };

export type StructuralRegime =
  | 'REGIME_I_DEFICIT'
  | 'REGIME_II_INTERMEDIATE_ADVANTAGE'
  | 'REGIME_III_BEST_BASELINE_ADVANTAGE';

export interface BenchmarkResult {
  C3_marginal: number;
  LC1: number;
  LC2: number;
  LC3: number;
  Dpure: number;
  Dcache: number;
  Dincremental: number;
  hmin_best: HitRateThresholdResult;
  smin_best: SubstitutionThresholdResult;
  Nbe_best: BreakEvenResult;
  regime: StructuralRegime;
}

export class ValidationError extends Error {
  constructor(
    public field: keyof EngineInputs | 'general',
    message: string
  ) {
    super(`Validation Error context [${field}]: ${message}`);
    this.name = 'ValidationError';
  }
}

export class InvariantViolationError extends Error {
  constructor(message: string) {
    super(`Algebraic Invariant Violation: ${message}`);
    this.name = 'InvariantViolationError';
  }
}

// ==========================================
// 2. SCALE-AWARE NUMERIC UTILITY
// ==========================================

export function approximatelyEqual(
  a: number,
  b: number,
  epsilon = 1e-12
): boolean {
  if (a === b) return true;

  const diff = Math.abs(a - b);

  return (
    diff <=
    epsilon * Math.max(1, Math.abs(a), Math.abs(b))
  );
}

// ==========================================
// 3. CORE CALCULATION ENGINE
// ==========================================

export function computeCompressionDividendV1(
  inputs: EngineInputs
): BenchmarkResult {
  const { h, s, Isetup, N } = inputs;

  // ------------------------------------------
  // Input validation
  // ------------------------------------------

  if (
    typeof N !== 'number' ||
    !Number.isFinite(N) ||
    !Number.isSafeInteger(N) ||
    N <= 0
  ) {
    throw new ValidationError(
      'N',
      'Lifecycle volume N must be a finite, safe integer greater than 0.'
    );
  }

  if (
    typeof h !== 'number' ||
    !Number.isFinite(h) ||
    h < 0 ||
    h > 1
  ) {
    throw new ValidationError(
      'h',
      'Hit rate h must be a finite number between 0.0 and 1.0.'
    );
  }

  if (
    typeof s !== 'number' ||
    !Number.isFinite(s) ||
    s < 0 ||
    s > 1
  ) {
    throw new ValidationError(
      's',
      'Economic substitution fraction s must be a finite number between 0.0 and 1.0.'
    );
  }

  if (
    typeof Isetup !== 'number' ||
    !Number.isFinite(Isetup) ||
    Isetup < 0
  ) {
    throw new ValidationError(
      'Isetup',
      'Setup investment Isetup must be a finite number greater than or equal to 0.'
    );
  }

  // ------------------------------------------
  // Frozen v1.0 baseline constants
  // ------------------------------------------

  const Cre = 0.1350;
  const C2 = 0.0900;

  const Cb = Math.min(Cre, C2);

  const Cr = 0.0010;
  const Cv = 0.0010;
  const Cp = 0.0015;
  const Cm = 0.0005;
  const Cmiss_overhead = 0.0010;

  if (!approximatelyEqual(Cb, 0.0900)) {
    throw new InvariantViolationError(
      'Baseline cost configuration variance detected.'
    );
  }

  // ------------------------------------------
  // Path 3 marginal cost
  // ------------------------------------------

  const C3_marginal =
    Cr +
    Cv +
    h * (
      Cp +
      Cm +
      (1.0 - s) * Cre
    ) +
    (1.0 - h) * (
      Cmiss_overhead +
      Cre
    );

  // ------------------------------------------
  // Lifecycle costs
  // ------------------------------------------

  const LC1 = N * Cre;

  const LC2 = N * C2;

  const LC3 =
    Isetup +
    N * C3_marginal;

  const LC_base =
    N * Cb;

  // ------------------------------------------
  // Financial dividends
  // ------------------------------------------

  const Dpure =
    LC1 - LC3;

  const Dcache =
    LC2 - LC3;

  const Dincremental =
    LC_base - LC3;

  // ------------------------------------------
  // Decoupled feasibility calculations
  // ------------------------------------------

  let hmin_best: HitRateThresholdResult;

  let smin_best: SubstitutionThresholdResult;

  let Nbe_best: BreakEvenResult;

  // Minimum viable hit rate

  const denominator_h =
    s * Cre +
    Cmiss_overhead -
    Cp -
    Cm;

  if (
    denominator_h < 0 ||
    approximatelyEqual(denominator_h, 0)
  ) {
    hmin_best = {
      type: 'INFEASIBLE_AT_CURRENT_S'
    };
  } else {
    const raw_hmin =
      (
        Isetup / N +
        Cre +
        Cr +
        Cv +
        Cmiss_overhead -
        Cb
      ) /
      denominator_h;

    if (
      raw_hmin > 1.0 &&
      !approximatelyEqual(raw_hmin, 1.0)
    ) {
      hmin_best = {
        type: 'NO_VIABLE_HIT_RATE',
        value: raw_hmin
      };
    } else {
      hmin_best = {
        type: 'FEASIBLE',
        value: raw_hmin
      };
    }
  }

  // Minimum viable economic substitution fraction

  if (
    h === 0 ||
    approximatelyEqual(h, 0)
  ) {
    smin_best = {
      type: 'INFEASIBLE_AT_ZERO_HIT_RATE'
    };
  } else {
    const raw_smin =
      (
        Cre +
        Cr +
        Cv +
        Cmiss_overhead +
        Isetup / N -
        Cb -
        h * (
          Cmiss_overhead -
          Cp -
          Cm
        )
      ) /
      (
        h * Cre
      );

    if (
      raw_smin > 1.0 &&
      !approximatelyEqual(raw_smin, 1.0)
    ) {
      smin_best = {
        type: 'NO_VIABLE_SUBSTITUTION_FRACTION',
        value: raw_smin
      };
    } else {
      smin_best = {
        type: 'FEASIBLE',
        value: raw_smin
      };
    }
  }

  // Break-even volume

  const marginal_savings =
    Cb - C3_marginal;

  if (
    marginal_savings > 0 &&
    !approximatelyEqual(
      marginal_savings,
      0
    )
  ) {
    Nbe_best = {
      type: 'FEASIBLE',
      value:
        Isetup /
        marginal_savings
    };
  } else if (
    approximatelyEqual(
      marginal_savings,
      0
    )
  ) {
    if (
      Isetup > 0 &&
      !approximatelyEqual(
        Isetup,
        0
      )
    ) {
      Nbe_best = {
        type: 'NO_FINITE_BREAK_EVEN_AT_CURRENT_H_S'
      };
    } else {
      Nbe_best = {
        type: 'BREAK_EVEN_AT_ALL_VOLUMES'
      };
    }
  } else {
    Nbe_best = {
      type: 'NO_FINITE_BREAK_EVEN_AT_CURRENT_H_S'
    };
  }

  // ------------------------------------------
  // Structural regime assignment
  // ------------------------------------------

  let regime: StructuralRegime;

  if (
    LC3 > LC1 &&
    !approximatelyEqual(
      LC3,
      LC1
    )
  ) {
    regime =
      'REGIME_I_DEFICIT';
  } else if (
    (
      LC3 <= LC1 ||
      approximatelyEqual(
        LC3,
        LC1
      )
    ) &&
    LC3 > LC_base &&
    !approximatelyEqual(
      LC3,
      LC_base
    )
  ) {
    regime =
      'REGIME_II_INTERMEDIATE_ADVANTAGE';
  } else {
    regime =
      'REGIME_III_BEST_BASELINE_ADVANTAGE';
  }

  const result: BenchmarkResult = {
    C3_marginal,
    LC1,
    LC2,
    LC3,
    Dpure,
    Dcache,
    Dincremental,
    hmin_best,
    smin_best,
    Nbe_best,
    regime
  };

  // ------------------------------------------
  // Runtime invariant verification
  // ------------------------------------------

  executeAutomatedAssertions(
    inputs,
    result,
    Cre,
    C2
  );

  return result;
}

// ==========================================
// 4. RUNTIME ALGEBRAIC INVARIANTS
// ==========================================

function executeAutomatedAssertions(
  inputs: EngineInputs,
  res: BenchmarkResult,
  Cre: number,
  C2: number
): void {
  const N = inputs.N;

  if (
    !approximatelyEqual(
      res.LC1,
      N * Cre
    )
  ) {
    throw new InvariantViolationError(
      'LC1 scale alignment drift.'
    );
  }

  if (
    !approximatelyEqual(
      res.LC2,
      N * C2
    )
  ) {
    throw new InvariantViolationError(
      'LC2 scale alignment drift.'
    );
  }

  if (
    !approximatelyEqual(
      res.Dpure,
      res.LC1 - res.LC3
    )
  ) {
    throw new InvariantViolationError(
      'Dpure baseline breach.'
    );
  }

  if (
    !approximatelyEqual(
      res.Dcache,
      res.LC2 - res.LC3
    )
  ) {
    throw new InvariantViolationError(
      'Dcache baseline breach.'
    );
  }

  const theoretical_min =
    Math.min(
      res.Dpure,
      res.Dcache
    );

  if (
    !approximatelyEqual(
      res.Dincremental,
      theoretical_min
    )
  ) {
    throw new InvariantViolationError(
      'Identity verification failed: Dincremental != min(Dpure, Dcache)'
    );
  }

  if (
    !approximatelyEqual(
      res.Dincremental,
      res.Dcache
    )
  ) {
    throw new InvariantViolationError(
      'Identity verification failed: Optimization logic bypassed C2 constraint.'
    );
  }

  const structural_delta =
    res.Dpure -
    res.Dcache;

  const verified_spacing =
    0.045 *
    N;

  if (
    !approximatelyEqual(
      structural_delta,
      verified_spacing
    )
  ) {
    throw new InvariantViolationError(
      'Divergence window space mismatch.'
    );
  }

  if (
    res.regime ===
      'REGIME_I_DEFICIT' &&
    res.Dpure > 0 &&
    !approximatelyEqual(
      res.Dpure,
      0
    )
  ) {
    throw new InvariantViolationError(
      'Regime I logical collision.'
    );
  }

  if (
    res.regime ===
      'REGIME_II_INTERMEDIATE_ADVANTAGE' &&
    (
      (
        res.Dpure < 0 &&
        !approximatelyEqual(
          res.Dpure,
          0
        )
      ) ||
      res.Dincremental >= 0 ||
      approximatelyEqual(
        res.Dincremental,
        0
      )
    )
  ) {
    throw new InvariantViolationError(
      'Regime II logical collision.'
    );
  }

  if (
    res.regime ===
      'REGIME_III_BEST_BASELINE_ADVANTAGE' &&
    res.Dincremental < 0 &&
    !approximatelyEqual(
      res.Dincremental,
      0
    )
  ) {
    throw new InvariantViolationError(
      'Regime III logical collision.'
    );
  }
}
