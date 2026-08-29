import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

const STUDY_ID =
  "CD-WORKLOAD-20260829-003";

const PATH_ID =
  "P2";

const ROOT =
  process.cwd();

const taskFile =
  path.join(
    ROOT,
    "prompts",
    "CD-WORKLOAD-20260829-003-p1-task.txt"
  );

const sourceFile =
  path.join(
    ROOT,
    "data",
    "CD-WORKLOAD-20260829-002-public-authority-sources.json"
  );

const taskMetadataFile =
  path.join(
    ROOT,
    "data",
    "CD-WORKLOAD-20260829-003-p1-task-metadata.json"
  );

const providerFile =
  path.join(
    ROOT,
    "data",
    "CD-WORKLOAD-20260829-003-provider.json"
  );

const eligibilityFile =
  path.join(
    ROOT,
    "data",
    "CD-WORKLOAD-20260829-003-P2-eligibility.json"
  );

const p1MeasurementFile =
  path.join(
    ROOT,
    "data",
    "raw",
    "CD-003-P1-0001-measurement.json"
  );

const p1EvaluationFile =
  path.join(
    ROOT,
    "data",
    "raw",
    "CD-003-P1-0001-quality-evaluation.json"
  );

const rawDir =
  path.join(
    ROOT,
    "data",
    "raw"
  );

function fail(message) {
  console.error(
    "STUDY003_P2_ERROR:",
    message
  );

  process.exit(1);
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function sha256Buffer(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function sha256File(file) {
  return sha256Buffer(
    fs.readFileSync(file)
  );
}

function money(value) {
  return Number(
    value
  ).toFixed(12);
}

for (const file of [
  taskFile,
  sourceFile,
  taskMetadataFile,
  providerFile,
  eligibilityFile,
  p1MeasurementFile,
  p1EvaluationFile
]) {
  if (!fs.existsSync(file)) {
    fail(
      "Required frozen artifact missing: " +
      path.relative(
        ROOT,
        file
      )
    );
  }
}

const metadata =
  readJson(
    taskMetadataFile
  );

const provider =
  readJson(
    providerFile
  );

const eligibility =
  readJson(
    eligibilityFile
  );

const p1Measurement =
  readJson(
    p1MeasurementFile
  );

const p1Evaluation =
  readJson(
    p1EvaluationFile
  );

if (
  metadata.study_id !==
  STUDY_ID
) {
  fail(
    "Task metadata study ID mismatch."
  );
}

if (
  provider.study_id !==
  STUDY_ID
) {
  fail(
    "Provider study ID mismatch."
  );
}

if (
  eligibility.study_id !==
  STUDY_ID
) {
  fail(
    "P2 eligibility study ID mismatch."
  );
}

if (
  eligibility.status !==
  "P2_PROMPT_CACHE_ACTIVE_FOR_EXACT_WORKLOAD"
) {
  fail(
    "P2 has not been empirically established as cache eligible."
  );
}

if (
  eligibility.cache_activated !==
  true
) {
  fail(
    "Frozen eligibility record does not show cache activation."
  );
}

if (
  eligibility.cache_read_observed !==
  true
) {
  fail(
    "Frozen eligibility record does not show a cache read."
  );
}

if (
  eligibility.cache_write_observed !==
  true
) {
  fail(
    "Frozen eligibility record does not show a cache write."
  );
}

if (
  p1Measurement
    .measurement_valid_for_p1 !==
  true
) {
  fail(
    "Frozen P1 measurement is invalid."
  );
}

if (
  p1Evaluation
    .primary_quality_gate_pass !==
  true
) {
  fail(
    "Frozen P1 observation did not pass quality."
  );
}

if (
  provider.model !==
  "gpt-5.6-luna"
) {
  fail(
    "Unexpected provider model."
  );
}

if (
  provider.reasoning_effort !==
  "none"
) {
  fail(
    "Unexpected reasoning effort."
  );
}

if (
  provider.text_verbosity !==
  "low"
) {
  fail(
    "Unexpected text verbosity."
  );
}

if (
  provider.store !==
  false
) {
  fail(
    "Store must be false."
  );
}

if (
  metadata
    .answer_key_visible_to_p1 !==
  false ||
  metadata
    .quality_contract_visible_to_p1 !==
  false ||
  metadata
    .registered_p3_source_visible_to_p1 !==
  false
) {
  fail(
    "Frozen visibility boundary mismatch."
  );
}

const taskExpected =
  metadata
    .model_visible_inputs
    .find(
      item =>
        item.role ===
        "task_prompt"
    );

const sourceExpected =
  metadata
    .model_visible_inputs
    .find(
      item =>
        item.role ===
        "independent_public_authority_evidence"
    );

if (
  !taskExpected ||
  !sourceExpected
) {
  fail(
    "Frozen model-visible input hashes missing."
  );
}

const taskHash =
  sha256File(
    taskFile
  );

const sourceHash =
  sha256File(
    sourceFile
  );

if (
  taskHash !==
  taskExpected.sha256
) {
  fail(
    "Task hash mismatch."
  );
}

if (
  sourceHash !==
  sourceExpected.sha256
) {
  fail(
    "Authority source hash mismatch."
  );
}

const taskText =
  fs.readFileSync(
    taskFile,
    "utf8"
  ).trim();

const sourceText =
  fs.readFileSync(
    sourceFile,
    "utf8"
  ).trim();

const requestInput =
  taskText +
  "\n\nPUBLIC AUTHORITY EVIDENCE BEGIN\n\n" +
  sourceText +
  "\n\nPUBLIC AUTHORITY EVIDENCE END";

const modelInputHash =
  sha256Buffer(
    Buffer.from(
      requestInput,
      "utf8"
    )
  );

const frozenP1InputHash =
  p1Measurement
    .request
    .model_input_sha256;

if (
  modelInputHash !==
  frozenP1InputHash
) {
  fail(
    "P2 model-visible input differs from frozen P1 input."
  );
}

if (
  modelInputHash !==
  eligibility
    .exact_p1_model_input_sha256
) {
  fail(
    "P2 input differs from frozen eligibility input."
  );
}

const cacheKey =
  eligibility
    .cache_configuration
    .prompt_cache_key;

const cacheMode =
  eligibility
    .cache_configuration
    .mode;

const cacheTtl =
  eligibility
    .cache_configuration
    .ttl;

if (
  cacheMode !==
  "implicit"
) {
  fail(
    "Unexpected frozen cache mode."
  );
}

if (
  cacheTtl !==
  "30m"
) {
  fail(
    "Unexpected frozen cache TTL."
  );
}

const requestBody = {
  model:
    provider.model,

  input:
    requestInput,

  reasoning: {
    effort:
      provider.reasoning_effort
  },

  text: {
    verbosity:
      provider.text_verbosity
  },

  max_output_tokens:
    4096,

  store:
    false,

  prompt_cache_key:
    cacheKey,

  prompt_cache_options: {
    mode:
      cacheMode,

    ttl:
      cacheTtl
  }
};

const mode =
  process.argv[2];

if (
  mode ===
  "--preflight"
) {
  console.log(
    "========================================"
  );

  console.log(
    "STUDY 003 P2 MEASUREMENT RUNNER PREFLIGHT"
  );

  console.log(
    "========================================"
  );

  console.log(
    "STUDY_ID:",
    STUDY_ID
  );

  console.log(
    "MODEL:",
    provider.model
  );

  console.log(
    "CACHE_ELIGIBILITY_STATUS:",
    eligibility.status
  );

  console.log(
    "CACHE_WRITE_PROVEN:",
    eligibility.cache_write_observed
  );

  console.log(
    "CACHE_READ_PROVEN:",
    eligibility.cache_read_observed
  );

  console.log(
    "CACHE_MODE:",
    cacheMode
  );

  console.log(
    "CACHE_TTL:",
    cacheTtl
  );

  console.log(
    "PROMPT_CACHE_KEY:",
    cacheKey
  );

  console.log(
    "MODEL_INPUT_SHA256:",
    modelInputHash
  );

  console.log(
    "MATCHES_FROZEN_P1_INPUT:",
    modelInputHash ===
    frozenP1InputHash
  );

  console.log(
    "P1_QUALITY_GATE_PASS:",
    p1Evaluation
      .primary_quality_gate_pass
  );

  console.log(
    "FORMAL_REQUEST_COUNT_IF_RUN:",
    1
  );

  console.log(
    "CACHE_READ_REQUIRED_FOR_VALID_P2:",
    true
  );

  console.log(
    "API_CALL_PERFORMED:",
    false
  );

  console.log(
    "X402_PAYMENT_PERFORMED:",
    false
  );

  console.log(
    "PREFLIGHT_PASS:",
    true
  );

  process.exit(0);
}

const observationNumber =
  mode;

if (
  !observationNumber ||
  !/^\d{4}$/.test(
    observationNumber
  )
) {
  fail(
    "Usage: node scripts/run-study003-p2.mjs --preflight OR 0001"
  );
}

if (
  !process.env.OPENAI_API_KEY
) {
  fail(
    "OPENAI_API_KEY is not set."
  );
}

const observationId =
  "CD-003-P2-" +
  observationNumber;

fs.mkdirSync(
  rawDir,
  {
    recursive:
      true
  }
);

const rawResponseFile =
  path.join(
    rawDir,
    observationId +
    "-response.json"
  );

const outputJsonFile =
  path.join(
    rawDir,
    observationId +
    "-output.json"
  );

const outputTextFile =
  path.join(
    rawDir,
    observationId +
    "-output.txt"
  );

const measurementFile =
  path.join(
    rawDir,
    observationId +
    "-measurement.json"
  );

for (const file of [
  rawResponseFile,
  outputJsonFile,
  outputTextFile,
  measurementFile
]) {
  if (
    fs.existsSync(file)
  ) {
    fail(
      observationId +
      " already exists. Refusing duplicate measurement."
    );
  }
}

const apiUrl =
  "https://api.openai.com/v1/responses";

const startedAt =
  new Date();

const startPerf =
  performance.now();

const response =
  await fetch(
    apiUrl,
    {
      method:
        "POST",

      headers: {
        Authorization:
          "Bearer " +
          process.env.OPENAI_API_KEY,

        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(
          requestBody
        )
    }
  );

const latencyMs =
  performance.now() -
  startPerf;

const rawText =
  await response.text();

fs.writeFileSync(
  rawResponseFile,
  rawText,
  "utf8"
);

if (
  !response.ok
) {
  fail(
    "OpenAI request failed with HTTP " +
    response.status +
    ". Raw response preserved."
  );
}

let apiResponse;

try {
  apiResponse =
    JSON.parse(
      rawText
    );
} catch {
  fail(
    "Successful OpenAI response was not valid JSON."
  );
}

const outputText =
  (apiResponse.output || [])
    .flatMap(
      item =>
        item.content || []
    )
    .filter(
      item =>
        item.type ===
        "output_text"
    )
    .map(
      item =>
        item.text
    )
    .join("")
    .trim();

let outputObject =
  null;

let outputJsonValid =
  false;

try {
  outputObject =
    JSON.parse(
      outputText
    );

  outputJsonValid =
    outputObject !== null &&
    typeof outputObject ===
      "object" &&
    !Array.isArray(
      outputObject
    );
} catch {
  outputJsonValid =
    false;
}

if (
  outputJsonValid
) {
  fs.writeFileSync(
    outputJsonFile,
    JSON.stringify(
      outputObject,
      null,
      2
    ) + "\n",
    "utf8"
  );
} else {
  fs.writeFileSync(
    outputTextFile,
    outputText + "\n",
    "utf8"
  );
}

const usage =
  apiResponse.usage ||
  {};

const inputDetails =
  usage.input_tokens_details ||
  {};

const outputDetails =
  usage.output_tokens_details ||
  {};

const inputTokens =
  Number(
    usage.input_tokens ||
    0
  );

const cachedTokens =
  Number(
    inputDetails.cached_tokens ||
    0
  );

const cacheWriteTokens =
  Number(
    inputDetails.cache_write_tokens ||
    0
  );

const outputTokens =
  Number(
    usage.output_tokens ||
    0
  );

const reasoningTokens =
  Number(
    outputDetails.reasoning_tokens ||
    0
  );

const uncachedTokens =
  Math.max(
    0,
    inputTokens -
    cachedTokens -
    cacheWriteTokens
  );

const price =
  provider
    .pricing_usd_per_million_tokens;

const uncachedInputCost =
  uncachedTokens *
  Number(
    price.input
  ) /
  1_000_000;

const cachedInputCost =
  cachedTokens *
  Number(
    price.cached_input
  ) /
  1_000_000;

const cacheWriteCost =
  cacheWriteTokens *
  Number(
    price.cache_write
  ) /
  1_000_000;

const outputCost =
  outputTokens *
  Number(
    price.output
  ) /
  1_000_000;

const totalCost =
  uncachedInputCost +
  cachedInputCost +
  cacheWriteCost +
  outputCost;

const cacheReadObserved =
  cachedTokens > 0;

const cacheWriteObserved =
  cacheWriteTokens > 0;

const measurementValidForP2 =
  cacheReadObserved &&
  !cacheWriteObserved;

const cacheState =
  measurementValidForP2
    ? "P2_CACHE_HIT"
    : cacheWriteObserved
      ? "P2_CACHE_WRITE_NOT_FORMAL_HIT"
      : "P2_NO_CACHE_ACTIVITY";

const measurement = {
  study_id:
    STUDY_ID,

  observation_id:
    observationId,

  path:
    PATH_ID,

  status:
    measurementValidForP2
      ? "P2_MEASUREMENT_CAPTURED_CACHE_HIT_QUALITY_NOT_YET_EVALUATED"
      : "P2_MEASUREMENT_CAPTURED_NOT_VALID_CACHE_HIT",

  timestamp_utc:
    startedAt.toISOString(),

  provider:
    provider.provider,

  model:
    apiResponse.model ||
    provider.model,

  api_endpoint:
    apiUrl,

  cache_configuration: {
    mode:
      cacheMode,

    ttl:
      cacheTtl,

    prompt_cache_key:
      cacheKey
  },

  request: {
    task_sha256:
      taskHash,

    public_authority_source_sha256:
      sourceHash,

    model_input_sha256:
      modelInputHash,

    exact_p1_input_match:
      modelInputHash ===
      frozenP1InputHash,

    answer_key_visible:
      false,

    quality_contract_visible:
      false,

    registered_p3_source_visible:
      false
  },

  response: {
    http_status:
      response.status,

    output_json_valid:
      outputJsonValid,

    raw_response_file:
      path.relative(
        ROOT,
        rawResponseFile
      ),

    output_file:
      path.relative(
        ROOT,
        outputJsonValid
          ? outputJsonFile
          : outputTextFile
      )
  },

  usage: {
    input_tokens:
      inputTokens,

    cached_input_tokens:
      cachedTokens,

    cache_write_tokens:
      cacheWriteTokens,

    uncached_input_tokens:
      uncachedTokens,

    output_tokens:
      outputTokens,

    reasoning_tokens:
      reasoningTokens
  },

  cost_usd: {
    uncached_input:
      money(
        uncachedInputCost
      ),

    cached_input:
      money(
        cachedInputCost
      ),

    cache_write:
      money(
        cacheWriteCost
      ),

    output:
      money(
        outputCost
      ),

    total_requester_model_cost:
      money(
        totalCost
      )
  },

  cache_state:
    cacheState,

  cache_read_observed:
    cacheReadObserved,

  cache_write_observed:
    cacheWriteObserved,

  measurement_valid_for_p2:
    measurementValidForP2,

  latency_total_ms:
    Number(
      latencyMs.toFixed(
        3
      )
    ),

  quality: {
    contract_id:
      "CD003-QC-1.0",

    status:
      "NOT_YET_EVALUATED",

    pass:
      null
  },

  api_call_performed:
    true,

  x402_payment_performed:
    false
};

fs.writeFileSync(
  measurementFile,
  JSON.stringify(
    measurement,
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(
  "HTTP_STATUS:",
  response.status
);

console.log(
  "OBSERVATION_ID:",
  observationId
);

console.log(
  "MODEL:",
  measurement.model
);

console.log(
  "INPUT_TOKENS:",
  inputTokens
);

console.log(
  "CACHED_INPUT_TOKENS:",
  cachedTokens
);

console.log(
  "CACHE_WRITE_TOKENS:",
  cacheWriteTokens
);

console.log(
  "UNCACHED_INPUT_TOKENS:",
  uncachedTokens
);

console.log(
  "OUTPUT_TOKENS:",
  outputTokens
);

console.log(
  "TOTAL_MODEL_COST_USD:",
  measurement
    .cost_usd
    .total_requester_model_cost
);

console.log(
  "CACHE_STATE:",
  cacheState
);

console.log(
  "CACHE_READ_OBSERVED:",
  cacheReadObserved
);

console.log(
  "CACHE_WRITE_OBSERVED:",
  cacheWriteObserved
);

console.log(
  "MEASUREMENT_VALID_FOR_P2:",
  measurementValidForP2
);

console.log(
  "OUTPUT_JSON_VALID:",
  outputJsonValid
);

console.log(
  "QUALITY_STATUS:",
  measurement
    .quality
    .status
);

console.log(
  "X402_PAYMENT_PERFORMED:",
  false
);

console.log(
  "MEASUREMENT_FILE:",
  path.relative(
    ROOT,
    measurementFile
  )
);
