import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

const STUDY_ID = "CD-WORKLOAD-20260829-002";
const PATH_ID = "P1";
const ROOT = process.cwd();

const taskFile = path.join(
  ROOT,
  "prompts",
  "CD-WORKLOAD-20260829-002-p1-task.txt"
);

const sourceFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260829-002-public-authority-sources.json"
);

const metadataFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260829-002-p1-task-metadata.json"
);

const providerFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260829-002-provider.json"
);

const rawDir = path.join(
  ROOT,
  "data",
  "raw"
);

function fail(message) {
  console.error(
    "STUDY002_P1_ERROR:",
    message
  );
  process.exit(1);
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

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

function money(value) {
  return Number(value).toFixed(12);
}

for (const file of [
  taskFile,
  sourceFile,
  metadataFile,
  providerFile
]) {
  if (!fs.existsSync(file)) {
    fail(
      "Required file missing: " +
      path.relative(ROOT, file)
    );
  }
}

const metadata = readJson(
  metadataFile
);

const provider = readJson(
  providerFile
);

if (
  metadata.study_id !== STUDY_ID
) {
  fail(
    "Unexpected task metadata study ID."
  );
}

if (
  provider.study_id !== STUDY_ID
) {
  fail(
    "Unexpected provider study ID."
  );
}

if (
  provider.model !== "gpt-5.6-luna"
) {
  fail(
    "Unexpected provider model."
  );
}

if (
  provider.reasoning_effort !== "none"
) {
  fail(
    "Unexpected reasoning effort."
  );
}

if (
  provider.text_verbosity !== "low"
) {
  fail(
    "Unexpected text verbosity."
  );
}

if (
  provider.store !== false
) {
  fail(
    "Provider store must be false."
  );
}

if (
  provider
    .path_1_cache_configuration
    ?.prompt_cache_mode !==
  "explicit"
) {
  fail(
    "P1 cache mode is not explicit."
  );
}

if (
  provider
    .path_1_cache_configuration
    ?.explicit_breakpoints !== 0
) {
  fail(
    "P1 must have zero cache breakpoints."
  );
}

if (
  metadata
    .registered_p3_source_visible_to_p1 !==
  false
) {
  fail(
    "P3 source visibility boundary violated."
  );
}

if (
  metadata
    .quality_contract_visible_to_p1 !==
  false
) {
  fail(
    "Quality Contract visibility boundary violated."
  );
}

if (
  metadata
    .reference_projection_visible_to_p1 !==
  false
) {
  fail(
    "Reference visibility boundary violated."
  );
}

const taskExpected =
  metadata.model_visible_inputs.find(
    item =>
      item.role === "task_prompt"
  );

const sourceExpected =
  metadata.model_visible_inputs.find(
    item =>
      item.role ===
      "public_authority_evidence"
  );

if (!taskExpected) {
  fail(
    "Frozen task hash missing."
  );
}

if (!sourceExpected) {
  fail(
    "Frozen source hash missing."
  );
}

const taskActualHash =
  sha256File(taskFile);

const sourceActualHash =
  sha256File(sourceFile);

if (
  taskActualHash !==
  taskExpected.sha256
) {
  fail(
    "Frozen task prompt hash mismatch."
  );
}

if (
  sourceActualHash !==
  sourceExpected.sha256
) {
  fail(
    "Frozen public authority source hash mismatch."
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

const requestInputHash =
  sha256Buffer(
    Buffer.from(
      requestInput,
      "utf8"
    )
  );

const requestBody = {
  model: provider.model,

  input: requestInput,

  reasoning: {
    effort:
      provider.reasoning_effort
  },

  text: {
    verbosity:
      provider.text_verbosity
  },

  max_output_tokens: 4096,

  store: false,

  prompt_cache_options: {
    mode: "explicit"
  }
};

const mode =
  process.argv[2];

if (
  mode === "--preflight"
) {
  console.log(
    "========================================"
  );
  console.log(
    "STUDY 002 P1 RUNNER PREFLIGHT"
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
    "REASONING_EFFORT:",
    provider.reasoning_effort
  );

  console.log(
    "TEXT_VERBOSITY:",
    provider.text_verbosity
  );

  console.log(
    "STORE:",
    provider.store
  );

  console.log(
    "CACHE_MODE:",
    provider
      .path_1_cache_configuration
      .prompt_cache_mode
  );

  console.log(
    "CACHE_BREAKPOINTS:",
    provider
      .path_1_cache_configuration
      .explicit_breakpoints
  );

  console.log(
    "TASK_SHA256:",
    taskActualHash
  );

  console.log(
    "SOURCE_SHA256:",
    sourceActualHash
  );

  console.log(
    "MODEL_INPUT_BYTES:",
    Buffer.byteLength(
      requestInput,
      "utf8"
    )
  );

  console.log(
    "MODEL_INPUT_SHA256:",
    requestInputHash
  );

  console.log(
    "P3_SOURCE_VISIBLE:",
    false
  );

  console.log(
    "QC_VISIBLE:",
    false
  );

  console.log(
    "REFERENCE_VISIBLE:",
    false
  );

  console.log(
    "API_CALL_PERFORMED:",
    false
  );

  console.log(
    "PREFLIGHT_PASS: true"
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
    "Usage: node scripts/run-study002-p1.mjs --preflight OR 0001"
  );
}

if (
  !process.env.OPENAI_API_KEY
) {
  fail(
    "OPENAI_API_KEY is not set in this Terminal session."
  );
}

const observationId =
  "CD-002-P1-" +
  observationNumber;

fs.mkdirSync(
  rawDir,
  {
    recursive: true
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

const manifestFile =
  path.join(
    rawDir,
    observationId +
    "-measurement.json"
  );

for (const file of [
  rawResponseFile,
  outputJsonFile,
  outputTextFile,
  manifestFile
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
      method: "POST",

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

if (!response.ok) {
  fail(
    "OpenAI request failed with HTTP " +
    response.status +
    ". Raw response preserved."
  );
}

let apiResponse;

try {
  apiResponse =
    JSON.parse(rawText);
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

let outputObject = null;
let outputJsonValid = false;

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

if (outputJsonValid) {
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
  apiResponse.usage || {};

const inputDetails =
  usage.input_tokens_details ||
  {};

const outputDetails =
  usage.output_tokens_details ||
  {};

const inputTokens =
  Number(
    usage.input_tokens || 0
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
    usage.output_tokens || 0
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

const inputCost =
  uncachedTokens *
  Number(price.input) /
  1_000_000;

const cachedInputCost =
  cachedTokens *
  Number(price.cached_input) /
  1_000_000;

const cacheWriteCost =
  cacheWriteTokens *
  Number(price.cache_write) /
  1_000_000;

const outputCost =
  outputTokens *
  Number(price.output) /
  1_000_000;

const totalCost =
  inputCost +
  cachedInputCost +
  cacheWriteCost +
  outputCost;

const cacheState =
  cachedTokens === 0 &&
  cacheWriteTokens === 0
    ? "P1_EXPLICIT_NO_CACHE"
    : "UNEXPECTED_CACHE_ACTIVITY";

const measurementValidForP1 =
  cacheState ===
  "P1_EXPLICIT_NO_CACHE";

const manifest = {
  study_id:
    STUDY_ID,

  observation_id:
    observationId,

  path:
    PATH_ID,

  status:
    "P1_MEASUREMENT_CAPTURED_QUALITY_NOT_YET_EVALUATED",

  timestamp_utc:
    startedAt.toISOString(),

  provider:
    provider.provider,

  model:
    apiResponse.model ||
    provider.model,

  api_endpoint:
    apiUrl,

  request: {
    task_sha256:
      taskActualHash,

    public_authority_source_sha256:
      sourceActualHash,

    model_input_sha256:
      requestInputHash,

    model_input_bytes:
      Buffer.byteLength(
        requestInput,
        "utf8"
      ),

    p3_source_visible:
      false,

    quality_contract_visible:
      false,

    reference_projection_visible:
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
    input:
      money(inputCost),

    cached_input:
      money(cachedInputCost),

    cache_write:
      money(cacheWriteCost),

    output:
      money(outputCost),

    total_requester_model_cost:
      money(totalCost)
  },

  cache_state:
    cacheState,

  measurement_valid_for_p1:
    measurementValidForP1,

  latency_total_ms:
    Number(
      latencyMs.toFixed(3)
    ),

  quality: {
    contract_id:
      "CD002-QC-1.0",

    reference_id:
      "CD002-REFERENCE-1.0",

    status:
      "NOT_YET_EVALUATED",

    pass:
      null
  },

  x402_payment_performed:
    false
};

fs.writeFileSync(
  manifestFile,
  JSON.stringify(
    manifest,
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
  manifest.model
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
  "OUTPUT_TOKENS:",
  outputTokens
);

console.log(
  "TOTAL_MODEL_COST_USD:",
  manifest
    .cost_usd
    .total_requester_model_cost
);

console.log(
  "CACHE_STATE:",
  cacheState
);

console.log(
  "MEASUREMENT_VALID_FOR_P1:",
  measurementValidForP1
);

console.log(
  "OUTPUT_JSON_VALID:",
  outputJsonValid
);

console.log(
  "QUALITY_STATUS:",
  manifest.quality.status
);

console.log(
  "X402_PAYMENT_PERFORMED:",
  false
);

console.log(
  "MEASUREMENT_FILE:",
  path.relative(
    ROOT,
    manifestFile
  )
);
