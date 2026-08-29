import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const STUDY_ID = "CD-WORKLOAD-20260828-001";
const observationNumber = process.argv[2];

if (
  !observationNumber ||
  !/^\d{4}$/.test(observationNumber)
) {
  console.error(
    "Usage: node scripts/run-study001-p1.mjs 0002"
  );
  process.exit(1);
}

const OBSERVATION_ID =
  "CD-001-P1-" + observationNumber;

const PATH_ID = "P1";
const ROOT = process.cwd();

const observationsFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260828-001-observations.csv"
);

const referenceFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260828-001-reference.json"
);

const metadataFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260828-001-metadata.json"
);

const providerFile = path.join(
  ROOT,
  "data",
  "CD-WORKLOAD-20260828-001-provider.json"
);

const sourceFactsFile = path.join(
  ROOT,
  "prompts",
  "CD-WORKLOAD-20260828-001-source-facts.txt"
);

const taskPromptFile = path.join(
  ROOT,
  "prompts",
  "CD-WORKLOAD-20260828-001-task-prompt.txt"
);

const rawDir = path.join(ROOT, "data", "raw");

const rawResponseFile = path.join(
  rawDir,
  OBSERVATION_ID + "-response.json"
);

const outputFile = path.join(
  rawDir,
  OBSERVATION_ID + "-output.json"
);

function fail(message) {
  console.error("STUDY001_ERROR:", message);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function gitOutput(args) {
  return execFileSync("git", args, {
    encoding: "utf8"
  }).trim();
}

function latestCommitForFile(file) {
  return gitOutput([
    "log",
    "-n",
    "1",
    "--format=%H",
    "--",
    file
  ]);
}

function csvEscape(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const text = String(value);

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r")
  ) {
    return '"' + text.replaceAll('"', '""') + '"';
  }

  return text;
}

function boolValue(value) {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

function money(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "";
  }

  return value.toFixed(12);
}

if (!process.env.OPENAI_API_KEY) {
  fail("OPENAI_API_KEY is not set in this Terminal session.");
}

if (!fs.existsSync(observationsFile)) {
  fail("Observation CSV not found.");
}

const existingCsv =
  fs.readFileSync(observationsFile, "utf8");

if (
  existingCsv
    .split(/\r?\n/)
    .some(line =>
      line.includes("," + OBSERVATION_ID + ",")
    )
) {
  fail(
    OBSERVATION_ID +
    " already exists in observations.csv. Refusing duplicate."
  );
}

const reference = readJson(referenceFile);
const metadata = readJson(metadataFile);
const provider = readJson(providerFile);

if (
  metadata.measurement_state?.pilot_started !== true
) {
  fail("Pilot is not marked as started.");
}

if (
  metadata.measurement_state?.target_reference_frozen !== true
) {
  fail("Target reference is not frozen.");
}

if (
  metadata.measurement_state?.quality_contract_frozen !== true
) {
  fail("Quality contract is not frozen.");
}

if (
  metadata.measurement_state?.pricing_frozen !== true
) {
  fail("Pricing is not frozen.");
}

if (
  metadata.provider_configuration_frozen !== true
) {
  fail("Provider configuration is not frozen.");
}

if (
  reference.quality_contract?.contract_version !==
  "CD001-QC-1.1"
) {
  fail("Unexpected quality contract version.");
}

if (
  provider.model !== "gpt-5.6-luna"
) {
  fail("Unexpected provider model.");
}

const sourceFacts =
  fs.readFileSync(sourceFactsFile, "utf8").trim();

const taskPrompt =
  fs.readFileSync(taskPromptFile, "utf8").trim();

const requestInput =
  taskPrompt +
  "\n\nSOURCE FACTS BEGIN\n\n" +
  sourceFacts +
  "\n\nSOURCE FACTS END";

const requestBody = {
  model: provider.model,
  input: requestInput,
  reasoning: {
    effort: provider.reasoning_effort
  },
  text: {
    verbosity: provider.text_verbosity
  },
  max_output_tokens: 256,
  store: false,
  prompt_cache_options: {
    mode: "explicit"
  }
};

fs.mkdirSync(rawDir, {
  recursive: true
});

const apiUrl =
  "https://api.openai.com/v1/responses";

const startedAt = new Date();
const startPerf = performance.now();

const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    Authorization:
      "Bearer " + process.env.OPENAI_API_KEY,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(requestBody)
});

const latencyMs =
  performance.now() - startPerf;

const rawText =
  await response.text();

fs.writeFileSync(
  rawResponseFile,
  rawText,
  "utf8"
);

console.log(
  "HTTP_STATUS:",
  response.status
);

console.log(
  "RAW_RESPONSE_FILE:",
  path.relative(ROOT, rawResponseFile)
);

if (!response.ok) {
  fail(
    "OpenAI request failed. Raw response preserved; no observation row appended."
  );
}

let apiResponse;

try {
  apiResponse = JSON.parse(rawText);
} catch {
  fail(
    "OpenAI returned a non-JSON successful response."
  );
}

const outputText =
  (apiResponse.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("")
    .trim();

let outputObject = null;
let outputJsonValid = false;

try {
  outputObject = JSON.parse(outputText);

  outputJsonValid =
    outputObject !== null &&
    typeof outputObject === "object" &&
    !Array.isArray(outputObject);
} catch {
  outputJsonValid = false;
}

if (outputJsonValid) {
  fs.writeFileSync(
    outputFile,
    JSON.stringify(
      outputObject,
      null,
      2
    ) + "\n",
    "utf8"
  );
} else {
  fs.writeFileSync(
    outputFile.replace(
      ".json",
      ".txt"
    ),
    outputText + "\n",
    "utf8"
  );
}

const usage =
  apiResponse.usage || {};

const inputDetails =
  usage.input_tokens_details || {};

const outputDetails =
  usage.output_tokens_details || {};

const inputTokens =
  Number(usage.input_tokens || 0);

const cachedTokens =
  Number(
    inputDetails.cached_tokens || 0
  );

const cacheWriteTokens =
  Number(
    inputDetails.cache_write_tokens || 0
  );

const outputTokens =
  Number(usage.output_tokens || 0);

const reasoningTokens =
  Number(
    outputDetails.reasoning_tokens || 0
  );

const uncachedTokens =
  Math.max(
    0,
    inputTokens -
    cachedTokens -
    cacheWriteTokens
  );

const price =
  provider.pricing_usd_per_million_tokens;

const inputCost =
  uncachedTokens *
  Number(price.input) /
  1_000_000;

const cachedHitCost =
  cachedTokens *
  Number(price.cached_input) /
  1_000_000;

const cacheWriteCost =
  cacheWriteTokens *
  Number(price.cache_write) /
  1_000_000;

const cachedInputCost =
  cachedHitCost +
  cacheWriteCost;

const outputCost =
  outputTokens *
  Number(price.output) /
  1_000_000;

const totalModelCost =
  inputCost +
  cachedInputCost +
  outputCost;

const quality =
  reference.quality_contract;

const authoritative =
  reference.authoritative_payload;

const contextMatch =
  outputJsonValid &&
  outputObject["@context"] ===
    quality.context_expected;

const typeMatch =
  outputJsonValid &&
  outputObject["@type"] ===
    authoritative["@type"];

const nameMatch =
  outputJsonValid &&
  outputObject.name ===
    authoritative.name;

const descriptionMatch =
  outputJsonValid &&
  outputObject.description ===
    authoritative.description;

const requiredPresent =
  outputJsonValid &&
  quality.required_fields.every(
    key =>
      Object.prototype.hasOwnProperty.call(
        outputObject,
        key
      )
  );

const qualityPass =
  Boolean(
    outputJsonValid &&
    requiredPresent &&
    contextMatch &&
    typeMatch &&
    nameMatch &&
    descriptionMatch
  );

const qualityFailureReasons = [];

if (!outputJsonValid) {
  qualityFailureReasons.push(
    "invalid_json"
  );
}

if (
  outputJsonValid &&
  !requiredPresent
) {
  qualityFailureReasons.push(
    "missing_required_field"
  );
}

if (
  outputJsonValid &&
  !contextMatch
) {
  qualityFailureReasons.push(
    "context_mismatch"
  );
}

if (
  outputJsonValid &&
  !typeMatch
) {
  qualityFailureReasons.push(
    "type_mismatch"
  );
}

if (
  outputJsonValid &&
  !nameMatch
) {
  qualityFailureReasons.push(
    "name_mismatch"
  );
}

if (
  outputJsonValid &&
  !descriptionMatch
) {
  qualityFailureReasons.push(
    "description_mismatch"
  );
}

const calibrationCommit =
  gitOutput([
    "rev-parse",
    "HEAD"
  ]);

const workloadSpecCommit =
  latestCommitForFile(
    "WORKLOAD-CD-20260828-001.md"
  );

const benchmarkReferenceCommit =
  metadata.benchmark
    ?.mathematical_reference_commit ||
  "a8975fc32303ab6cfd8c4b88cf191dd627b0b87f";

const timestampUtc =
  startedAt.toISOString();

const cacheState =
  cachedTokens === 0 &&
  cacheWriteTokens === 0
    ? "P1_EXPLICIT_NO_CACHE"
    : "UNEXPECTED_CACHE_ACTIVITY";

const row = {
  study_id: STUDY_ID,
  observation_id: OBSERVATION_ID,
  pair_id: "",
  timestamp_utc: timestampUtc,
  path: PATH_ID,
  workload_id: STUDY_ID,
  target_slug:
    reference.target.slug,
  target_canonical_url:
    reference.target.canonical_url,
  endpoint_url: apiUrl,
  provider: "OpenAI",
  model:
    apiResponse.model ||
    provider.model,
  model_version:
    apiResponse.model ||
    provider.model,
  cache_state: cacheState,
  http_status:
    response.status,
  input_tokens:
    inputTokens,
  cached_input_tokens:
    cachedTokens,
  uncached_input_tokens:
    uncachedTokens,
  output_tokens:
    outputTokens,
  input_cost_usd:
    money(inputCost),
  cached_input_cost_usd:
    money(cachedInputCost),
  output_cost_usd:
    money(outputCost),
  reasoning_compute_cost_usd:
    money(0),
  fresh_model_cost_usd:
    money(totalModelCost),
  prompt_cache_cost_usd:
    "",
  governed_retrieval_payment_usd:
    "",
  governed_payment_asset:
    "",
  governed_payment_chain:
    "",
  governed_payment_tier:
    "",
  additional_retrieval_cost_usd:
    "",
  verification_cost_usd:
    "",
  provenance_policy_cost_usd:
    "",
  per_hit_state_service_cost_usd:
    "",
  miss_overhead_usd:
    "",
  residual_fresh_compute_cost_usd:
    "",
  total_observed_requester_cost_usd:
    money(totalModelCost),
  quality_gate_pass:
    boolValue(qualityPass),
  canonical_id_match:
    "",
  canonical_slug_match:
    "",
  canonical_url_match:
    "",
  schema_valid:
    boolValue(
      outputJsonValid &&
      requiredPresent
    ),
  provenance_valid:
    "",
  rights_policy_valid:
    "",
  quality_failure_reason:
    qualityFailureReasons.join("|"),
  accepted_governed_hit:
    "",
  fallback_required:
    "false",
  cre_control_usd:
    "",
  economic_substitution_fraction_s:
    "",
  latency_total_ms:
    latencyMs.toFixed(3),
  latency_retrieval_ms:
    "",
  latency_verification_ms:
    "",
  latency_model_ms:
    latencyMs.toFixed(3),
  latency_fallback_ms:
    "",
  cost_measurement_class:
    "MEASURED",
  pricing_source:
    "data/CD-WORKLOAD-20260828-001-provider.json",
  benchmark_reference_commit:
    benchmarkReferenceCommit,
  calibration_commit:
    calibrationCommit,
  workload_spec_commit:
    workloadSpecCommit,
  source_version:
    provider.model,
  notes:
    "P1 fresh recomputation; explicit cache mode with zero configured breakpoints; reasoning_tokens=" +
    reasoningTokens
};

const header =
  existingCsv
    .split(/\r?\n/)[0]
    .split(",");

const missingColumns =
  header.filter(
    column =>
      !Object.prototype.hasOwnProperty.call(
        row,
        column
      )
  );

if (missingColumns.length) {
  fail(
    "Runner does not populate CSV columns: " +
    missingColumns.join(",")
  );
}

const csvLine =
  header
    .map(
      column =>
        csvEscape(row[column])
    )
    .join(",");

fs.appendFileSync(
  observationsFile,
  csvLine + "\n",
  "utf8"
);

console.log(
  "OBSERVATION_ID:",
  OBSERVATION_ID
);

console.log(
  "MODEL:",
  row.model
);

console.log(
  "CACHE_STATE:",
  cacheState
);

console.log(
  "INPUT_TOKENS:",
  inputTokens
);

console.log(
  "CACHED_TOKENS:",
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
  "TOTAL_COST_USD:",
  totalModelCost.toFixed(12)
);

console.log(
  "QUALITY_PASS:",
  qualityPass
);

console.log(
  "LATENCY_MS:",
  latencyMs.toFixed(3)
);

console.log(
  "OBSERVATION_APPENDED: true"
);
