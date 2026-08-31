import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
const audit = readJson('./data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json');
const capture = readJson('./data/raw/CD-007-arm-b-authority-capture/capture-manifest.json');
const target = readJson('./data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json').target;

function leaves(value, prefix = '', output = []) {
  if (value === null || typeof value !== 'object') output.push({ field: prefix, value });
  else if (Array.isArray(value)) value.forEach((child, index) => leaves(child, `${prefix}[${index}]`, output));
  else Object.entries(value).forEach(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key, output));
  return output;
}

test('audit pins the exact capture, target, design, and plan', () => {
  for (const artifact of Object.values(audit.frozen_inputs)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256);
  }
  assert.equal(capture.source_count, 11);
  assert.equal(capture.all_http_status_200, true);
});

test('all 11 captured response hashes remain valid', () => {
  for (const record of capture.records) {
    assert.equal(
      sha256(`./data/raw/CD-007-arm-b-authority-capture/${record.filename}`),
      record.sha256,
      record.source_id
    );
  }
});

test('availability result is reproduced from exact captured bytes', () => {
  const corpus = capture.records.map((record) =>
    readFileSync(new URL(`./data/raw/CD-007-arm-b-authority-capture/${record.filename}`, import.meta.url), 'utf8')
  ).join('\n');
  const facts = target.relationships.flatMap((relationship) =>
    leaves(relationship.target).map((fact) => ({ relationship: relationship.relationship, ...fact }))
  );
  const unavailable = facts.filter((fact) =>
    !corpus.includes(typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value))
  );
  assert.equal(facts.length, 52);
  assert.equal(facts.length - unavailable.length, 46);
  assert.deepEqual(
    unavailable.map(({ relationship, field, value }) => ({ relationship, field, required_value: value })),
    audit.unavailable_exact_facts
  );
});

test('Arm B is availability-censored without relaxing the common target', () => {
  assert.equal(audit.result.exact_authority_availability_pass, false);
  assert.equal(audit.result.quality_equivalent_arm_b_possible_without_invention, false);
  assert.equal(audit.adjudication.arm_b_state, 'AVAILABILITY_CENSORED_BEFORE_MEASUREMENT');
  assert.equal(audit.adjudication.arm_b_measurement_authorized, false);
  assert.equal(audit.adjudication.common_target_relaxed, false);
  assert.equal(audit.adjudication.production_update_authorized, false);
  assert.equal(audit.adjudication.recapture_authorized, false);
});

test('audit preserves Arm A and blocks all downstream spending', () => {
  assert.equal(audit.adjudication.arm_a_state, 'UNCHANGED_PENDING_SEPARATE_PREREGISTRATION_DECISION');
  assert.equal(audit.adjudication.arm_a_measurement_authorized, false);
  assert.equal(audit.adjudication.p2_probe_authorized, false);
  assert.equal(audit.adjudication.p3_payment_authorized, false);
  assert.equal(audit.adjudication.economic_comparison_authorized, false);
  assert.deepEqual(audit.actions_performed, {
    model_api_call: false,
    automatic_retry: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false,
    target_mutation: false
  });
});
