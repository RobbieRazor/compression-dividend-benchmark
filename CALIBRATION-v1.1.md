Compression Dividend Benchmark v1.1 — Empirical Calibration Specification

Status: DRAFT MEASUREMENT PROTOCOL

Branch: v1.1-empirical-calibration

Purpose: Replace the synthetic economic constants used in Benchmark v1.0 with measured values obtained from real workloads while preserving the frozen v1.0 mathematical core as the comparison reference.

1. Objective

Compression Dividend Benchmark v1.1 tests whether Governed State Reuse produces a measurable Incremental Compression Dividend under observed production conditions.

The v1.0 mathematical framework remains unchanged.

v1.1 changes the source of the benchmark inputs.

Instead of assuming economic parameters, v1.1 measures them.

The central empirical question is:

Does retrieving, validating, and using an existing governed computational state cost less than the least-cost realistic alternative for performing the same task?

The benchmark must permit all possible outcomes:

Pure Recomputation may win.

Provider Prompt Caching may win.

Governed State Reuse may win.

No calibration procedure may be designed to force a positive Compression Dividend.

2. Frozen Mathematical Reference

The v1.0 governed-state marginal-cost equation remains the reference model:

C3 = Cr + Cv + h × [Cp + Cm + (1 − s) × Cre] + (1 − h) × [Cmiss_overhead + Cre]

Lifecycle costs remain:

LC1 = N × Cre

LC2 = N × C2

LC3 = Isetup + N × C3

Best Available Baseline remains:

Cb = minimum of Cre and C2

Incremental Compression Dividend remains:

Dincremental = N × Cb − LC3

No v1.1 calibration process may silently alter these equations.

If empirical evidence later demonstrates that the model itself requires modification, that change must occur in a separately versioned benchmark release rather than by rewriting v1.0 or silently altering v1.1 measurements.

3. Calibration Principle

Every calibrated parameter must have:

A defined measurement boundary.

A reproducible measurement method.

A recorded source.

A measurement timestamp.

A workload identifier.

A unit.

A sample count.

A statistical summary.

An uncertainty or variability estimate where practical.

No measured value should be entered into the benchmark without enough provenance to determine where it came from.

4. Measurement Unit

The primary economic unit is:

US dollars per equivalent task execution.

A task execution must represent the same logical workload across the three benchmark paths.

The benchmark must not compare unequal outcomes.

For example, a fresh model response containing complete reasoning and validation cannot be compared economically with a cached artifact that omits required information.

All compared paths must satisfy the same declared task-completion criteria.

5. Workload Identity

Every calibration experiment must define a Workload ID.

Recommended format:

CD-WORKLOAD-YYYYMMDD-NNN

Each Workload ID should identify one reproducible class of task.

Examples could include:

Structured canonical record retrieval.

Repeated factual lookup.

Validated Naturepedia plate retrieval.

Taxonomy resolution.

State-token retrieval.

Structured machine-readable answer retrieval.

Repeated long-context analysis.

Agent retrieval requiring provenance validation.

The initial calibration should use a narrow, highly repeatable workload rather than combining unrelated tasks.

6. Parameter Cre — Fresh Recomputation Cost

Definition:

Cre is the observed economic cost of completing one workload from fresh logical execution when no previously computed task-specific state substitutes for any portion of the required reconstruction.

Measurement should include all directly attributable fresh-execution costs required to produce the defined equivalent result.

Where API usage is token-priced, record:

Input tokens.

Output tokens.

Input-token cost.

Output-token cost.

Any model-specific execution charge.

Any directly attributable reasoning or compute charge.

If multiple models are evaluated, Cre must be measured separately for each model and model version.

Recommended calculation:

Cre_observed = Total Fresh Recomputation Cost / Number of Successful Fresh Executions

Required recorded metadata:

Provider.

Model.

Model version if available.

Date measured.

Number of runs.

Mean cost.

Median cost.

Minimum cost.

Maximum cost.

Standard deviation where practical.

Mean input tokens.

Mean output tokens.

The benchmark should not assume that Cre remains constant across providers or over time.

7. Parameter C2 — Provider Prompt Cache Cost

Definition:

C2 is the observed expected cost per completed workload when using the provider's native prompt/context caching mechanism.

Provider Prompt Caching must remain separate from Governed State Reuse.

A provider cache hit still involves the model execution pathway unless the provider explicitly documents otherwise.

Measurement should capture both cache-hit and cache-miss executions.

For each test run record:

Cache hit or miss.

Cached input tokens.

Uncached input tokens.

Output tokens.

Total billed cost.

Provider.

Model.

Cache policy if known.

Observed provider-cache hit rate.

Expected C2 should be calculated from the actual distribution of hits and misses.

Recommended calculation:

C2_observed = Total Prompt-Cache Path Cost / Number of Completed Prompt-Cache Tasks

Do not insert a governed-state provenance or validation cost into C2 unless the prompt-cache path genuinely performs that operation.

The best baseline must receive the strongest fair treatment.

8. Parameter Cr — Governed-State Retrieval Cost

Definition:

Cr is the directly attributable cost of locating and retrieving candidate governed state.

Possible components include:

Database lookup.

Object storage retrieval.

Vector or index query.

Edge request.

Registry resolution.

Network transfer directly attributable to retrieval.

Machine-readable endpoint retrieval.

Measure retrieval independently from verification wherever possible.

Recommended calculation:

Cr_observed = Total Retrieval Cost / Number of Governed-State Retrieval Attempts

Latency may also be recorded, but latency and dollar cost must remain separate benchmark dimensions.

9. Parameter Cv — Verification Cost

Definition:

Cv is the directly attributable cost required to determine whether the retrieved candidate state is valid for the requested workload.

Verification may include:

Freshness validation.

Schema validation.

Canonical identity checking.

Integrity validation.

Compatibility checking.

State-version checking.

Task-sufficiency validation.

Only operations actually performed should be counted.

Recommended calculation:

Cv_observed = Total Verification Cost / Number of Governed-State Retrieval Attempts

Verification that occurs for every attempt belongs outside the hit-only branch, consistent with the frozen v1.0 equation.

10. Parameter Cp — Provenance and Policy Validation Cost

Definition:

Cp is the variable cost incurred on an accepted governed-state hit to validate provenance, rights, attribution, policy, authority, or governance conditions required before the state may be used.

Examples may include:

Canonical source verification.

Rights validation.

Provenance-chain inspection.

Policy eligibility.

License state.

Authority record checks.

Governance metadata resolution.

Cp must represent actual operations.

It must not be assigned a synthetic value merely because a governance layer conceptually exists.

Recommended calculation:

Cp_observed = Total Provenance and Policy Validation Cost on Accepted Hits / Number of Accepted Governed-State Hits

11. Parameter Cm — Per-Hit State Service Cost

Definition:

Cm remains frozen to the v1.0 Interpretation A boundary.

Cm is a variable per-successful-hit state-service allocation incurred when a governed state is successfully served.

It may include a directly attributable per-hit delivery or servicing cost that is distinct from Cr, Cv, and Cp.

Continuous background storage, refresh, synchronization, monitoring, and maintenance costs are not Cm.

They remain outside the v1.0/v1.1 frozen core unless a later benchmark version formally introduces a lifecycle maintenance term.

Continuous costs must not be silently reclassified as Isetup.

Recommended calculation:

Cm_observed = Total Eligible Per-Hit State Service Cost / Number of Accepted Governed-State Hits

If no independently measurable per-hit service cost exists:

Cm_observed = 0

with the reason documented.

12. Parameter Cmiss_overhead — Failed-Reuse Overhead

Definition:

Cmiss_overhead is the additional cost caused specifically by an unsuccessful governed-state reuse attempt before fresh recomputation is performed.

It does not include Cre.

Cre remains a separate term in the miss branch.

Possible miss overhead may include:

Failed retrieval handling.

Routing.

Fallback decision logic.

State rejection processing.

Additional network request.

Miss logging directly attributable to execution.

Recommended calculation:

Cmiss_overhead_observed = Total Additional Miss Handling Cost / Number of Governed-State Misses

The benchmark must avoid double-counting retrieval and verification costs already represented by Cr and Cv.

13. Parameter h — Observed Governed-State Hit Rate

Definition:

h is the probability that the governed-state system successfully locates, validates, and accepts a reusable state for the requested workload.

A raw retrieval match is not automatically a hit.

An accepted hit must satisfy the workload's declared validity criteria.

Recommended calculation:

h_observed = Accepted Governed-State Hits / Total Governed-State Retrieval Attempts

Record separately:

Total attempts.

Candidate states found.

Candidates rejected.

Accepted hits.

Misses.

This distinction helps identify whether poor h is caused by retrieval failure or verification rejection.

14. Parameter s — Measured Economic Substitution Fraction

This is the most important empirical variable introduced by the benchmark.

Definition:

s = Avoided Fresh Recomputation Cost / Original Fresh Recomputation Cost

s measures economic substitution, not semantic similarity.

The objective is to determine how much fresh-recomputation cost is actually eliminated when a governed state is successfully accepted.

For each accepted governed-state hit, establish a paired fresh-recomputation control.

Let:

Cre_control = measured cost of completing the same task through fresh recomputation.

Cresidual = any remaining fresh-computation cost still required after governed-state retrieval.

Then:

s_observed = 1 − Cresidual / Cre_control

Equivalent form:

s_observed = (Cre_control − Cresidual) / Cre_control

Interpretation:

s = 0 means no fresh-recomputation cost was eliminated.

s = 0.50 means half of equivalent fresh-recomputation cost was eliminated.

s = 1 means fresh recomputation was completely substituted.

A retrieval that provides useful context but still requires nearly the full fresh model execution should produce a low s even if retrieval succeeds.

A retrieved artifact that satisfies nearly the complete task without model reconstruction should produce a high s.

15. Paired-Control Requirement for s

Economic Substitution Fraction should be measured using paired tasks wherever practical.

For each accepted governed-state execution:

Run or estimate the equivalent fresh-recomputation control under the same workload specification.

Measure Cre_control.

Measure the residual model or compute work required after the governed state is accepted.

Measure Cresidual.

Calculate s.

The paired executions should use equivalent:

Task specification.

Required output.

Model/provider where applicable.

Validation requirements.

Quality threshold.

Temporal conditions as closely as practical.

Do not compare a low-quality reuse answer against a higher-quality recomputation answer.

Equivalent task completion is required.

16. Quality Equivalence Gate

No cost advantage should be counted as a Compression Dividend unless the governed-state output satisfies the declared task-quality requirement.

Every workload should define a completion gate before measurement begins.

Possible criteria may include:

Required fields present.

Correct canonical identity.

Schema-valid output.

Equivalent factual content.

Required provenance included.

Required licensing or rights metadata included.

Freshness requirement satisfied.

Required confidence threshold satisfied.

If the governed-state path fails the quality gate, it should be classified as a miss or failed state rather than a successful economic substitution.

17. Parameter Isetup — Empirical Setup Investment

Definition:

Isetup is the documented fixed upfront cost required to establish the governed-state capability being evaluated.

Possible eligible components include:

One-time engineering labor.

Initial indexing.

Initial state generation.

Initial registry construction.

One-time integration.

One-time schema implementation.

One-time deployment work.

The measurement record should specify how labor cost is valued if labor is included.

Do not place recurring storage, refresh, monitoring, synchronization, or routine maintenance inside Isetup.

If existing infrastructure predates the calibration study and its historical setup cost cannot be reliably reconstructed, report that limitation rather than inventing a value.

The benchmark may run sensitivity analysis over plausible Isetup ranges when precise historical cost is unavailable.

18. Parameter N — Observed or Projected Lifecycle Volume

N represents the number of equivalent workload executions across the evaluated lifecycle.

Two N categories should be distinguished:

Observed N.

Projected N.

Observed N is preferred for retrospective measurement.

Projected N may be used for forward economic planning but must be clearly labeled as projected rather than measured.

The benchmark should report Incremental Compression Dividend across multiple lifecycle horizons rather than relying on a single arbitrary N whenever practical.

19. Experiment Record

Each empirical run should generate a machine-readable and human-readable record containing at minimum the following measurement fields:

Workload ID; experiment date; provider; model; model version; workload description; completion criteria; fresh-recomputation runs; prompt-cache runs; governed-state attempts; governed-state hits; governed-state misses; Cre; C2; Cr; Cv; Cp; Cm; Cmiss_overhead; h; per-hit s observations; mean s; median s; Isetup; observed N; projected N if used; LC1; LC2; LC3; Dpure; Dcache; Dincremental; regime; hmin,best; smin,best; Nbe,best; measurement notes; known limitations.

20. Statistical Treatment

Single-run measurements are insufficient for empirical calibration except for debugging.

For costs that vary by execution, collect repeated samples.

At minimum report:

Sample count.

Mean.

Median.

Minimum.

Maximum.

Standard deviation where the sample size allows useful interpretation.

For s, retain the individual paired observations rather than storing only the mean.

The distribution of s may contain important information that an average conceals.

Where workloads differ substantially in complexity, stratify them rather than averaging unlike tasks into one number.

21. Recommended Initial Calibration Study

The first empirical study should intentionally be narrow.

Use one workload family with:

A clearly defined repeatable query.

A deterministic or near-deterministic governed state.

A measurable fresh-recomputation alternative.

A measurable provider-cache alternative if available.

A clear quality-equivalence gate.

Sufficient repetition to produce stable observations.

The purpose of Study 1 is not to demonstrate maximum economic advantage.

The purpose is to prove that the full measurement protocol can be executed reproducibly from raw observations through final Dincremental.

22. Recommended Study Sequence

Study A:

Establish Cre using repeated fresh recomputation.

Study B:

Establish C2 using the strongest practical provider prompt-cache baseline.

Study C:

Measure Cr and Cv for governed-state attempts.

Study D:

Measure Cp and Cm for accepted governed-state hits.

Study E:

Measure Cmiss_overhead from rejected or missing states.

Study F:

Measure h from repeated state-reuse attempts.

Study G:

Measure s using paired fresh-control and governed-state executions.

Study H:

Run the frozen benchmark using only observed values.

Study I:

Repeat the experiment to test reproducibility.

23. Empirical Success Condition

An empirical Compression Dividend exists for the tested workload and lifecycle only when:

Dincremental > 0

using measured or explicitly declared projected inputs.

This means Governed State Reuse costs less than the least-cost measured competing path after accounting for Isetup across the selected lifecycle.

A positive result for Dpure alone is not sufficient if Provider Prompt Caching is cheaper.

24. Empirical Failure Condition

A valid calibration experiment may conclude:

Dincremental < 0

This is not a benchmark failure.

It means the governed-state architecture did not outperform the best available baseline under the measured conditions.

Possible causes may include:

Low hit rate.

Low Economic Substitution Fraction.

High retrieval overhead.

High verification cost.

High governance cost.

Low fresh-inference cost.

Highly efficient provider caching.

Insufficient lifecycle volume.

High setup investment.

The benchmark is specifically designed to expose these conditions.

25. Reproducibility Requirement

Every published empirical result should be traceable from:

Raw observations

to

calibrated parameter values

to

benchmark engine inputs

to

benchmark output.

Where commercial-provider billing data cannot be publicly shared, publish sufficient aggregate measurement methodology to permit independent reproduction with equivalent workloads.

26. Provenance Requirement

Each calibration dataset should identify:

Measurement date.

Software version.

Benchmark commit.

Calibration branch or commit.

Provider/model version where known.

Data source.

Measurement method.

Any manual judgment used.

Any excluded observations and reason for exclusion.

This prevents future pricing or infrastructure changes from being mistaken for the original empirical result.

27. Calibration Data Separation

v1.1 measured values must not replace the frozen constants inside v1.0.

Instead, empirical calibration should be represented as external benchmark inputs or a separately versioned calibration engine.

v1.0 must remain reproducible exactly as released.

Historical benchmark fixtures must continue to pass.

28. Continuous-Cost Limitation

Continuous background storage, refresh, synchronization, monitoring, and maintenance costs remain outside the frozen core.

They must not be silently reclassified as Isetup.

If these costs prove economically material during empirical testing, document them separately.

A future benchmark version may formally introduce a lifecycle-maintenance term after independent review.

29. Calibration Integrity

Future empirical calibration files should receive:

Automated tests.

Git commits.

Version identifiers.

SHA-256 integrity records when frozen.

A human-readable verification record.

A published methodology describing whether values are observed, estimated, or projected.

No empirical dataset should be labeled verified merely because the benchmark engine itself passes its v1.0 tests.

Engine verification and empirical-data verification are separate claims.

30. Initial v1.1 Deliverables

The first v1.1 implementation phase should produce:

Calibration input schema.
Observation-record schema.
Paired-control schema for Economic Substitution Fraction.
Calibration calculator that converts raw observations into benchmark inputs.
Tests for calibration calculations.
At least one narrow empirical workload study.
Human-readable calibration report.
Machine-readable calibration dataset.
Reproducibility instructions.
Clear separation between measured, estimated, and projected inputs.
31. Version Boundary

Compression Dividend Benchmark v1.0.0 remains the frozen computational reference.

v1.1 empirical work must not modify the v1.0.0 tag or rewrite its historical files.

The empirical calibration branch may evolve through new commits until a separate calibration milestone is reproducible and ready for release.

32. Current v1.1 Status

Mathematical core:

Frozen in v1.0.0.

Empirical measurement protocol:

Defined in this document.

Real workload calibration:

Not yet performed.

Positive empirical Compression Dividend:

Not yet claimed.

Next action:

Define the first narrow calibration workload and create the raw observation schema before collecting measurements.
