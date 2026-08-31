import assert from 'node:assert/strict';

import { execFileSync } from 'node:child_process';

import { createHash } from 'node:crypto';

import { existsSync, readFileSync } from 'node:fs';

import test from 'node:test';

const readJson = (path) => JSON.parse(
  readFileSync(new URL(path, import.meta.url), 'utf8')
);

const readText = (path) => readFileSync(
  new URL(path, import.meta.url),
  'utf8'
);

const sha256 = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, import.meta.url)))
  .digest('hex');

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

const plan = readJson(
  './data/CD-WORKLOAD-20260831-008-authority-capture-plan.json'
);

const designManifest = readJson(
  './data/CD-WORKLOAD-20260831-008-design-manifest.json'
);

const previousAvailability = readJson(
  './data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json'
);

const runnerPath = './scripts/capture-study008-authority.mjs';

const runnerSource = readText(runnerPath);

test('capture protocol pins the published Study 008 design freeze', () => {
  assert.equal(plan.study_id, 'CD-WORKLOAD-20260831-008');
  assert.equal(plan.capture_plan_id, 'CD008-PUBLIC-AUTHORITY-CAPTURE-1.0');
  assert.equal(plan.status, 'CAPTURE_PROTOCOL_FROZEN_BEFORE_NETWORK_ACTIVITY');
  assert.equal(
    plan.design_freeze.sha256,
    sha256('./' + plan.design_freeze.path)
  );
  assert.equal(
    plan.design_freeze.commit,
    '7f4ac20de340bc35b930bbd7a70e94610325cec2'
  );
  assert.equal(
    designManifest.next_artifact.type,
    'PUBLIC_NONPAYING_AUTHORITY_CAPTURE_PROTOCOL_FREEZE'
  );
  assert.equal(
    designManifest.next_artifact.network_capture_allowed_by_current_freeze,
    false
  );
});

test('plan and runner bytes are pinned exactly', () => {
  assert.equal(
    sha256('./data/CD-WORKLOAD-20260831-008-authority-capture-plan.json'),
    'dd19b94da30329ba5d3fc89f2e66e7eaee06b48566651e1db95990d880c89130'
  );
  assert.equal(
    sha256(runnerPath),
    '0782489fc513f21b8a957de38a3220815336f99862efc61adb023cdb6b8f526c'
  );
});

test('source inventory is unique public HTTPS first-party authority', () => {
  assert.equal(plan.sources.length, 14);
  assert.equal(plan.source_selection_boundary.source_count, 14);
  assert.equal(
    new Set(plan.sources.map((source) => source.source_id)).size,
    14
  );
  assert.equal(
    new Set(plan.sources.map((source) => source.url)).size,
    14
  );

  for (const source of plan.sources) {
    const url = new URL(source.url);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'www.robbiegeorgephotography.com');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.hash, '');
    assert.equal(url.pathname.startsWith('/x402/'), false);
    assert.ok(source.accepted_content_type_prefixes.length > 0);
    assert.ok(['html', 'json'].includes(source.file_extension));
  }

  const ids = new Set(plan.sources.map((source) => source.source_id));
  assert.equal(ids.has('CD008-AUTH-S012'), true);
  assert.equal(ids.has('CD008-AUTH-S013'), true);
  assert.equal(ids.has('CD008-AUTH-S014'), true);
  assert.equal(
    plan.source_selection_boundary.selected_to_reproduce_historical_hidden_target,
    false
  );
  assert.equal(
    plan.source_selection_boundary.historical_target_used_for_source_selection,
    false
  );
  assert.equal(
    plan.source_selection_boundary.paid_canonical_plate_route_included,
    false
  );
});

test('capture request boundary excludes credentials payment and retry', () => {
  const request = plan.request_policy;
  assert.equal(request.method, 'GET');
  assert.deepEqual(
    [...request.request_header_allowlist].sort(),
    ['accept', 'user-agent']
  );
  assert.equal(request.authorization_header_allowed, false);
  assert.equal(request.cookie_header_allowed, false);
  assert.equal(request.payment_header_allowed, false);
  assert.equal(request.proxy_authorization_header_allowed, false);
  assert.equal(request.api_key_header_allowed, false);
  assert.equal(request.environment_credential_read_allowed, false);
  assert.equal(request.paid_route_allowed, false);
  assert.equal(request.automatic_retry_allowed, false);
  assert.equal(request.redirects_must_remain_https, true);
  assert.equal(request.redirects_must_remain_on_approved_host, true);
  assert.equal(request.redirect_to_paid_route_allowed, false);
  assert.equal(runnerSource.includes('process.env'), false);
});

test('response validation is strict bounded and fail-closed', () => {
  const response = plan.response_policy;
  assert.deepEqual(response.accepted_http_statuses, [200]);
  assert.equal(response.json_parse_required_for_json_media, true);
  assert.equal(response.html_document_marker_required_for_html_media, true);
  assert.equal(response.response_body_stored_exactly, true);
  assert.equal(response.response_sha256_required, true);
  assert.equal(response.partial_capture_accepted, false);
  assert.equal(response.unexpected_content_type_accepted, false);
  assert.equal(response.non_200_response_accepted, false);
  assert.ok(response.minimum_response_bytes > 0);
  assert.ok(response.maximum_response_bytes_per_source > 0);
  assert.ok(response.maximum_total_response_bytes > 0);
});

test('runner uses temporary validation and atomic no-overwrite publication', () => {
  assert.equal(plan.output.overwrite_existing_final_directory_allowed, false);
  assert.equal(plan.output.partial_final_directory_allowed, false);
  assert.equal(plan.output.atomic_publish_required, true);
  assert.match(runnerSource, /mkdtempSync\(temporaryDirectoryPrefix\)/);
  assert.match(
    runnerSource,
    /writeFileSync\(\s*path\.join\(temporaryDirectory/
  );
  assert.match(
    runnerSource,
    /renameSync\(temporaryDirectory, finalDirectory\)/
  );
  assert.match(
    runnerSource,
    /rmSync\(temporaryDirectory, \{ recursive: true, force: true \}\)/
  );
});

test('offline preflight is deterministic read-only and nonpaying', () => {
  const finalDirectory = new URL(
    './data/raw/CD-008-authority-capture',
    import.meta.url
  );

  const existedBefore = existsSync(finalDirectory);

  const output = execFileSync(
    process.execPath,
    ['scripts/capture-study008-authority.mjs', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  const existsAfter = existsSync(finalDirectory);

  assert.equal(existsAfter, existedBefore);
  assert.match(output, /SOURCE_COUNT: 14/);
  assert.match(output, /CAPTURE_PLAN_SHA256: dd19b94d/);
  assert.match(output, /PUBLIC_HTTPS_ONLY: true/);
  assert.match(output, /CAPTURE_AUTHORIZED_NOW: false/);
  assert.match(output, /NETWORK_CALL_PERFORMED: false/);
  assert.match(output, /FILESYSTEM_WRITE_PERFORMED: false/);
  assert.match(output, /MODEL_API_CALL_PERFORMED: false/);
  assert.match(output, /X402_PAYMENT_PERFORMED: false/);
  assert.match(output, /PREFLIGHT_PASS: true/);
});

test('historical missing values are not disclosed into source selection', () => {
  const exposed = new Set(collectStrings(plan));

  for (const fact of previousAvailability.unavailable_exact_facts) {
    assert.equal(
      exposed.has(fact.required_value),
      false,
      'historical protected value disclosed: ' + fact.required_value
    );
  }
});

test('protocol freeze performs no capture target model payment or mutation', () => {
  assert.deepEqual(plan.actions_performed_by_protocol_freeze, {
    network_capture: false,
    target_construction: false,
    authority_completeness_audit: false,
    model_api_call: false,
    automatic_retry: false,
    p2_probe: false,
    p3_retrieval: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false,
    website_mutation: false,
    pricing_mutation: false
  });

  assert.equal(plan.post_capture_boundary.capture_is_target, false);
  assert.equal(
    plan.post_capture_boundary.capture_is_model_visible_automatically,
    false
  );
  assert.equal(
    plan.post_capture_boundary.capture_commit_required_before_completeness_audit,
    true
  );
  assert.equal(
    plan.post_capture_boundary.historical_target_comparison_allowed,
    false
  );
  assert.equal(
    plan.post_capture_boundary.target_construction_allowed_before_completeness_pass,
    false
  );
  assert.equal(
    plan.post_capture_boundary.model_measurement_allowed_before_completeness_pass,
    false
  );
});
