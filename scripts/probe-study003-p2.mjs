import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STUDY_ID =
  "CD-WORKLOAD-20260829-003";

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

const metadataFile =
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

const resultFile =
  path.join(
    ROOT,
    "data",
    "CD-WORKLOAD-20260829-003-P2-eligibility.json"
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

for (const file of [
  taskFile,
  sourceFile,
  metadataFile,
  providerFile,
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
    metadataFile
  );

const provider =
  readJson(
    providerFile
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
  provider.model !==
  "gpt-5.6-luna"
) {
  fail(
    "Unexpected provider model."
  );
}

if (
  p1Measurement
    .measurement_valid_for_p1 !==
  true
) {
  fail(
    "Frozen P1 measurement is not valid."
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
    "Frozen P1 visibility boundary mismatch."
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
    "Authority-source hash mismatch."
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

const inputHash =
  sha256Buffer(
    Buffer.from(
      requestInput,
      "utf8"
    )
  );

const expectedInputHash =
  p1Measurement
    .request
    .model_input_sha256;

if (
  inputHash !==
  expectedInputHash
) {
  fail(
    "P2 probe model-visible input differs from frozen P1 input."
  );
}

const cacheKey =
  "cd003-biography-plate-v1";

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
      "implicit",

    ttl:
      "30m"
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
    "STUDY 003 P2 CACHE PROBE PREFLIGHT"
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
    "PROBE_MODE:",
    "implicit"
  );

  console.log(
    "PROMPT_CACHE_KEY:",
    cacheKey
  );

  console.log(
    "PROMPT_CACHE_TTL:",
    "30m"
  );

  console.log(
    "REQUEST_COUNT_IF_RUN:",
    2
  );

  console.log(
    "MODEL_INPUT_SHA256:",
    inputHash
  );

  console.log(
    "MATCHES_FROZEN_P1_INPUT:",
    inputHash ===
    expectedInputHash
  );

  console.log(
    "P1_QUALITY_GATE_PASS:",
    p1Evaluation
      .primary_quality_gate_pass
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

if (
  mode !==
  "--run"
) {
  fail(
    "Usage: node scripts/probe-study003-p2.mjs --preflight OR --run"
  );
}

if (
  !process.env.OPENAI_API_KEY
) {
  fail(
    "OPENAI_API_KEY is not set."
  );
}

if (
  fs.existsSync(
    resultFile
  )
) {
  fail(
    "P2 eligibility result already exists. Refusing overwrite."
  );
}

const apiUrl =
  "https://api.openai.com/v1/responses";

async function performRequest(
  requestNumber
) {
  const started =
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
    started;

  const rawText =
    await response.text();

  if (
    !response.ok
  ) {
    fail(
      "Probe request " +
      requestNumber +
      " failed with HTTP " +
      response.status +
      ": " +
      rawText
    );
  }

  let data;

  try {
    data =
      JSON.parse(
        rawText
      );
  } catch {
    fail(
      "Probe request returned non-JSON response."
    );
  }

  const usage =
    data.usage ||
    {};

  const details =
    usage.input_tokens_details ||
    {};

  return {
    request_number:
      requestNumber,

    http_status:
      response.status,

    input_tokens:
      Number(
        usage.input_tokens ||
        0
      ),

    cached_tokens:
      Number(
        details.cached_tokens ||
        0
      ),

    cache_write_tokens:
      Number(
        details.cache_write_tokens ||
        0
      ),

    output_tokens:
      Number(
        usage.output_tokens ||
        0
      ),

    latency_ms:
      Number(
        latencyMs.toFixed(
          3
        )
      )
  };
}

console.log(
  "P2_PROBE_REQUEST_1_START: true"
);

const first =
  await performRequest(
    1
  );

console.log(
  "REQUEST_1_INPUT_TOKENS:",
  first.input_tokens
);

console.log(
  "REQUEST_1_CACHED_TOKENS:",
  first.cached_tokens
);

console.log(
  "REQUEST_1_CACHE_WRITE_TOKENS:",
  first.cache_write_tokens
);

console.log(
  "P2_PROBE_REQUEST_2_START: true"
);

const second =
  await performRequest(
    2
  );

console.log(
  "REQUEST_2_INPUT_TOKENS:",
  second.input_tokens
);

console.log(
  "REQUEST_2_CACHED_TOKENS:",
  second.cached_tokens
);

console.log(
  "REQUEST_2_CACHE_WRITE_TOKENS:",
  second.cache_write_tokens
);

const cacheWriteObserved =
  first.cache_write_tokens > 0 ||
  second.cache_write_tokens > 0;

const cacheReadObserved =
  first.cached_tokens > 0 ||
  second.cached_tokens > 0;

const cacheActivated =
  cacheWriteObserved ||
  cacheReadObserved;

const result = {
  study_id:
    STUDY_ID,

  path:
    "P2",

  status:
    cacheActivated
      ? "P2_PROMPT_CACHE_ACTIVE_FOR_EXACT_WORKLOAD"
      : "P2_PROMPT_CACHE_NOT_ACTIVE_FOR_EXACT_WORKLOAD",

  probe_class:
    "UNRECORDED_ELIGIBILITY_PROBE",

  provider:
    provider.provider,

  model:
    provider.model,

  cache_configuration: {
    mode:
      "implicit",

    ttl:
      "30m",

    prompt_cache_key:
      cacheKey
  },

  exact_p1_model_input_sha256:
    expectedInputHash,

  probe_model_input_sha256:
    inputHash,

  exact_input_match:
    inputHash ===
    expectedInputHash,

  request_count:
    2,

  requests: [
    first,
    second
  ],

  cache_write_observed:
    cacheWriteObserved,

  cache_read_observed:
    cacheReadObserved,

  cache_activated:
    cacheActivated,

  benchmark_treatment: {
    C2_status:
      cacheActivated
        ? "MEASURABLE_AFTER_ELIGIBILITY"
        : "UNAVAILABLE_UNDER_IMPLICIT_MODE",

    do_not_set_synthetic_C2:
      true,

    note:
      cacheActivated
        ? "Prompt caching activated for the exact frozen Study 003 model-visible input. A separate measured P2 cost observation may now be designed."
        : "Implicit prompt caching did not activate for the exact frozen Study 003 model-visible input. No synthetic cache benefit is permitted."
  },

  api_requests_performed:
    2,

  x402_payment_performed:
    false
};

fs.writeFileSync(
  resultFile,
  JSON.stringify(
    result,
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(
  "CACHE_WRITE_OBSERVED:",
  cacheWriteObserved
);

console.log(
  "CACHE_READ_OBSERVED:",
  cacheReadObserved
);

console.log(
  "CACHE_ACTIVATED:",
  cacheActivated
);

console.log(
  "STATUS:",
  result.status
);

console.log(
  "RESULT_FILE:",
  path.relative(
    ROOT,
    resultFile
  )
);

console.log(
  "X402_PAYMENT_PERFORMED:",
  false
);
