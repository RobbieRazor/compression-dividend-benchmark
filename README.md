Compression Dividend Benchmark

A reproducible economic benchmark for measuring when preserved computational state creates a measurable financial advantage over fresh recomputation and provider prompt caching.

Compression Dividend Benchmark v1.0 establishes a frozen computational core for comparing three execution pathways:

Pure Recomputation
Provider Prompt Caching
Governed State Reuse

The benchmark asks a specific question:

When does retrieving and using a validated computational state cost less than reconstructing the equivalent state from scratch or using the best available caching alternative?

Current Status

Compression Dividend Benchmark v1.0

Status: COMPUTATIONAL CORE VERIFIED

Release: v1.0.0

Frozen commit:

a8975fc32303ab6cfd8c4b88cf191dd627b0b87f

Validation completed August 28, 2026.

The frozen v1.0 release includes:

18 Vitest tests passed
0 tests failed
11,550 deterministic parameter combinations exercised
Canonical P1, P2, P3, and Live fixtures verified
Boundary-condition testing
Invalid-input rejection testing
Decoupled feasibility testing
Runtime algebraic invariant testing
SHA-256 integrity records
Git commit and annotated version tag
Published GitHub Release v1.0.0
Benchmark Architecture
Path 1 — Pure Recomputation

Pure Recomputation is fresh logical execution in which no previously computed task-specific state substitutes for any portion of the required reconstruction.

Lifecycle cost:

LC1 = N × Cre

Where:

Cre = fresh recomputation cost per query

N = lifecycle query volume

Path 2 — Provider Prompt Caching

Provider Prompt Caching represents provider-managed context reuse.

On a cache hit, input processing receives discounted pricing, while downstream generation costs continue to apply.

Lifecycle cost:

LC2 = N × C2

For frozen v1.0:

C2 = $0.0900 per query

Path 3 — Governed State Reuse

Governed State Reuse represents retrieval of an existing validated computational state or reusable representation.

Examples may include:

Verified computational results
Structured artifacts
Canonical representations
Graph states
State tokens
Reusable reasoning results
Other sufficiently complete computational states

A successful state hit may substitute for some or all of the equivalent fresh recomputation.

The expected marginal cost is:

C3 = Cr + Cv + h × [Cp + Cm + (1 − s) × Cre] + (1 − h) × [Cmiss_overhead + Cre]

Lifecycle cost:

LC3 = Isetup + N × C3

Core Variables
h — Hit Rate

The probability that an appropriate reusable governed state is successfully located and accepted.

0 ≤ h ≤ 1

A high hit rate alone does not guarantee an economic advantage.

s — Economic Substitution Fraction

Economic Substitution Fraction measures how much equivalent fresh-recomputation cost is actually eliminated when a governed state is successfully reused.

s = Avoided Fresh Recomputation Cost / Original Fresh Recomputation Cost

0 ≤ s ≤ 1

Examples:

s = 0

The retrieved state eliminates none of the equivalent recomputation cost.

s = 0.50

The retrieved state eliminates 50% of equivalent fresh-recomputation cost.

s = 1

The retrieved state completely substitutes for equivalent fresh recomputation.

Economic Substitution Fraction is not automatically equivalent to:

Semantic similarity
Percentage of tokens reused
Percentage of reasoning steps reused
Context overlap
Graph similarity
Cache-hit percentage

Those properties may influence s, but they do not define it.

Isetup — Setup Investment

The fixed upfront investment required to create the governed-state infrastructure being evaluated.

N — Lifecycle Volume

The number of queries or equivalent execution events evaluated across the benchmark lifecycle.

Best Available Baseline

The benchmark does not allow Governed State Reuse to claim an advantage merely because it beats an inefficient recomputation baseline.

Instead:

Cb = minimum of Cre and C2

The Incremental Compression Dividend is measured against the cheapest available baseline.

Compression Dividend Metrics
Dividend vs Pure Recomputation

Dpure = LC1 − LC3

Dividend vs Prompt Caching

Dcache = LC2 − LC3

Incremental Compression Dividend

Dincremental = N × Cb − LC3

This is the primary benchmark metric.

A positive Incremental Compression Dividend means Governed State Reuse has beaten the least-cost competing baseline under the declared assumptions.

Frozen v1.0 Baseline

The v1.0 benchmark uses a synthetic standardized economic baseline:

Cre = $0.1350 per query

C2 = $0.0900 per query

Cb = minimum of Cre and C2

Cr = $0.0010

Cv = $0.0010

Cp = $0.0015

Cm = $0.0005

Cmiss_overhead = $0.0010

These values are intentionally frozen for v1.0 reproducibility.

They are not claims about universal production costs.

Primary Algebraic Invariant

The benchmark enforces:

Dincremental = minimum of Dpure and Dcache

Because the frozen v1.0 baseline has:

C2 < Cre

the following special-case invariant must always hold:

Dincremental = Dcache

The engine also verifies:

Dpure − Dcache = 0.045 × N

Violation of these identities causes an invariant error rather than a financial result.

Economic Regimes
Regime I — Deficit

LC3 > LC1

Governed State Reuse loses even to Pure Recomputation.

Regime II — Intermediate Advantage

LC3 ≤ LC1

and

LC3 > N × Cb

Governed State Reuse beats Pure Recomputation but does not beat the Best Available Baseline.

Regime III — Best-Baseline Advantage

LC3 ≤ N × Cb

Governed State Reuse beats the least-cost competing baseline and produces a non-negative Incremental Compression Dividend.

Feasibility Metrics

The engine independently evaluates:

Minimum Viable Hit Rate

hmin,best

The minimum hit rate required for the current Economic Substitution Fraction and lifecycle conditions to beat the Best Available Baseline.

Minimum Viable Economic Substitution Fraction

smin,best

The minimum substitution fraction required at the current hit rate.

Break-Even Volume

Nbe,best

The lifecycle query volume required for positive marginal savings to recover Isetup.

These metrics are evaluated independently so failure in one dimension does not automatically invalidate another.

Canonical Regression Fixtures
P1 — Deficit

h = 0.25

s = 0.30

Isetup = $600

N = 10,000

Incremental Compression Dividend:

−$981.25

Regime:

Regime I — Deficit

P2 — Intermediate Advantage

h = 0.60

s = 0.65

Isetup = $300

N = 20,000

Incremental Compression Dividend:

−$219.00

Regime:

Regime II — Intermediate Advantage

P3 — Best-Baseline Advantage

h = 0.90

s = 0.85

Isetup = $200

N = 35,000

Incremental Compression Dividend:

+$1,703.125

Regime:

Regime III — Best-Baseline Advantage

Verification

The v1.0 computational core was executed locally using:

Node v22.22.3

npm 10.9.8

TypeScript 7.0.2

Vitest 4.1.11

Actual executed result:

Test Files: 1 passed

Tests: 18 passed

Tests failed: 0

The deterministic property-grid test evaluated:

11,550 engine configurations

The suite includes:

Canonical regression fixtures
Hit-rate boundaries
Economic-substitution boundaries
Zero setup investment
Single-query lifecycle
Exact zero-marginal-savings behavior
Decoupled feasibility conditions
NaN rejection
Infinity rejection
Out-of-range rejection
Runtime algebraic invariants
Best-baseline identity verification
Integrity Records

The repository includes:

engine.ts

The frozen TypeScript calculation engine.

engine.test.ts

The executed Vitest verification suite.

VERIFICATION-v1.0.txt

Human-readable verification record.

SHA256SUMS-v1.0.txt

SHA-256 fingerprints of the core verified files.

MASTER-SHA256-v1.0.txt

Master integrity record containing the engine, test suite, dependency files, and verification record.

package.json

Project definition and repeatable test command.

package-lock.json

Exact dependency-resolution record.

Reproducing the Tests

Install dependencies:

npm install

Run the complete verification suite:

npm test

A valid frozen-core execution should return:

18 tests passed

0 tests failed

Verifying File Integrity

The v1.0 integrity snapshot can be checked using the master SHA-256 record.

The verified v1.0 snapshot corresponds to Git commit:

a8975fc32303ab6cfd8c4b88cf191dd627b0b87f

and annotated Git tag:

v1.0.0

Important Scope Limitation

Continuous background storage, refresh, synchronization, monitoring, and maintenance costs are excluded from Benchmark v1.0 and documented as a limitation.

They must not be silently reclassified as upfront setup investment.

Interpretation Boundary

Compression Dividend Benchmark v1.0 demonstrates the internal mathematical and computational consistency of a frozen synthetic economic model.

It does not establish that Governed State Reuse necessarily produces a positive Compression Dividend in a real production workload.

A positive empirical result must be measured.

The benchmark is designed to permit all three outcomes:

Pure Recomputation wins
Provider Prompt Caching wins
Governed State Reuse wins

The model is not optimized to force Governed State Reuse to appear advantageous.

v1.1 — Empirical Calibration

The next benchmark phase will replace synthetic cost assumptions with measured workload observations.

Primary calibration targets include:

Actual fresh-recomputation cost
Actual provider prompt-cache cost
Retrieval cost
Verification cost
Provenance and policy-validation cost
Per-hit governed-state service cost
Miss and fallback overhead
Observed governed-state hit rate
Measured Economic Substitution Fraction
Real lifecycle query volume

The central empirical question is:

Does Governed State Reuse produce a positive Incremental Compression Dividend when measured against the least-cost realistic alternative?

Versioning

v1.0.0

Frozen computational benchmark core.

Future empirical calibration or model extensions must not rewrite the v1.0.0 tag.

New work should proceed through subsequent commits and versioned releases.

Repository

RobbieRazor / compression-dividend-benchmark

GitHub Release:

v1.0.0 — Compression Dividend Benchmark v1.0
