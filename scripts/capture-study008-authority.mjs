import { createHash } from 'node:crypto';

import { execFileSync } from 'node:child_process';

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';

import { fileURLToPath } from 'node:url';

import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const planPath = path.join(root, 'data/CD-WORKLOAD-20260831-008-authority-capture-plan.json');

const runnerPath = fileURLToPath(import.meta.url);

const planBytes = readFileSync(planPath);

const plan = JSON.parse(planBytes.toString('utf8'));

const mode = process.argv[2] || '--preflight';

const expectedPlanSha256 = 'dd19b94da30329ba5d3fc89f2e66e7eaee06b48566651e1db95990d880c89130';

const finalDirectory = path.join(root, plan.output.final_directory);

const temporaryDirectoryPrefix = path.join(root, plan.output.temporary_directory_prefix);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readGitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
}

function readGitStatus() {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8'
  }).trim();
}

function normalizeContentType(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function validateApprovedUrl(value, label) {
  const url = new URL(value);

  if (url.protocol !== 'https:') {
    throw new Error(label + ' is not HTTPS: ' + value);
  }

  if (url.hostname !== plan.source_selection_boundary.single_approved_host) {
    throw new Error(label + ' uses an unexpected host: ' + value);
  }

  if (url.username || url.password) {
    throw new Error(label + ' contains user information: ' + value);
  }

  if (url.hash) {
    throw new Error(label + ' contains a fragment: ' + value);
  }

  if (url.pathname.startsWith('/x402/')) {
    throw new Error(label + ' enters a prohibited paid route: ' + value);
  }

  return url;
}

function validatePlan() {
  if (sha256(planBytes) !== expectedPlanSha256) {
    throw new Error('Capture plan hash mismatch.');
  }

  if (plan.study_id !== 'CD-WORKLOAD-20260831-008') {
    throw new Error('Unexpected Study ID.');
  }

  if (plan.capture_plan_id !== 'CD008-PUBLIC-AUTHORITY-CAPTURE-1.0') {
    throw new Error('Unexpected capture plan ID.');
  }

  if (plan.status !== 'CAPTURE_PROTOCOL_FROZEN_BEFORE_NETWORK_ACTIVITY') {
    throw new Error('Capture plan is not in the frozen protocol state.');
  }

  if (plan.sources.length !== plan.source_selection_boundary.source_count) {
    throw new Error('Frozen source count mismatch.');
  }

  if (plan.sources.length !== 14) {
    throw new Error('Study 008 requires exactly 14 approved sources.');
  }

  const sourceIds = new Set();
  const sourceUrls = new Set();

  for (const source of plan.sources) {
    if (sourceIds.has(source.source_id)) {
      throw new Error('Duplicate source ID: ' + source.source_id);
    }

    if (sourceUrls.has(source.url)) {
      throw new Error('Duplicate source URL: ' + source.url);
    }

    sourceIds.add(source.source_id);
    sourceUrls.add(source.url);

    validateApprovedUrl(source.url, source.source_id);

    if (!Array.isArray(source.accepted_content_type_prefixes) ||
        source.accepted_content_type_prefixes.length === 0) {
      throw new Error('Missing accepted content types for ' + source.source_id);
    }

    if (!['html', 'json'].includes(source.file_extension)) {
      throw new Error('Unexpected file extension for ' + source.source_id);
    }
  }

  const allowedHeaders = [...plan.request_policy.request_header_allowlist].sort();

  if (JSON.stringify(allowedHeaders) !== JSON.stringify(['accept', 'user-agent'])) {
    throw new Error('Request header allowlist changed.');
  }

  if (plan.request_policy.method !== 'GET') {
    throw new Error('Only GET is permitted.');
  }

  if (plan.request_policy.authorization_header_allowed ||
      plan.request_policy.cookie_header_allowed ||
      plan.request_policy.payment_header_allowed ||
      plan.request_policy.proxy_authorization_header_allowed ||
      plan.request_policy.api_key_header_allowed) {
    throw new Error('Credential-bearing request headers must remain prohibited.');
  }

  if (plan.request_policy.environment_credential_read_allowed) {
    throw new Error('Environment credential reads must remain prohibited.');
  }

  if (plan.request_policy.paid_route_allowed) {
    throw new Error('Paid routes must remain prohibited.');
  }

  if (plan.request_policy.automatic_retry_allowed) {
    throw new Error('Automatic retry must remain prohibited.');
  }

  if (JSON.stringify(plan.response_policy.accepted_http_statuses) !== JSON.stringify([200])) {
    throw new Error('Only HTTP 200 may be accepted.');
  }

  if (plan.response_policy.partial_capture_accepted ||
      plan.response_policy.unexpected_content_type_accepted ||
      plan.response_policy.non_200_response_accepted) {
    throw new Error('Capture must remain fail-closed.');
  }

  if (plan.output.overwrite_existing_final_directory_allowed ||
      plan.output.partial_final_directory_allowed ||
      !plan.output.atomic_publish_required) {
    throw new Error('Atomic no-overwrite publication must remain required.');
  }

  if (plan.execution_modes.preflight.network_allowed ||
      plan.execution_modes.preflight.filesystem_write_allowed ||
      plan.execution_modes.preflight.model_api_call_allowed ||
      plan.execution_modes.preflight.x402_payment_allowed) {
    throw new Error('Preflight must remain read-only and offline.');
  }

  if (plan.execution_modes.capture.model_api_call_allowed ||
      plan.execution_modes.capture.x402_payment_allowed ||
      plan.execution_modes.capture.automatic_retry_allowed) {
    throw new Error('Capture cannot authorize models, payment, or retry.');
  }
}

function printPreflight() {
  const gitStatus = readGitStatus();

  console.log('========================================');
  console.log('STUDY 008 AUTHORITY CAPTURE PREFLIGHT');
  console.log('========================================');
  console.log('STUDY_ID: ' + plan.study_id);
  console.log('CAPTURE_PLAN_ID: ' + plan.capture_plan_id);
  console.log('CAPTURE_PLAN_SHA256: ' + sha256(planBytes));
  console.log('CAPTURE_RUNNER_SHA256: ' + sha256(readFileSync(runnerPath)));
  console.log('SOURCE_COUNT: ' + plan.sources.length);
  console.log('PUBLIC_HTTPS_ONLY: true');
  console.log('APPROVED_HOST: ' + plan.source_selection_boundary.single_approved_host);
  console.log('AUTHORIZATION_HEADER_ALLOWED: false');
  console.log('COOKIE_HEADER_ALLOWED: false');
  console.log('PAYMENT_HEADER_ALLOWED: false');
  console.log('ENVIRONMENT_CREDENTIAL_READ_ALLOWED: false');
  console.log('PAID_ROUTE_ALLOWED: false');
  console.log('AUTOMATIC_RETRY_ALLOWED: false');
  console.log('ATOMIC_PUBLISH_REQUIRED: true');
  console.log('OVERWRITE_ALLOWED: false');
  console.log('FINAL_DIRECTORY_EXISTS: ' + existsSync(finalDirectory));
  console.log('GIT_HEAD: ' + readGitHead());
  console.log('GIT_WORKTREE_CLEAN: ' + (gitStatus.length === 0));
  console.log('CAPTURE_AUTHORIZED_NOW: false');
  console.log('NETWORK_CALL_PERFORMED: false');
  console.log('FILESYSTEM_WRITE_PERFORMED: false');
  console.log('MODEL_API_CALL_PERFORMED: false');
  console.log('X402_PAYMENT_PERFORMED: false');
  console.log('PREFLIGHT_PASS: true');
}

async function fetchApprovedSource(source) {
  let currentUrl = source.url;
  const redirectChain = [];
  const maximumRedirects = plan.request_policy.maximum_redirects;

  for (let requestIndex = 0; requestIndex <= maximumRedirects; requestIndex += 1) {
    validateApprovedUrl(currentUrl, source.source_id + ' request URL');

    const accept = plan.request_policy.accept_header_by_media_class[source.media_class];

    if (!accept) {
      throw new Error('No frozen Accept header for ' + source.source_id);
    }

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'user-agent': plan.request_policy.user_agent,
        'accept': accept
      },
      signal: AbortSignal.timeout(plan.request_policy.timeout_ms_per_request)
    });

    if (response.status >= 300 && response.status <= 399) {
      const location = response.headers.get('location');

      if (!location) {
        throw new Error(source.source_id + ' returned a redirect without Location.');
      }

      if (requestIndex >= maximumRedirects) {
        throw new Error(source.source_id + ' exceeded the redirect limit.');
      }

      const nextUrl = new URL(location, currentUrl).toString();

      validateApprovedUrl(nextUrl, source.source_id + ' redirect target');

      redirectChain.push({
        http_status: response.status,
        from_url: currentUrl,
        to_url: nextUrl
      });

      currentUrl = nextUrl;
      continue;
    }

    return {
      response,
      finalUrl: currentUrl,
      redirectChain
    };
  }

  throw new Error(source.source_id + ' did not produce a final response.');
}

function validateResponse(source, response, finalUrl, bytes) {
  validateApprovedUrl(finalUrl, source.source_id + ' final URL');

  if (!plan.response_policy.accepted_http_statuses.includes(response.status)) {
    throw new Error(source.source_id + ' returned HTTP ' + response.status + '.');
  }

  const observedContentType = normalizeContentType(response.headers.get('content-type'));

  const acceptedContentTypes = source.accepted_content_type_prefixes.map((value) =>
    normalizeContentType(value)
  );

  if (!acceptedContentTypes.includes(observedContentType)) {
    throw new Error(
      source.source_id +
      ' returned unexpected content type ' +
      String(response.headers.get('content-type'))
    );
  }

  if (bytes.length < plan.response_policy.minimum_response_bytes) {
    throw new Error(source.source_id + ' returned too few bytes.');
  }

  if (bytes.length > plan.response_policy.maximum_response_bytes_per_source) {
    throw new Error(source.source_id + ' exceeded the per-source byte limit.');
  }

  if (source.file_extension === 'json') {
    try {
      JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new Error(source.source_id + ' returned invalid JSON.');
    }
  }

  if (source.file_extension === 'html') {
    const text = bytes.toString('utf8').toLowerCase();

    if (!text.includes('<html') && !text.includes('<!doctype html')) {
      throw new Error(source.source_id + ' did not contain an HTML document marker.');
    }
  }

  return observedContentType;
}

function selectedResponseHeaders(response) {
  const result = {};

  for (const name of plan.manifest_policy.response_headers_recorded) {
    const value = response.headers.get(name);

    if (value !== null) {
      result[name] = value;
    }
  }

  return result;
}

async function capture() {
  if (existsSync(finalDirectory)) {
    throw new Error('Final capture directory already exists: ' + finalDirectory);
  }

  const gitStatus = readGitStatus();

  if (gitStatus.length !== 0) {
    throw new Error('Capture requires a clean committed worktree.');
  }

  const protocolGitHead = readGitHead();

  mkdirSync(path.dirname(temporaryDirectoryPrefix), { recursive: true });

  let temporaryDirectory = null;

  try {
    temporaryDirectory = mkdtempSync(temporaryDirectoryPrefix);

    const captureStartedUtc = new Date().toISOString();

    const captured = [];

    let totalByteCount = 0;

    for (const source of plan.sources) {
      const result = await fetchApprovedSource(source);

      const bytes = Buffer.from(await result.response.arrayBuffer());

      const observedContentType = validateResponse(
        source,
        result.response,
        result.finalUrl,
        bytes
      );

      totalByteCount += bytes.length;

      if (totalByteCount > plan.response_policy.maximum_total_response_bytes) {
        throw new Error('Capture exceeded the frozen total byte limit.');
      }

      const filename = source.source_id + '.' + source.file_extension;

      captured.push({
        bytes,
        record: {
          source_id: source.source_id,
          role: source.role,
          requested_url: source.url,
          final_url: result.finalUrl,
          redirect_chain: result.redirectChain,
          http_status: result.response.status,
          observed_content_type: observedContentType,
          filename,
          byte_count: bytes.length,
          sha256: sha256(bytes),
          captured_at_utc: new Date().toISOString(),
          response_headers: selectedResponseHeaders(result.response)
        }
      });
    }

    for (const item of captured) {
      writeFileSync(
        path.join(temporaryDirectory, item.record.filename),
        item.bytes,
        { flag: 'wx' }
      );
    }

    const captureCompletedUtc = new Date().toISOString();

    const manifest = {
      study_id: plan.study_id,
      capture_plan_id: plan.capture_plan_id,
      status: 'COMPLETE_CONTEMPORANEOUS_AUTHORITY_CAPTURE_PENDING_REVIEW_AND_IMMUTABLE_FREEZE',
      capture_started_utc: captureStartedUtc,
      capture_completed_utc: captureCompletedUtc,
      protocol_git_head: protocolGitHead,
      capture_plan: {
        path: path.relative(root, planPath),
        sha256: sha256(planBytes)
      },
      capture_runner: {
        path: path.relative(root, runnerPath),
        sha256: sha256(readFileSync(runnerPath))
      },
      source_count: captured.length,
      total_byte_count: totalByteCount,
      all_http_status_200: captured.every((item) => item.record.http_status === 200),
      all_content_types_expected: true,
      all_response_hashes_recorded: captured.every((item) => item.record.sha256.length === 64),
      partial_capture_accepted: false,
      authorization_header_sent: false,
      cookie_header_sent: false,
      payment_header_sent: false,
      environment_credential_read: false,
      automatic_retry_performed: false,
      x402_payment_performed: false,
      model_api_call_performed: false,
      records: captured.map((item) => item.record)
    };

    writeFileSync(
      path.join(temporaryDirectory, plan.output.manifest_filename),
      JSON.stringify(manifest, null, 2) + '\n',
      { flag: 'wx' }
    );

    renameSync(temporaryDirectory, finalDirectory);

    temporaryDirectory = null;

    console.log('CAPTURE_STATUS: ' + manifest.status);
    console.log('SOURCE_COUNT: ' + manifest.source_count);
    console.log('TOTAL_BYTE_COUNT: ' + manifest.total_byte_count);
    console.log('ALL_HTTP_STATUS_200: ' + manifest.all_http_status_200);
    console.log('ALL_CONTENT_TYPES_EXPECTED: ' + manifest.all_content_types_expected);
    console.log('AUTHORIZATION_HEADER_SENT: false');
    console.log('PAYMENT_HEADER_SENT: false');
    console.log('AUTOMATIC_RETRY_PERFORMED: false');
    console.log('MODEL_API_CALL_PERFORMED: false');
    console.log('X402_PAYMENT_PERFORMED: false');
    console.log('CAPTURE_DIRECTORY: ' + plan.output.final_directory);
  } catch (error) {
    if (temporaryDirectory && existsSync(temporaryDirectory)) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    throw error;
  }
}

try {
  validatePlan();

  if (mode === '--preflight') {
    printPreflight();
  } else if (mode === '--capture') {
    await capture();
  } else {
    throw new Error(
      'Usage: node scripts/capture-study008-authority.mjs [--preflight|--capture]'
    );
  }
} catch (error) {
  console.error('STUDY008_AUTHORITY_CAPTURE_ERROR: ' + error.message);
  process.exitCode = 1;
}
