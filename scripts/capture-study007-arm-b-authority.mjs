import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const planPath = path.join(root, 'data/CD-WORKLOAD-20260831-007-authority-capture-plan.json');
const plan = JSON.parse(await import('node:fs/promises').then(({ readFile }) => readFile(planPath, 'utf8')));
const mode = process.argv[2] ?? '--preflight';
const outputDirectory = path.join(root, plan.arm_b.output_directory);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function validatePlan() {
  const ids = new Set();
  for (const source of plan.arm_b.sources) {
    if (ids.has(source.source_id)) throw new Error(`Duplicate source ID: ${source.source_id}`);
    ids.add(source.source_id);
    const url = new URL(source.url);
    if (url.protocol !== 'https:') throw new Error(`Non-HTTPS source: ${source.url}`);
    if (url.hostname !== 'www.robbiegeorgephotography.com') throw new Error(`Unexpected host: ${source.url}`);
    if (url.pathname.startsWith('/x402/')) throw new Error(`Paid route prohibited: ${source.url}`);
  }
  if (plan.capture_policy.authorization_header_allowed) throw new Error('Authorization must remain disabled.');
  if (plan.capture_policy.payment_header_allowed) throw new Error('Payment headers must remain disabled.');
  if (plan.capture_policy.overwrite_existing_capture_allowed) throw new Error('Capture overwrite must remain disabled.');
}

function printPreflight() {
  console.log('========================================');
  console.log('STUDY 007 ARM B AUTHORITY CAPTURE PREFLIGHT');
  console.log('========================================');
  console.log(`STUDY_ID: ${plan.study_id}`);
  console.log(`CAPTURE_PLAN_ID: ${plan.capture_plan_id}`);
  console.log(`SOURCE_COUNT: ${plan.arm_b.sources.length}`);
  console.log('PUBLIC_HTTPS_ONLY: true');
  console.log('AUTHORIZATION_HEADER_ALLOWED: false');
  console.log('PAYMENT_HEADER_ALLOWED: false');
  console.log('PAID_ROUTE_ALLOWED: false');
  console.log('OVERWRITE_ALLOWED: false');
  console.log(`OUTPUT_EXISTS: ${existsSync(outputDirectory)}`);
  console.log('NETWORK_CALL_PERFORMED: false');
  console.log('MODEL_API_CALL_PERFORMED: false');
  console.log('X402_PAYMENT_PERFORMED: false');
  console.log('PREFLIGHT_PASS: true');
}

async function capture() {
  if (existsSync(outputDirectory)) throw new Error(`Capture directory already exists: ${outputDirectory}`);
  mkdirSync(outputDirectory, { recursive: true });
  const records = [];

  for (const source of plan.arm_b.sources) {
    const response = await fetch(source.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': 'Compression-Dividend-Benchmark-Study007/1.0' }
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!plan.capture_policy.accepted_http_statuses.includes(response.status)) {
      throw new Error(`${source.source_id} returned HTTP ${response.status}; capture is incomplete.`);
    }
    const extension = source.media_class === 'application/json' ? 'json' : 'html';
    const filename = `${source.source_id}.${extension}`;
    writeFileSync(path.join(outputDirectory, filename), bytes, { flag: 'wx' });
    const headers = {};
    for (const name of plan.capture_policy.response_headers_recorded) {
      const value = response.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    records.push({
      source_id: source.source_id,
      role: source.role,
      requested_url: source.url,
      final_url: response.url,
      http_status: response.status,
      filename,
      byte_count: bytes.length,
      sha256: sha256(bytes),
      response_headers: headers
    });
  }

  const manifest = {
    study_id: plan.study_id,
    capture_plan_id: plan.capture_plan_id,
    capture_timestamp_utc: new Date().toISOString(),
    status: 'COMPLETE_PUBLIC_AUTHORITY_CAPTURE_PENDING_INDEPENDENT_REVIEW_AND_FREEZE',
    source_count: records.length,
    all_http_status_200: records.every((record) => record.http_status === 200),
    authorization_header_sent: false,
    payment_header_sent: false,
    x402_payment_performed: false,
    model_api_call_performed: false,
    records
  };
  writeFileSync(
    path.join(outputDirectory, 'capture-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { flag: 'wx' }
  );
  console.log(`CAPTURE_STATUS: ${manifest.status}`);
  console.log(`SOURCE_COUNT: ${manifest.source_count}`);
  console.log(`ALL_HTTP_STATUS_200: ${manifest.all_http_status_200}`);
  console.log('X402_PAYMENT_PERFORMED: false');
  console.log(`CAPTURE_DIRECTORY: ${plan.arm_b.output_directory}`);
}

try {
  validatePlan();
  if (mode === '--preflight') printPreflight();
  else if (mode === '--capture') await capture();
  else throw new Error('Usage: node scripts/capture-study007-arm-b-authority.mjs [--preflight|--capture]');
} catch (error) {
  console.error(`STUDY007_AUTHORITY_CAPTURE_ERROR: ${error.message}`);
  process.exitCode = 1;
}
