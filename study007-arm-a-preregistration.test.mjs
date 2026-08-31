import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const manifest = json('./data/CD-WORKLOAD-20260831-007-arm-a-preregistration-manifest.json');
const metadata = json('./data/CD-WORKLOAD-20260831-007-arm-a-task-metadata.json');
const provider = json('./data/CD-WORKLOAD-20260831-007-arm-a-provider.json');
const audit = json('./data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json');

test('Arm A preregistration pins every artifact exactly', () => {
  for (const artifact of manifest.artifacts) assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
  assert.equal(manifest.arm_state.arm_a_preregistered, true);
  assert.equal(manifest.arm_state.arm_a_runner_frozen, false);
  assert.equal(manifest.arm_state.arm_a_measurement_started, false);
});

test('only source-grounding rules change the Study 006 model boundary', () => {
  assert.equal(manifest.experimental_isolation.historical_authority_bytes_preserved, true);
  assert.equal(manifest.experimental_isolation.neutral_schema_bytes_preserved, true);
  assert.equal(manifest.experimental_isolation.canonical_preservation_rule_bytes_preserved, true);
  assert.equal(manifest.experimental_isolation.hidden_target_bytes_preserved, true);
  assert.equal(manifest.experimental_isolation.only_new_model_visible_component, 'Study 007 value-free source-grounding rules');
  assert.equal(metadata.model_visible_inputs.length, 6);
});

test('model-visible input composition is exactly reproducible', () => {
  const trimmed = (path) => read(path).trim(); const d = provider.request_input_delimiters;
  const input = trimmed('./prompts/CD-WORKLOAD-20260831-007-arm-a-neutral-task.txt') +
    '\n\n' + d.neutral_schema_begin + '\n\n' + trimmed('./data/CD-WORKLOAD-20260830-005-neutral-schema.json') + '\n\n' + d.neutral_schema_end +
    '\n\n' + d.preservation_rules_begin + '\n\n' + trimmed('./data/CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules.json') + '\n\n' + d.preservation_rules_end +
    '\n\n' + d.source_grounding_rules_begin + '\n\n' + trimmed('./data/CD-WORKLOAD-20260831-007-neutral-source-grounding-rules.json') + '\n\n' + d.source_grounding_rules_end +
    '\n\n' + d.public_authority_begin + '\n\n' + trimmed('./data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json') + '\n\n' + d.public_authority_end +
    '\n\n' + d.inherited_authority_begin + '\n\n' + trimmed('./data/CD-WORKLOAD-20260829-002-public-authority-sources.json') + '\n\n' + d.inherited_authority_end;
  assert.equal(Buffer.byteLength(input), metadata.model_visible_input_composition.byte_count);
  assert.equal(createHash('sha256').update(input).digest('hex'), metadata.model_visible_input_composition.sha256);
  for (const artifact of metadata.model_visible_inputs) assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
});

test('neutral task exposes no protected target values or failure locations', () => {
  const task = read('./prompts/CD-WORKLOAD-20260831-007-arm-a-neutral-task.txt');
  assert.match(task, /Source-grounding requirements/);
  assert.match(task, /explicitly assigns it the required field role/);
  assert.doesNotMatch(task, /robbie-george#robbie-george-biography-plate/);
  assert.doesNotMatch(task, /first-party-public-authority/);
  assert.doesNotMatch(task, /public-machine-discovery-catalog/);
  assert.doesNotMatch(task, /SoftwareApplication/);
});

test('Arm B remains censored and cannot be measured', () => {
  assert.equal(audit.adjudication.arm_b_state, 'AVAILABILITY_CENSORED_BEFORE_MEASUREMENT');
  assert.equal(manifest.arm_state.arm_b_state, audit.adjudication.arm_b_state);
  assert.equal(manifest.arm_state.arm_b_measurement_allowed, false);
});

test('deterministic evaluator preflight passes without observation or external action', () => {
  const result = spawnSync('python3', ['scripts/evaluate-study007-arm-a.py', '--preflight'], { cwd: new URL('.', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TARGET_FIELDS_REQUIRED: 52/);
  assert.match(result.stdout, /OBSERVATION_READ: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
});

test('one-shot retry caching payment and economics remain blocked', () => {
  assert.equal(manifest.arm_state.arm_a_planned_observation_count, 1);
  assert.equal(manifest.arm_state.arm_a_automatic_retry_allowed, false);
  assert.equal(manifest.quality_boundary.one_pass_establishes_stable_cost, false);
  assert.equal(manifest.downstream_gate.p2_probe_allowed, false);
  assert.equal(manifest.downstream_gate.p3_payment_allowed, false);
  assert.equal(manifest.downstream_gate.economic_comparison_allowed, false);
});
