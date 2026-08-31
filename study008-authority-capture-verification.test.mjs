import assert from 'node:assert/strict';

import { createHash } from 'node:crypto';

import { existsSync, readFileSync, readdirSync } from 'node:fs';

import test from 'node:test';

const readJson = (path) => JSON.parse(
  readFileSync(new URL(path, import.meta.url), 'utf8')
);

const sha256Bytes = (bytes) => createHash('sha256')
  .update(bytes)
  .digest('hex');

const sha256 = (path) => sha256Bytes(
  readFileSync(new URL(path, import.meta.url))
);

const captureDirectory = new URL(
  './data/raw/CD-008-authority-capture/',
  import.meta.url
);

const manifestPath = './data/raw/CD-008-authority-capture/capture-manifest.json';

const freezePath = './data/CD-WORKLOAD-20260831-008-authority-capture-freeze.json';

const manifest = readJson(manifestPath);

const freeze = readJson(freezePath);

const plan = readJson(
  './data/CD-WORKLOAD-20260831-008-authority-capture-plan.json'
);

const planSources = new Map(
  plan.sources.map((source) => [source.source_id, source])
);

function normalizeContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

test('capture manifest and freeze record are pinned exactly', () => {
  assert.equal(
    sha256(manifestPath),
    'eec1518546b93923014f28b089da1a9e60490721813bd5954455ca8771cad650'
  );
  assert.equal(
    sha256(freezePath),
    '205bc9d3c3b81710976638538726c923af5087691b5e5222b0e267f354eda403'
  );
  assert.equal(
    freeze.capture_manifest.sha256,
    sha256('./' + freeze.capture_manifest.path)
  );
  assert.equal(
    manifest.capture_plan.sha256,
    sha256('./' + manifest.capture_plan.path)
  );
  assert.equal(
    manifest.capture_runner.sha256,
    sha256('./' + manifest.capture_runner.path)
  );
  assert.equal(
    manifest.protocol_git_head,
    'cf46ac84839856a5a0db883acae5c5a4a92d3d19'
  );
});

test('capture contains exactly the 14 planned responses and one manifest', () => {
  assert.equal(existsSync(captureDirectory), true);
  assert.equal(manifest.source_count, 14);
  assert.equal(manifest.records.length, 14);
  assert.equal(planSources.size, 14);
  assert.equal(
    new Set(manifest.records.map((record) => record.source_id)).size,
    14
  );
  assert.equal(
    new Set(manifest.records.map((record) => record.filename)).size,
    14
  );

  const expectedFiles = [
    ...manifest.records.map((record) => record.filename),
    'capture-manifest.json'
  ].sort();

  assert.deepEqual(readdirSync(captureDirectory).sort(), expectedFiles);
});

test('every captured file preserves its exact declared bytes and hash', () => {
  let totalByteCount = 0;

  for (const record of manifest.records) {
    const bytes = readFileSync(new URL(record.filename, captureDirectory));
    assert.equal(bytes.length, record.byte_count, record.source_id);
    assert.equal(sha256Bytes(bytes), record.sha256, record.source_id);
    totalByteCount += bytes.length;
  }

  assert.equal(totalByteCount, manifest.total_byte_count);
  assert.equal(totalByteCount, 3129699);
  assert.equal(freeze.capture_result.total_byte_count, totalByteCount);
  assert.equal(freeze.capture_result.all_local_response_hashes_verified, true);
});

test('URLs statuses content types and redirect boundaries match the frozen plan', () => {
  for (const record of manifest.records) {
    const source = planSources.get(record.source_id);
    assert.ok(source);
    assert.equal(record.requested_url, source.url);
    assert.equal(record.final_url, source.url);
    assert.deepEqual(record.redirect_chain, []);
    assert.equal(record.http_status, 200);

    const observed = normalizeContentType(record.observed_content_type);
    const accepted = source.accepted_content_type_prefixes.map(
      normalizeContentType
    );

    assert.equal(accepted.includes(observed), true);
    assert.equal(
      normalizeContentType(record.response_headers['content-type']),
      observed
    );

    const url = new URL(record.final_url);
    assert.equal(url.protocol, 'https:');
    assert.equal(
      url.hostname,
      plan.source_selection_boundary.single_approved_host
    );
    assert.equal(url.pathname.startsWith('/x402/'), false);
  }

  assert.equal(manifest.all_http_status_200, true);
  assert.equal(manifest.all_content_types_expected, true);
  assert.equal(freeze.capture_result.redirect_count, 0);
  assert.equal(
    freeze.capture_result.all_requested_urls_equal_final_urls,
    true
  );
});

test('all JSON and HTML response bodies satisfy their frozen syntax class', () => {
  let jsonCount = 0;
  let htmlCount = 0;

  for (const record of manifest.records) {
    const source = planSources.get(record.source_id);
    const bytes = readFileSync(new URL(record.filename, captureDirectory));
    const text = bytes.toString('utf8');

    if (source.file_extension === 'json') {
      assert.doesNotThrow(() => JSON.parse(text), record.source_id);
      jsonCount += 1;
    } else {
      const lower = text.toLowerCase();
      assert.equal(
        lower.includes('<html') || lower.includes('<!doctype html'),
        true,
        record.source_id
      );
      htmlCount += 1;
    }
  }

  assert.equal(jsonCount, 8);
  assert.equal(htmlCount, 6);
  assert.equal(freeze.capture_result.json_response_count, jsonCount);
  assert.equal(freeze.capture_result.html_response_count, htmlCount);
});

test('byte-equivalent MRD routes are one content group not duplicate evidence', () => {
  const groups = new Map();

  for (const record of manifest.records) {
    const ids = groups.get(record.sha256) || [];
    ids.push(record.source_id);
    groups.set(record.sha256, ids);
  }

  const duplicateGroups = [...groups.entries()]
    .filter((entry) => entry[1].length > 1)
    .map((entry) => ({
      sha256: entry[0],
      source_ids: entry[1].sort()
    }));

  assert.equal(groups.size, 13);
  assert.deepEqual(duplicateGroups, [
    {
      sha256: '79bf98dbd31b8e9beffa1b8fab0289fcbfaa7c9999c0154d3da23ef13ccb98b5',
      source_ids: ['CD008-AUTH-S005', 'CD008-AUTH-S013']
    }
  ]);
  assert.equal(freeze.capture_result.unique_response_sha256_count, 13);
  assert.deepEqual(
    freeze.content_equivalence_groups[0].source_ids,
    ['CD008-AUTH-S005', 'CD008-AUTH-S013']
  );
});

test('captured bytes contain no recognized credential or private-key pattern', () => {
  const patterns = [
    /sk-[A-Za-z0-9_-]{20,}/i,
    /OPENAI_API_KEY\s*=\s*\S+/i,
    /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{20,}/i,
    /PRIVATE KEY/i
  ];

  for (const record of manifest.records) {
    const text = readFileSync(
      new URL(record.filename, captureDirectory),
      'utf8'
    );

    for (const pattern of patterns) {
      assert.equal(pattern.test(text), false, record.source_id);
    }
  }

  assert.equal(freeze.capture_result.secret_scan_completed, true);
  assert.equal(freeze.capture_result.secret_scan_pass, true);
});

test('capture remains nonpaying credential-free and model-free', () => {
  assert.equal(manifest.partial_capture_accepted, false);
  assert.equal(manifest.authorization_header_sent, false);
  assert.equal(manifest.cookie_header_sent, false);
  assert.equal(manifest.payment_header_sent, false);
  assert.equal(manifest.environment_credential_read, false);
  assert.equal(manifest.automatic_retry_performed, false);
  assert.equal(manifest.x402_payment_performed, false);
  assert.equal(manifest.model_api_call_performed, false);

  assert.equal(freeze.actions_performed.capture_attempt_count, 1);
  assert.equal(freeze.actions_performed.automatic_retry, false);
  assert.equal(freeze.actions_performed.model_api_call, false);
  assert.equal(freeze.actions_performed.x402_payment, false);
  assert.equal(freeze.actions_performed.production_mutation, false);
  assert.equal(freeze.actions_performed.website_mutation, false);
  assert.equal(freeze.actions_performed.pricing_mutation, false);
});

test('capture freeze blocks target construction and measurement', () => {
  assert.equal(freeze.review_boundary.capture_is_target, false);
  assert.equal(freeze.review_boundary.capture_is_quality_contract, false);
  assert.equal(freeze.review_boundary.capture_is_evaluator, false);
  assert.equal(
    freeze.review_boundary.capture_is_model_visible_automatically,
    false
  );
  assert.equal(
    freeze.review_boundary.historical_target_comparison_performed,
    false
  );
  assert.equal(
    freeze.review_boundary.authority_completeness_claimed,
    false
  );
  assert.equal(
    freeze.review_boundary.target_construction_authorized_now,
    false
  );
  assert.equal(
    freeze.review_boundary.model_measurement_authorized_now,
    false
  );
  assert.equal(
    freeze.review_boundary.economic_comparison_authorized_now,
    false
  );
  assert.equal(freeze.immutability_boundary.recapture_within_study_allowed, false);
  assert.equal(freeze.immutability_boundary.response_repair_allowed, false);
  assert.equal(freeze.immutability_boundary.manifest_mutation_allowed, false);
});
