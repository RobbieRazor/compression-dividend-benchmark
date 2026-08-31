import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const plan = JSON.parse(readFileSync(new URL('./data/CD-WORKLOAD-20260831-007-authority-capture-plan.json', import.meta.url), 'utf8'));

test('Arm A remains exact Study 006 authority reuse', () => {
  assert.equal(plan.arm_a.authority_mode, 'EXACT_STUDY006_REUSE');
  assert.equal(plan.arm_a.authority_freeze_sha256, '4c4140f4a53271d588c3e87dd3bf78c85445736b73e830e793f092ab38f4b10b');
  assert.equal(plan.arm_a.live_refresh_allowed, false);
});

test('Arm B capture uses unique public HTTPS sources without paid routes', () => {
  assert.equal(plan.arm_b.sources.length, 11);
  assert.equal(new Set(plan.arm_b.sources.map((source) => source.source_id)).size, 11);
  for (const source of plan.arm_b.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.robbiegeorgephotography.com');
    assert.equal(url.pathname.startsWith('/x402/'), false);
  }
});

test('capture policy is exact, fail-closed, and nonpaying', () => {
  assert.deepEqual(plan.capture_policy.accepted_http_statuses, [200]);
  assert.equal(plan.capture_policy.authorization_header_allowed, false);
  assert.equal(plan.capture_policy.cookie_header_allowed, false);
  assert.equal(plan.capture_policy.payment_header_allowed, false);
  assert.equal(plan.capture_policy.paid_route_allowed, false);
  assert.equal(plan.capture_policy.partial_capture_accepted, false);
  assert.equal(plan.capture_policy.overwrite_existing_capture_allowed, false);
  assert.equal(plan.capture_policy.response_sha256_required, true);
});

test('preflight is deterministic and performs no network activity', () => {
  const output = execFileSync(process.execPath, ['scripts/capture-study007-arm-b-authority.mjs', '--preflight'], {
    cwd: new URL('.', import.meta.url),
    encoding: 'utf8'
  });
  assert.match(output, /SOURCE_COUNT: 11/);
  assert.match(output, /NETWORK_CALL_PERFORMED: false/);
  assert.match(output, /X402_PAYMENT_PERFORMED: false/);
  assert.match(output, /PREFLIGHT_PASS: true/);
});

test('target, evaluator, prior diagnostics, and protected payload remain hidden', () => {
  assert.equal(plan.visibility_boundary.raw_capture_model_visible_now, false);
  assert.equal(plan.visibility_boundary.future_arm_b_visibility_requires_separate_freeze, true);
  assert.equal(plan.visibility_boundary.target_visible, false);
  assert.equal(plan.visibility_boundary.quality_contract_visible, false);
  assert.equal(plan.visibility_boundary.prior_failure_diagnostics_visible, false);
  assert.equal(plan.visibility_boundary.protected_p3_payload_visible, false);
});

test('freezing the capture procedure performs no external or economic action', () => {
  assert.deepEqual(plan.actions_performed_by_plan_freeze, {
    network_capture: false,
    model_api_call: false,
    automatic_retry: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false
  });
});
