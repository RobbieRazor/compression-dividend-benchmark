import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';


const STUDY_ID = 'CD-WORKLOAD-20260831-007';
const MODULE_ID = 'CD007-SOURCE-GROUNDED-ENRICHED-BIOGRAPHY-001';
const PATH_ID = 'P1A';
const CONTRACT_ID = 'CD007-QC-1.0';
const ROOT = process.cwd();

const taskFile = path.join(
  ROOT,
  'prompts/CD-WORKLOAD-20260831-007-arm-a-neutral-task.txt'
);
const schemaFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260830-005-neutral-schema.json'
);
const preservationRulesFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260830-006-neutral-canonical-preservation-rules.json'
);
const sourceGroundingRulesFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260831-007-neutral-source-grounding-rules.json'
);
const publicAuthorityFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
);
const inheritedAuthorityFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260829-002-public-authority-sources.json'
);
const metadataFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260831-007-arm-a-task-metadata.json'
);
const providerFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260831-007-arm-a-provider.json'
);
const preregistrationFile = path.join(
  ROOT,
  'data/CD-WORKLOAD-20260831-007-arm-a-preregistration-manifest.json'
);
const rawDir = path.join(ROOT, 'data/raw');


function fail(message) {
  console.error('STUDY007_ARM_A_ERROR:', message);
  process.exit(1);
}


function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}


function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}


function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}


function money(value) {
  return Number(value).toFixed(12);
}


for (const file of [
  taskFile,
  schemaFile,
  preservationRulesFile,
  sourceGroundingRulesFile,
  publicAuthorityFile,
  inheritedAuthorityFile,
  metadataFile,
  providerFile,
  preregistrationFile
]) {
  if (!fs.existsSync(file)) {
    fail('Required frozen artifact missing: ' + path.relative(ROOT, file));
  }
}

const metadata = readJson(metadataFile);
const provider = readJson(providerFile);
const preregistration = readJson(preregistrationFile);

if (metadata.study_id !== STUDY_ID || metadata.module_id !== MODULE_ID) {
  fail('Task metadata identity mismatch.');
}

if (provider.study_id !== STUDY_ID || provider.module_id !== MODULE_ID) {
  fail('Provider configuration identity mismatch.');
}

if (
  preregistration.study_id !== STUDY_ID ||
  preregistration.module_id !== MODULE_ID
) {
  fail('Preregistration identity mismatch.');
}

if (
  preregistration.status !==
  'ARM_A_QUALITY_TASK_VISIBILITY_PROVIDER_AND_EVALUATOR_FROZEN_PRE_MEASUREMENT'
) {
  fail('Preregistration package is not frozen.');
}

if (
  preregistration.arm_state.arm_a_preregistered !== true ||
  preregistration.arm_state.arm_a_measurement_started !== false ||
  preregistration.arm_state.arm_a_automatic_retry_allowed !== false
) {
  fail('Arm A preregistration state is invalid.');
}

if (preregistration.arm_state.arm_b_measurement_allowed !== false) {
  fail('Arm B must remain measurement-blocked.');
}

if (!preregistration.next_artifact.includes('Arm A-only runner')) {
  fail('Preregistration does not authorize the P1A runner step.');
}

if (
  preregistration.downstream_gate.p2_probe_allowed !== false ||
  preregistration.downstream_gate.p3_payment_allowed !== false
) {
  fail('P2 or P3 boundary is unexpectedly open.');
}

if (provider.model !== 'gpt-5.6-luna') {
  fail('Unexpected provider model.');
}

if (provider.reasoning_effort !== 'none') {
  fail('Unexpected reasoning effort.');
}

if (provider.text_verbosity !== 'low') {
  fail('Unexpected text verbosity.');
}

if (provider.store !== false) {
  fail('Store must be false.');
}

if (provider.max_output_tokens !== 8192) {
  fail('Unexpected maximum output-token limit.');
}

if (
  provider.p1_configuration.prompt_cache_mode !== 'explicit' ||
  provider.p1_configuration.explicit_breakpoints !== 0 ||
  provider.p1_configuration.prompt_cache_key !== null
) {
  fail('P1A cache configuration is not pure recomputation.');
}

if (
  provider.p1_configuration.planned_observations_in_feasibility_phase !== 1 ||
  provider.p1_configuration.automatic_retry_allowed !== false
) {
  fail('P1A feasibility observation or retry boundary changed.');
}

for (const field of [
  'authority_target_freeze_visible_to_p1',
  'target_representation_visible_to_p1',
  'quality_contract_visible_to_p1',
  'evaluator_visible_to_p1',
  'protected_p3_payload_visible_to_p1',
  'study005_output_visible_to_p1',
  'study005_quality_evaluation_visible_to_p1',
  'study005_semantic_adjudication_visible_to_p1',
  'prior_failure_locations_visible_to_p1',
  'provider_configuration_visible_as_model_input'
]) {
  if (metadata.visibility_assertions[field] !== false) {
    fail('Model-visibility boundary violated: ' + field);
  }
}

for (const field of [
  'neutral_task_visible_to_p1',
  'neutral_schema_visible_to_p1',
  'neutral_preservation_rules_visible_to_p1',
  'neutral_source_grounding_rules_visible_to_p1',
  'exact_reused_public_authority_evidence_visible_to_p1'
]) {
  if (metadata.visibility_assertions[field] !== true) {
    fail('Required model-visible input is not authorized: ' + field);
  }
}

const visibleFiles = {
  neutral_task: taskFile,
  value_free_neutral_schema_exact_reuse: schemaFile,
  value_free_canonical_preservation_rules: preservationRulesFile,
  value_free_source_grounding_rules: sourceGroundingRulesFile,
  study004_public_authority_package_exact_reuse: publicAuthorityFile,
  inherited_public_authority_evidence_exact_reuse: inheritedAuthorityFile
};

for (const item of metadata.model_visible_inputs) {
  const file = visibleFiles[item.role];

  if (!file) {
    fail('Unexpected model-visible input role: ' + item.role);
  }

  if (sha256File(file) !== item.sha256) {
    fail('Frozen model-visible input hash mismatch: ' + item.role);
  }
}

if (Object.keys(visibleFiles).length !== metadata.model_visible_inputs.length) {
  fail('Frozen model-visible input count mismatch.');
}

const taskText = fs.readFileSync(taskFile, 'utf8').trim();
const schemaText = fs.readFileSync(schemaFile, 'utf8').trim();
const preservationRulesText = fs
  .readFileSync(preservationRulesFile, 'utf8')
  .trim();
const sourceGroundingRulesText = fs
  .readFileSync(sourceGroundingRulesFile, 'utf8')
  .trim();
const publicAuthorityText = fs.readFileSync(publicAuthorityFile, 'utf8').trim();
const inheritedAuthorityText = fs
  .readFileSync(inheritedAuthorityFile, 'utf8')
  .trim();
const delimiters = provider.request_input_delimiters;

const requestInput =
  taskText +
  '\n\n' +
  delimiters.neutral_schema_begin +
  '\n\n' +
  schemaText +
  '\n\n' +
  delimiters.neutral_schema_end +
  '\n\n' +
  delimiters.preservation_rules_begin +
  '\n\n' +
  preservationRulesText +
  '\n\n' +
  delimiters.preservation_rules_end +
  '\n\n' +
  delimiters.source_grounding_rules_begin +
  '\n\n' +
  sourceGroundingRulesText +
  '\n\n' +
  delimiters.source_grounding_rules_end +
  '\n\n' +
  delimiters.public_authority_begin +
  '\n\n' +
  publicAuthorityText +
  '\n\n' +
  delimiters.public_authority_end +
  '\n\n' +
  delimiters.inherited_authority_begin +
  '\n\n' +
  inheritedAuthorityText +
  '\n\n' +
  delimiters.inherited_authority_end;

const requestInputBytes = Buffer.byteLength(requestInput, 'utf8');
const requestInputHash = sha256Buffer(Buffer.from(requestInput, 'utf8'));

if (
  requestInputBytes !== metadata.model_visible_input_composition.byte_count ||
  requestInputHash !== metadata.model_visible_input_composition.sha256
) {
  fail('Frozen model-visible input composition mismatch.');
}

const requestBody = {
  model: provider.model,
  input: requestInput,
  reasoning: {
    effort: provider.reasoning_effort
  },
  text: {
    verbosity: provider.text_verbosity
  },
  max_output_tokens: provider.max_output_tokens,
  store: false,
  prompt_cache_options: {
    mode: provider.p1_configuration.prompt_cache_mode
  }
};

const mode = process.argv[2];

if (mode === '--preflight') {
  console.log('========================================');
  console.log('STUDY 007 ARM A SOURCE-GROUNDED FEASIBILITY RUNNER PREFLIGHT');
  console.log('========================================');
  console.log('STUDY_ID:', STUDY_ID);
  console.log('MODULE_ID:', MODULE_ID);
  console.log('PATH:', PATH_ID);
  console.log('OBSERVATION_RESERVED:', 'CD-007-P1A-0001');
  console.log('MODEL:', provider.model);
  console.log('REASONING_EFFORT:', provider.reasoning_effort);
  console.log('TEXT_VERBOSITY:', provider.text_verbosity);
  console.log('MAX_OUTPUT_TOKENS:', provider.max_output_tokens);
  console.log('STORE:', provider.store);
  console.log('CACHE_MODE:', provider.p1_configuration.prompt_cache_mode);
  console.log('CACHE_BREAKPOINTS:', provider.p1_configuration.explicit_breakpoints);
  console.log('MODEL_VISIBLE_INPUT_COUNT:', metadata.model_visible_inputs.length);
  console.log('MODEL_INPUT_BYTES:', requestInputBytes);
  console.log('MODEL_INPUT_SHA256:', requestInputHash);
  console.log('NEUTRAL_SCHEMA_VISIBLE:', true);
  console.log('NEUTRAL_PRESERVATION_RULES_VISIBLE:', true);
  console.log('NEUTRAL_SOURCE_GROUNDING_RULES_VISIBLE:', true);
  console.log('ARM_B_MEASUREMENT_ALLOWED:', false);
  console.log('TARGET_VISIBLE:', false);
  console.log('QC_VISIBLE:', false);
  console.log('EVALUATOR_VISIBLE:', false);
  console.log('STUDY005_FAILURE_DIAGNOSTICS_VISIBLE:', false);
  console.log('P3_PAYLOAD_VISIBLE:', false);
  console.log('AUTOMATIC_RETRY_ALLOWED:', false);
  console.log('P2_PROBE_PERFORMED:', false);
  console.log('P3_PAYMENT_ALLOWED:', false);
  console.log('API_CREDENTIAL_PRESENT:', Boolean(process.env.OPENAI_API_KEY));
  console.log('API_CALL_PERFORMED:', false);
  console.log('X402_PAYMENT_PERFORMED:', false);
  console.log('PREFLIGHT_PASS:', true);
  process.exit(0);
}

if (mode !== '0001') {
  fail('Usage: node scripts/run-study007-arm-a.mjs --preflight OR 0001');
}

if (!process.env.OPENAI_API_KEY) {
  fail('OPENAI_API_KEY is not set in this Terminal session.');
}

const observationId = 'CD-007-P1A-0001';

fs.mkdirSync(rawDir, { recursive: true });

const rawResponseFile = path.join(rawDir, observationId + '-response.json');
const outputJsonFile = path.join(rawDir, observationId + '-output.json');
const outputTextFile = path.join(rawDir, observationId + '-output.txt');
const measurementFile = path.join(rawDir, observationId + '-measurement.json');

for (const file of [
  rawResponseFile,
  outputJsonFile,
  outputTextFile,
  measurementFile
]) {
  if (fs.existsSync(file)) {
    fail(observationId + ' already exists. Refusing duplicate measurement.');
  }
}

const apiUrl = 'https://api.openai.com/v1/responses';
const startedAt = new Date();
const startPerf = performance.now();

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(requestBody)
});

const latencyMs = performance.now() - startPerf;
const rawText = await response.text();

fs.writeFileSync(rawResponseFile, rawText, 'utf8');

if (!response.ok) {
  fail(
    'OpenAI request failed with HTTP ' +
      response.status +
      '. Raw response preserved.'
  );
}

let apiResponse;

try {
  apiResponse = JSON.parse(rawText);
} catch {
  fail('Successful OpenAI response was not valid JSON.');
}

const outputText = (apiResponse.output || [])
  .flatMap((item) => item.content || [])
  .filter((item) => item.type === 'output_text')
  .map((item) => item.text)
  .join('')
  .trim();

let outputObject = null;
let outputJsonValid = false;

try {
  outputObject = JSON.parse(outputText);
  outputJsonValid =
    outputObject !== null &&
    typeof outputObject === 'object' &&
    !Array.isArray(outputObject);
} catch {
  outputJsonValid = false;
}

if (outputJsonValid) {
  fs.writeFileSync(
    outputJsonFile,
    JSON.stringify(outputObject, null, 2) + '\n',
    'utf8'
  );
} else {
  fs.writeFileSync(outputTextFile, outputText + '\n', 'utf8');
}

const usage = apiResponse.usage || {};
const inputDetails = usage.input_tokens_details || {};
const outputDetails = usage.output_tokens_details || {};
const inputTokens = Number(usage.input_tokens || 0);
const cachedTokens = Number(inputDetails.cached_tokens || 0);
const cacheWriteTokens = Number(inputDetails.cache_write_tokens || 0);
const outputTokens = Number(usage.output_tokens || 0);
const reasoningTokens = Number(outputDetails.reasoning_tokens || 0);
const uncachedTokens = Math.max(
  0,
  inputTokens - cachedTokens - cacheWriteTokens
);
const price = provider.pricing_usd_per_million_tokens;
const inputCost = (uncachedTokens * Number(price.input)) / 1_000_000;
const cachedInputCost =
  (cachedTokens * Number(price.cached_input)) / 1_000_000;
const cacheWriteCost =
  (cacheWriteTokens * Number(price.cache_write)) / 1_000_000;
const outputCost = (outputTokens * Number(price.output)) / 1_000_000;
const totalCost = inputCost + cachedInputCost + cacheWriteCost + outputCost;
const cacheState =
  cachedTokens === 0 && cacheWriteTokens === 0
    ? 'P1_EXPLICIT_NO_CACHE'
    : 'UNEXPECTED_CACHE_ACTIVITY';
const responseCompleted = apiResponse.status === 'completed';
const measurementValidForP1 = Boolean(
  response.ok &&
    responseCompleted &&
    outputJsonValid &&
    cacheState === 'P1_EXPLICIT_NO_CACHE'
);
const outputFile = outputJsonValid ? outputJsonFile : outputTextFile;

const measurement = {
  study_id: STUDY_ID,
  module_id: MODULE_ID,
  observation_id: observationId,
  path: PATH_ID,
  phase: 'INITIAL_FEASIBILITY',
  status: 'P1_MEASUREMENT_CAPTURED_QUALITY_NOT_YET_EVALUATED',
  timestamp_utc: startedAt.toISOString(),
  provider: provider.provider,
  model: apiResponse.model || provider.model,
  api_endpoint: apiUrl,
  request: {
    task_sha256: sha256File(taskFile),
    neutral_schema_sha256: sha256File(schemaFile),
    canonical_preservation_rules_sha256: sha256File(preservationRulesFile),
    source_grounding_rules_sha256: sha256File(sourceGroundingRulesFile),
    study004_public_authority_package_sha256: sha256File(publicAuthorityFile),
    inherited_public_authority_evidence_sha256: sha256File(
      inheritedAuthorityFile
    ),
    model_input_sha256: requestInputHash,
    model_input_bytes: requestInputBytes,
    neutral_schema_visible: true,
    source_grounding_rules_visible: true,
    arm_b_measurement_allowed: false,
    target_representation_visible: false,
    quality_contract_visible: false,
    evaluator_visible: false,
    study005_failure_diagnostics_visible: false,
    protected_p3_payload_visible: false
  },
  response: {
    http_status: response.status,
    api_status: apiResponse.status || null,
    output_json_valid: outputJsonValid,
    raw_response_file: path.relative(ROOT, rawResponseFile),
    raw_response_sha256: sha256File(rawResponseFile),
    output_file: path.relative(ROOT, outputFile),
    output_sha256: sha256File(outputFile)
  },
  usage: {
    input_tokens: inputTokens,
    cached_input_tokens: cachedTokens,
    cache_write_tokens: cacheWriteTokens,
    uncached_input_tokens: uncachedTokens,
    output_tokens: outputTokens,
    reasoning_tokens: reasoningTokens
  },
  cost_usd: {
    accounting_schedule: provider.pricing_provenance.measurement_class,
    input: money(inputCost),
    cached_input: money(cachedInputCost),
    cache_write: money(cacheWriteCost),
    output: money(outputCost),
    total_requester_model_cost: money(totalCost)
  },
  cache_state: cacheState,
  measurement_valid_for_p1: measurementValidForP1,
  latency_total_ms: Number(latencyMs.toFixed(3)),
  quality: {
    contract_id: CONTRACT_ID,
    status: 'NOT_YET_EVALUATED',
    pass: null,
    initial_feasibility_established: null,
    stable_cost_calibration_established: false
  },
  automatic_retry_allowed: false,
  api_call_performed: true,
  p2_probe_performed: false,
  x402_payment_performed: false,
  economic_comparison_performed: false
};

fs.writeFileSync(
  measurementFile,
  JSON.stringify(measurement, null, 2) + '\n',
  'utf8'
);

console.log('HTTP_STATUS:', response.status);
console.log('API_STATUS:', apiResponse.status || null);
console.log('OBSERVATION_ID:', observationId);
console.log('PHASE:', measurement.phase);
console.log('MODEL:', measurement.model);
console.log('INPUT_TOKENS:', inputTokens);
console.log('CACHED_INPUT_TOKENS:', cachedTokens);
console.log('CACHE_WRITE_TOKENS:', cacheWriteTokens);
console.log('OUTPUT_TOKENS:', outputTokens);
console.log(
  'TOTAL_MODEL_COST_USD:',
  measurement.cost_usd.total_requester_model_cost
);
console.log('CACHE_STATE:', cacheState);
console.log('MEASUREMENT_VALID_FOR_P1:', measurementValidForP1);
console.log('OUTPUT_JSON_VALID:', outputJsonValid);
console.log('QUALITY_STATUS:', measurement.quality.status);
console.log('AUTOMATIC_RETRY_ALLOWED:', false);
console.log('P2_PROBE_PERFORMED:', false);
console.log('X402_PAYMENT_PERFORMED:', false);
console.log('ECONOMIC_COMPARISON_PERFORMED:', false);
console.log('MEASUREMENT_FILE:', path.relative(ROOT, measurementFile));
