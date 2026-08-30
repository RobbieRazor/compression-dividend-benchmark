/**
 * Compression Dividend Benchmark — Study 004 deterministic calculator.
 *
 * Implements CD004-MODEL-REGISTRY-1.0 with exact rational arithmetic.
 * This module does not modify the frozen v1.0 engine.
 */

export const STUDY_ID = 'CD-WORKLOAD-20260829-004';
export const MODEL_REGISTRY_ID = 'CD004-MODEL-REGISTRY-1.0';

const ZERO = 0n;
const ONE = 1n;

export class Study004ValidationError extends Error {
  constructor(field, message) {
    super(`Study 004 validation error [${field}]: ${message}`);
    this.name = 'Study004ValidationError';
    this.field = field;
  }
}

function absBigInt(value) {
  return value < ZERO ? -value : value;
}

function gcd(a, b) {
  let left = absBigInt(a);
  let right = absBigInt(b);

  while (right !== ZERO) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }

  return left === ZERO ? ONE : left;
}

export class ExactRational {
  constructor(numerator, denominator = ONE) {
    if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint') {
      throw new TypeError('ExactRational requires bigint numerator and denominator.');
    }

    if (denominator === ZERO) {
      throw new RangeError('ExactRational denominator must not be zero.');
    }

    const sign = denominator < ZERO ? -ONE : ONE;
    const divisor = gcd(numerator, denominator);

    this.numerator = (numerator * sign) / divisor;
    this.denominator = (denominator * sign) / divisor;

    Object.freeze(this);
  }

  static fromInteger(value, field = 'integer') {
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value)
    ) {
      throw new Study004ValidationError(
        field,
        'must be represented as a JSON safe integer.'
      );
    }

    return new ExactRational(BigInt(value));
  }

  static fromDecimalString(value, field = 'decimal') {
    if (typeof value !== 'string') {
      throw new Study004ValidationError(
        field,
        'must be represented as a base-10 decimal string.'
      );
    }

    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);

    if (!match) {
      throw new Study004ValidationError(
        field,
        'must use plain base-10 notation without signs other than a leading minus, separators, or exponents.'
      );
    }

    const [, negative, whole, fraction = ''] = match;
    const scale = 10n ** BigInt(fraction.length);
    const magnitude = BigInt(`${whole}${fraction}`);
    const numerator = negative === '-' ? -magnitude : magnitude;

    return new ExactRational(numerator, scale);
  }

  add(other) {
    return new ExactRational(
      this.numerator * other.denominator +
        other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  subtract(other) {
    return new ExactRational(
      this.numerator * other.denominator -
        other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  multiply(other) {
    return new ExactRational(
      this.numerator * other.numerator,
      this.denominator * other.denominator
    );
  }

  divide(other) {
    if (other.numerator === ZERO) {
      throw new RangeError('Cannot divide by zero.');
    }

    return new ExactRational(
      this.numerator * other.denominator,
      this.denominator * other.numerator
    );
  }

  compare(other) {
    const difference =
      this.numerator * other.denominator -
      other.numerator * this.denominator;

    if (difference < ZERO) return -1;
    if (difference > ZERO) return 1;
    return 0;
  }

  isZero() {
    return this.numerator === ZERO;
  }

  ceilBigInt() {
    const quotient = this.numerator / this.denominator;
    const remainder = this.numerator % this.denominator;

    if (remainder === ZERO || this.numerator < ZERO) {
      return quotient;
    }

    return quotient + ONE;
  }

  toRoundedDecimal(places = 18) {
    if (!Number.isSafeInteger(places) || places < 0) {
      throw new RangeError('Decimal places must be a nonnegative safe integer.');
    }

    const negative = this.numerator < ZERO;
    const magnitude = absBigInt(this.numerator);
    const scale = 10n ** BigInt(places);
    let scaled = (magnitude * scale) / this.denominator;
    const remainder = (magnitude * scale) % this.denominator;

    if (remainder * 2n >= this.denominator) {
      scaled += ONE;
    }

    let digits = scaled.toString();

    if (places === 0) {
      return `${negative && scaled !== ZERO ? '-' : ''}${digits}`;
    }

    digits = digits.padStart(places + 1, '0');
    const whole = digits.slice(0, -places);
    const fractional = digits.slice(-places).replace(/0+$/, '');
    const sign = negative && scaled !== ZERO ? '-' : '';

    return fractional.length > 0
      ? `${sign}${whole}.${fractional}`
      : `${sign}${whole}`;
  }
}

function exactValue(value) {
  return {
    numerator: value.numerator.toString(),
    denominator: value.denominator.toString(),
    decimal_18_rounded: value.toRoundedDecimal(18)
  };
}

function parseNonnegative(value, field) {
  const parsed = ExactRational.fromDecimalString(value, field);

  if (parsed.compare(new ExactRational(ZERO)) < 0) {
    throw new Study004ValidationError(field, 'must be nonnegative.');
  }

  return parsed;
}

function parsePositive(value, field) {
  const parsed = ExactRational.fromDecimalString(value, field);

  if (parsed.compare(new ExactRational(ZERO)) <= 0) {
    throw new Study004ValidationError(field, 'must be greater than zero.');
  }

  return parsed;
}

function parseProbability(value, field) {
  const parsed = parseNonnegative(value, field);
  const one = new ExactRational(ONE);

  if (parsed.compare(one) > 0) {
    throw new Study004ValidationError(field, 'must not exceed one.');
  }

  return parsed;
}

function parsePositiveInteger(value, field) {
  const parsed = ExactRational.fromInteger(value, field);

  if (parsed.numerator <= ZERO) {
    throw new Study004ValidationError(field, 'must be greater than zero.');
  }

  return parsed.numerator;
}

function parseNonnegativeInteger(value, field) {
  const parsed = ExactRational.fromInteger(value, field);

  if (parsed.numerator < ZERO) {
    throw new Study004ValidationError(field, 'must be nonnegative.');
  }

  return parsed.numerator;
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Study004ValidationError(field, 'must be a boolean.');
  }

  return value;
}

function minimumRational(entries) {
  return entries.reduce((best, candidate) =>
    candidate.value.compare(best.value) < 0 ? candidate : best
  );
}

function minimumBigInt(values) {
  return values.reduce((best, candidate) =>
    candidate < best ? candidate : best
  );
}

function ceilingRatio(numerator, denominator) {
  return numerator.divide(denominator).ceilBigInt();
}

function safeIntegerFromBigInt(value, field) {
  const converted = Number(value);

  if (!Number.isSafeInteger(converted)) {
    throw new Study004ValidationError(
      field,
      'derived result exceeds the JSON safe-integer range.'
    );
  }

  return converted;
}

export function minimumSingleCycleFanout(input) {
  const I3 = parseNonnegative(input.I3, 'I3');
  const P3a = parseNonnegative(input.P3a, 'P3a');
  const F3 = parseNonnegative(input.F3, 'F3');
  const Cbest = parseNonnegative(input.Cbest, 'Cbest');
  const G = parseNonnegative(input.G, 'G');
  const marginalSavings = Cbest.subtract(G);
  const fixedCost = I3.add(P3a).add(F3);

  if (marginalSavings.compare(new ExactRational(ZERO)) <= 0) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-K-MIN',
      status: 'INFEASIBLE_NONPOSITIVE_MARGINAL_SAVINGS',
      marginal_savings: exactValue(marginalSavings)
    };
  }

  if (fixedCost.isZero()) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-K-MIN',
      status: 'FEASIBLE_AT_ALL_POSITIVE_VOLUMES',
      raw_ceiling: 0,
      minimum_valid_accepted_tasks: 1,
      marginal_savings: exactValue(marginalSavings)
    };
  }

  const threshold = ceilingRatio(fixedCost, marginalSavings);

  return {
    registry_id: MODEL_REGISTRY_ID,
    equation_id: 'CD004-EQ-K-MIN',
    status: 'FEASIBLE',
    minimum_accepted_tasks: safeIntegerFromBigInt(threshold, 'K_min'),
    fixed_cost: exactValue(fixedCost),
    marginal_savings: exactValue(marginalSavings)
  };
}

export function maximumViableAcquisitionPrice(input) {
  const LCbest = parseNonnegative(input.LCbest, 'LCbest');
  const I3 = parseNonnegative(input.I3, 'I3');
  const F3 = parseNonnegative(input.F3, 'F3');
  const N = ExactRational.fromInteger(input.N, 'N');
  const G = parseNonnegative(input.G, 'G');
  const A = ExactRational.fromInteger(input.A, 'A');

  if (N.numerator <= ZERO || A.numerator <= ZERO) {
    throw new Study004ValidationError('N_or_A', 'N and A must be greater than zero.');
  }

  const raw = LCbest
    .subtract(I3)
    .subtract(F3)
    .subtract(N.multiply(G))
    .divide(A);

  return {
    registry_id: MODEL_REGISTRY_ID,
    equation_id: 'CD004-EQ-P3A-MAX',
    status:
      raw.compare(new ExactRational(ZERO)) < 0
        ? 'INFEASIBLE_NONNEGATIVE_ACQUISITION_PRICE'
        : 'FEASIBLE',
    value: exactValue(raw)
  };
}

export function minimumGovernedHitRate(input) {
  const I3 = parseNonnegative(input.I3, 'I3');
  const P3a = parseNonnegative(input.P3a, 'P3a');
  const F3 = parseNonnegative(input.F3, 'F3');
  const N = ExactRational.fromInteger(input.N, 'N');
  const A = ExactRational.fromInteger(input.A, 'A');
  const Chit = parseNonnegative(input.Chit, 'Chit');
  const Cmisspath = parseNonnegative(input.Cmisspath, 'Cmisspath');
  const LCbest = parseNonnegative(input.LCbest, 'LCbest');

  if (N.numerator <= ZERO || A.numerator <= ZERO) {
    throw new Study004ValidationError('N_or_A', 'N and A must be greater than zero.');
  }

  if (Chit.compare(Cmisspath) >= 0) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-H-MIN',
      status: 'INFEASIBLE_THROUGH_HIT_RATE_IMPROVEMENT',
      reason: 'CHIT_NOT_LESS_THAN_CMISSPATH'
    };
  }

  const numerator = I3
    .add(A.multiply(P3a))
    .add(F3)
    .add(N.multiply(Cmisspath))
    .subtract(LCbest);
  const denominator = N.multiply(Cmisspath.subtract(Chit));
  const raw = numerator.divide(denominator);
  const zero = new ExactRational(ZERO);
  const one = new ExactRational(ONE);

  let status = 'FEASIBLE';

  if (raw.compare(zero) <= 0) {
    status = 'FEASIBLE_AT_ALL_VALID_HIT_RATES';
  } else if (raw.compare(one) > 0) {
    status = 'NO_VIABLE_HIT_RATE';
  }

  return {
    registry_id: MODEL_REGISTRY_ID,
    equation_id: 'CD004-EQ-H-MIN',
    status,
    raw_threshold: exactValue(raw)
  };
}

export function minimumSubstitutionFraction(input) {
  const I3 = parseNonnegative(input.I3, 'I3');
  const P3a = parseNonnegative(input.P3a, 'P3a');
  const F3 = parseNonnegative(input.F3, 'F3');
  const N = ExactRational.fromInteger(input.N, 'N');
  const A = ExactRational.fromInteger(input.A, 'A');
  const h = parseProbability(input.h, 'h');
  const Cr = parseNonnegative(input.Cr, 'Cr');
  const Cv = parseNonnegative(input.Cv, 'Cv');
  const Cre = parsePositive(input.Cre, 'Cre');
  const Cmisspath = parseNonnegative(input.Cmisspath, 'Cmisspath');
  const LCbest = parseNonnegative(input.LCbest, 'LCbest');

  if (N.numerator <= ZERO || A.numerator <= ZERO) {
    throw new Study004ValidationError('N_or_A', 'N and A must be greater than zero.');
  }

  if (h.isZero()) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-S-MIN',
      status: 'UNDEFINED_AT_ZERO_HIT_RATE'
    };
  }

  const one = new ExactRational(ONE);
  const hitBeforeSubstitution = Cr.add(Cv).add(Cre);
  const expectedBeforeSubstitution = h
    .multiply(hitBeforeSubstitution)
    .add(one.subtract(h).multiply(Cmisspath));
  const numerator = I3
    .add(A.multiply(P3a))
    .add(F3)
    .add(N.multiply(expectedBeforeSubstitution))
    .subtract(LCbest);
  const denominator = N.multiply(h).multiply(Cre);
  const raw = numerator.divide(denominator);
  const zero = new ExactRational(ZERO);

  let status = 'FEASIBLE';

  if (raw.compare(zero) <= 0) {
    status = 'FEASIBLE_AT_ZERO_SUBSTITUTION';
  } else if (raw.compare(one) > 0) {
    status = 'NO_VIABLE_SUBSTITUTION_FRACTION';
  }

  return {
    registry_id: MODEL_REGISTRY_ID,
    equation_id: 'CD004-EQ-S-MIN',
    status,
    raw_threshold: exactValue(raw)
  };
}

export function minimumStableLifecycleVolume(input) {
  const I3 = parseNonnegative(input.I3, 'I3');
  const P3a = parseNonnegative(input.P3a, 'P3a');
  const F3 = parseNonnegative(input.F3, 'F3');
  const A = ExactRational.fromInteger(input.A, 'A');
  const Cbest = parseNonnegative(input.Cbest, 'Cbest');
  const G = parseNonnegative(input.G, 'G');

  if (A.numerator <= ZERO) {
    throw new Study004ValidationError('A', 'must be greater than zero.');
  }

  const fixedCost = I3.add(A.multiply(P3a)).add(F3);
  const marginalSavings = Cbest.subtract(G);

  if (marginalSavings.compare(new ExactRational(ZERO)) <= 0) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-N-MIN',
      status: 'INFEASIBLE_NONPOSITIVE_MARGINAL_SAVINGS',
      marginal_savings: exactValue(marginalSavings)
    };
  }

  if (fixedCost.isZero()) {
    return {
      registry_id: MODEL_REGISTRY_ID,
      equation_id: 'CD004-EQ-N-MIN',
      status: 'FEASIBLE_AT_ALL_POSITIVE_VOLUMES',
      raw_ceiling: 0,
      minimum_valid_accepted_tasks: 1
    };
  }

  const threshold = ceilingRatio(fixedCost, marginalSavings);

  return {
    registry_id: MODEL_REGISTRY_ID,
    equation_id: 'CD004-EQ-N-MIN',
    status: 'FEASIBLE',
    minimum_accepted_tasks: safeIntegerFromBigInt(threshold, 'N_min')
  };
}

function censoredResult(reasons) {
  const precedence = [
    'QUALITY_CENSORED',
    'AVAILABILITY_CENSORED',
    'RIGHTS_CENSORED',
    'MEASUREMENT_INCOMPLETE'
  ];
  const uniqueReasons = [...new Set(reasons)];
  const primary = precedence.find((label) => uniqueReasons.includes(label));

  return {
    study_id: STUDY_ID,
    registry_id: MODEL_REGISTRY_ID,
    result_type: 'CENSORED',
    primary_label: primary,
    censor_reasons: uniqueReasons,
    economic_classification_performed: false
  };
}

function rawClaimedFanoutAboveOne(p3Input) {
  const values = [
    p3Input?.Ktechnical,
    p3Input?.Krights,
    p3Input?.Klifetime,
    p3Input?.Kdemand
  ];

  if (
    values.some(
      (value) =>
        typeof value !== 'number' ||
        !Number.isSafeInteger(value) ||
        value < 0
    )
  ) {
    return false;
  }

  return values.every((value) => value > 1);
}

function initialEligibilityCensors(eligibility, p3Input) {
  const reasons = [];
  const p1 = eligibility?.p1;
  const p3 = eligibility?.p3;

  if (!p1 || !p3) {
    return ['MEASUREMENT_INCOMPLETE'];
  }

  const requiredFlags = [
    ['eligibility.p1.available', p1.available],
    ['eligibility.p1.quality_equivalent', p1.quality_equivalent],
    ['eligibility.p3.available', p3.available],
    ['eligibility.p3.semantic_equivalent', p3.semantic_equivalent],
    ['eligibility.p3.representation_equivalent', p3.representation_equivalent],
    ['eligibility.p3.quality_gate_pass', p3.quality_gate_pass],
    ['eligibility.p3.rights_supported', p3.rights_supported],
    ['eligibility.p3.measurement_complete', p3.measurement_complete]
  ];

  if (requiredFlags.some(([, value]) => typeof value !== 'boolean')) {
    reasons.push('MEASUREMENT_INCOMPLETE');
    return reasons;
  }

  if (
    !p1.quality_equivalent ||
    !p3.semantic_equivalent ||
    !p3.representation_equivalent ||
    !p3.quality_gate_pass
  ) {
    reasons.push('QUALITY_CENSORED');
  }

  if (!p1.available || !p3.available) {
    reasons.push('AVAILABILITY_CENSORED');
  }

  if (!p3.rights_supported && rawClaimedFanoutAboveOne(p3Input)) {
    reasons.push('RIGHTS_CENSORED');
  }

  if (!p3.measurement_complete) {
    reasons.push('MEASUREMENT_INCOMPLETE');
  }

  return reasons;
}

export function calculateStudy004Point(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Study004ValidationError('input', 'must be an object.');
  }

  const initialCensors = initialEligibilityCensors(
    input.eligibility,
    input.p3
  );

  if (initialCensors.length > 0) {
    return censoredResult(initialCensors);
  }

  const Ninteger = parsePositiveInteger(input.N, 'N');
  const N = new ExactRational(Ninteger);
  const C1 = parseNonnegative(input.p1?.C1, 'p1.C1');
  const LC1 = N.multiply(C1);
  const baselines = [{ id: 'P1', value: LC1 }];
  const excludedBaselines = [];
  const p2Eligibility = input.eligibility?.p2;

  if (p2Eligibility !== undefined) {
    requireBoolean(p2Eligibility.available, 'eligibility.p2.available');
    requireBoolean(
      p2Eligibility.quality_equivalent,
      'eligibility.p2.quality_equivalent'
    );

    if (p2Eligibility.available && p2Eligibility.quality_equivalent) {
      const q2 = parseProbability(input.p2?.q2, 'p2.q2');
      const C2hit = parseNonnegative(input.p2?.C2hit, 'p2.C2hit');
      const C2miss = parseNonnegative(input.p2?.C2miss, 'p2.C2miss');
      const W2 = parseNonnegative(input.p2?.W2, 'p2.W2');
      const one = new ExactRational(ONE);
      const expectedP2 = q2
        .multiply(C2hit)
        .add(one.subtract(q2).multiply(C2miss));
      const LC2 = W2.add(N.multiply(expectedP2));

      baselines.push({ id: 'P2', value: LC2 });
    } else {
      excludedBaselines.push({
        id: 'P2',
        reason: p2Eligibility.available
          ? 'NOT_QUALITY_EQUIVALENT'
          : 'UNAVAILABLE'
      });
    }
  } else {
    excludedBaselines.push({ id: 'P2', reason: 'NOT_DECLARED' });
  }

  const p3 = input.p3 ?? {};
  const Ktechnical = parsePositiveInteger(p3.Ktechnical, 'p3.Ktechnical');
  const Krights = parsePositiveInteger(p3.Krights, 'p3.Krights');
  const Klifetime = parseNonnegativeInteger(p3.Klifetime, 'p3.Klifetime');
  const Kdemand = parsePositiveInteger(p3.Kdemand, 'p3.Kdemand');
  const Keff = minimumBigInt([Ktechnical, Krights, Klifetime, Kdemand]);

  if (Keff < ONE) {
    return censoredResult(['AVAILABILITY_CENSORED']);
  }

  if (!input.eligibility.p3.rights_supported && Keff > ONE) {
    return censoredResult(['RIGHTS_CENSORED']);
  }

  const A = (Ninteger + Keff - ONE) / Keff;
  const I3 = parseNonnegative(p3.I3, 'p3.I3');
  const P3a = parseNonnegative(p3.P3a, 'p3.P3a');
  const F3 = parseNonnegative(p3.F3, 'p3.F3');
  const h = parseProbability(p3.h, 'p3.h');
  const Cr = parseNonnegative(p3.Cr, 'p3.Cr');
  const Cv = parseNonnegative(p3.Cv, 'p3.Cv');
  const Cre = parsePositive(p3.Cre, 'p3.Cre');
  const Cmiss = parseNonnegative(p3.Cmiss, 'p3.Cmiss');
  const Cf = parseNonnegative(p3.Cf, 'p3.Cf');
  const hasResidual = p3.Cres !== undefined;
  const hasSubstitution = p3.s !== undefined;

  if (hasResidual === hasSubstitution) {
    return censoredResult(['MEASUREMENT_INCOMPLETE']);
  }

  let Cres;
  let substitution;
  let residualMode;

  if (hasSubstitution) {
    substitution = parseProbability(p3.s, 'p3.s');
    Cres = new ExactRational(ONE).subtract(substitution).multiply(Cre);
    residualMode = 'CRES_DERIVED_FROM_S';
  } else {
    Cres = parseNonnegative(p3.Cres, 'p3.Cres');

    if (Cres.compare(Cre) > 0) {
      return censoredResult(['MEASUREMENT_INCOMPLETE']);
    }

    substitution = new ExactRational(ONE).subtract(Cres.divide(Cre));
    residualMode = 'S_DERIVED_FROM_CRES';
  }

  const Chit = Cr.add(Cv).add(Cres);
  const Cmisspath = Cmiss.add(Cf);
  const G = h
    .multiply(Chit)
    .add(new ExactRational(ONE).subtract(h).multiply(Cmisspath));
  const LC3 = I3
    .add(new ExactRational(A).multiply(P3a))
    .add(F3)
    .add(N.multiply(G));
  const bestEntry = minimumRational(baselines);
  const LCbest = bestEntry.value;
  const bestBaselineIds = baselines
    .filter((entry) => entry.value.compare(LCbest) === 0)
    .map((entry) => entry.id);
  const Dincremental = LCbest.subtract(LC3);

  let primaryLabel;

  if (LC3.compare(LCbest) <= 0) {
    primaryLabel = 'REGIME_III_BEST_BASELINE_ADVANTAGE';
  } else if (LC3.compare(LC1) <= 0) {
    primaryLabel = 'REGIME_II_INTERMEDIATE_ADVANTAGE';
  } else {
    primaryLabel = 'REGIME_I_DEFICIT';
  }

  const lifecycleCosts = {
    LC1: exactValue(LC1),
    LCbest: exactValue(LCbest),
    LC3: exactValue(LC3)
  };

  const p2Entry = baselines.find((entry) => entry.id === 'P2');

  if (p2Entry) {
    lifecycleCosts.LC2 = exactValue(p2Entry.value);
  }

  return {
    study_id: STUDY_ID,
    registry_id: MODEL_REGISTRY_ID,
    equation_ids: [
      'CD004-EQ-LC1',
      ...(p2Entry ? ['CD004-EQ-LC2'] : []),
      'CD004-EQ-LCBEST',
      'CD004-EQ-KEFF',
      'CD004-EQ-A',
      hasSubstitution ? 'CD004-EQ-CRES' : 'CD004-EQ-S',
      'CD004-EQ-CHIT',
      'CD004-EQ-CMISSPATH',
      'CD004-EQ-G',
      'CD004-EQ-LC3',
      'CD004-EQ-DINCREMENTAL'
    ],
    result_type: 'ECONOMIC_CLASSIFICATION',
    primary_label: primaryLabel,
    economic_classification_performed: true,
    best_available_baselines: bestBaselineIds,
    excluded_baselines: excludedBaselines,
    derived_counts: {
      N: safeIntegerFromBigInt(Ninteger, 'N'),
      Keff: safeIntegerFromBigInt(Keff, 'Keff'),
      A: safeIntegerFromBigInt(A, 'A')
    },
    residual_mode: residualMode,
    derived_costs: {
      Cres: exactValue(Cres),
      s: exactValue(substitution),
      Chit: exactValue(Chit),
      Cmisspath: exactValue(Cmisspath),
      G: exactValue(G),
      ...lifecycleCosts,
      Dincremental: exactValue(Dincremental)
    }
  };
}
