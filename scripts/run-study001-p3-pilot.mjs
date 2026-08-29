import fs from "fs";
import crypto from "crypto";
import { performance } from "perf_hooks";
import {
  createPublicClient,
  http,
  formatUnits
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  x402Client,
  wrapFetchWithPayment
} from "@x402/fetch";
import {
  registerExactEvmScheme
} from "@x402/evm/exact/client";

const STUDY_ID = "CD-WORKLOAD-20260828-001";
const ENDPOINT =
  "https://www.robbiegeorgephotography.com/v1/query/atomic/robbie-george-biography-plate";

const NETWORK = "eip155:8453";
const SCHEME = "exact";
const AMOUNT_ATOMIC = "5000";
const AMOUNT_USDC = "0.005";

const ASSET =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const PAY_TO =
  "0xb0d0207bCd46c6a7009cA5c8294177D79aDc0807";

const PAYER_ADDRESS =
  "0x590AB6f178335e80e5238e6082fb6c518b914B46";

const KEY_FILE =
  ".private/CD-WORKLOAD-20260828-001-payer.env";

const REFERENCE_FILE =
  "data/CD-WORKLOAD-20260828-001-reference.json";

const PAY_MODE = process.argv.includes("--pay");

const lower = value => String(value || "").toLowerCase();

const sha256 = value =>
  crypto.createHash("sha256").update(value).digest("hex");

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

function requirementMatches(r) {
  return (
    r?.scheme === SCHEME &&
    r?.network === NETWORK &&
    String(r?.amount) === AMOUNT_ATOMIC &&
    lower(r?.asset) === lower(ASSET) &&
    lower(r?.payTo) === lower(PAY_TO) &&
    r?.resource?.url === ENDPOINT
  );
}

function validateChallenge(paymentRequired) {
  if (paymentRequired?.x402Version !== 2) {
    throw new Error(
      "Unexpected x402 version: " +
      String(paymentRequired?.x402Version)
    );
  }

  if (paymentRequired?.resource?.url !== ENDPOINT) {
    throw new Error(
      "Unexpected top-level resource URL: " +
      String(paymentRequired?.resource?.url)
    );
  }

  if (!Array.isArray(paymentRequired?.accepts)) {
    throw new Error("Challenge contains no accepts array");
  }

  const matches =
    paymentRequired.accepts.filter(requirementMatches);

  if (matches.length !== 1) {
    throw new Error(
      "Expected exactly one frozen Study 001 payment requirement; found " +
      matches.length
    );
  }

  return matches[0];
}

function parsePaymentRequired(response, bodyText) {
  const header =
    response.headers.get("payment-required");

  if (header) {
    return JSON.parse(
      Buffer.from(header, "base64").toString("utf8")
    );
  }

  return JSON.parse(bodyText);
}

const reference =
  JSON.parse(fs.readFileSync(REFERENCE_FILE, "utf8"));

if (reference?.status !== "REFERENCE_FROZEN") {
  throw new Error("Study reference is not frozen");
}

if (
  reference?.quality_contract?.contract_version !==
  "CD001-QC-1.1"
) {
  throw new Error(
    "Unexpected quality contract version"
  );
}

console.log("STUDY_ID:", STUDY_ID);
console.log("MODE:", PAY_MODE ? "PAY" : "DRY_RUN");
console.log("ENDPOINT:", ENDPOINT);

const preflightStart = performance.now();

const preflightResponse =
  await fetch(ENDPOINT, { redirect: "manual" });

const preflightBody =
  await preflightResponse.text();

const preflightMs =
  performance.now() - preflightStart;

if (preflightResponse.status !== 402) {
  throw new Error(
    "Expected preflight HTTP 402, got " +
    preflightResponse.status
  );
}

const paymentRequired =
  parsePaymentRequired(
    preflightResponse,
    preflightBody
  );

const selected =
  validateChallenge(paymentRequired);

console.log(
  "PREFLIGHT_HTTP_STATUS:",
  preflightResponse.status
);

console.log(
  "PREFLIGHT_X402_VERSION:",
  paymentRequired.x402Version
);

console.log(
  "PREFLIGHT_SCHEME:",
  selected.scheme
);

console.log(
  "PREFLIGHT_NETWORK:",
  selected.network
);

console.log(
  "PREFLIGHT_AMOUNT_ATOMIC:",
  selected.amount
);

console.log(
  "PREFLIGHT_AMOUNT_USDC:",
  AMOUNT_USDC
);

console.log(
  "PREFLIGHT_ASSET:",
  selected.asset
);

console.log(
  "PREFLIGHT_PAY_TO:",
  selected.payTo
);

console.log(
  "PREFLIGHT_CONTRACT_MATCH:",
  true
);

console.log(
  "PREFLIGHT_LATENCY_MS:",
  preflightMs.toFixed(3)
);

if (!PAY_MODE) {
  console.log(
    "PRIVATE_KEY_LOADED:",
    false
  );

  console.log(
    "PAYMENT_SIGNED:",
    false
  );

  console.log(
    "PAYMENT_SENT:",
    false
  );

  console.log(
    "DRY_RUN_READY:",
    true
  );

  process.exit(0);
}

if (!fs.existsSync(KEY_FILE)) {
  throw new Error(
    "Study payer key file is missing"
  );
}

const keyText =
  fs.readFileSync(KEY_FILE, "utf8").trim();

const match =
  keyText.match(
    /^EVM_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/
  );

if (!match) {
  throw new Error(
    "Invalid private-key file format"
  );
}

const account =
  privateKeyToAccount(match[1]);

if (
  lower(account.address) !==
  lower(PAYER_ADDRESS)
) {
  throw new Error(
    "Private key does not match frozen Study 001 payer address"
  );
}

const publicClient =
  createPublicClient({
    chain: base,
    transport: http(
      "https://mainnet.base.org"
    )
  });

const balanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      {
        name: "account",
        type: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256"
      }
    ]
  }
];

async function getUsdcBalance() {
  return await publicClient.readContract({
    address: ASSET,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [PAYER_ADDRESS]
  });
}

const balanceBefore =
  await getUsdcBalance();

if (
  balanceBefore < BigInt(AMOUNT_ATOMIC)
) {
  throw new Error(
    "Insufficient Study 001 payer USDC balance"
  );
}

const client =
  new x402Client(
    (version, accepts) => {
      if (version !== 2) {
        throw new Error(
          "Selector rejected x402 version"
        );
      }

      if (accepts.length !== 1) {
        throw new Error(
          "Selector requires exactly one payment requirement"
        );
      }

      return accepts[0];
    }
  );

registerExactEvmScheme(
  client,
  {
    signer: account,
    networks: [NETWORK]
  }
);

client.setSpendControls({
  allowedAssets: [
    {
      network: NETWORK,
      asset: ASSET,
      maxAmountPerPayment:
        AMOUNT_ATOMIC
    }
  ],
  maxAmountPerPayment: false
});

client.registerPolicy(
  (version, requirements) => {
    if (version !== 2) {
      return [];
    }

    return requirements.filter(
      requirementMatches
    );
  }
);

client.onBeforePaymentCreation(
  context => {
    try {
      validateChallenge(
        context.paymentRequired
      );

      if (
        !requirementMatches(
          context.selectedRequirements
        )
      ) {
        return {
          abort: true,
          reason:
            "Selected requirement differs from frozen Study 001 contract"
        };
      }

      return undefined;
    } catch (error) {
      return {
        abort: true,
        reason:
          error instanceof Error
            ? error.message
            : String(error)
      };
    }
  }
);

const paidFetch =
  wrapFetchWithPayment(
    fetch,
    client
  );

const start =
  performance.now();

let response = null;
let responseBody = "";
let runError = null;

try {
  response =
    await paidFetch(
      ENDPOINT,
      {
        method: "GET",
        redirect: "manual"
      }
    );

  responseBody =
    await response.text();
} catch (error) {
  runError =
    error instanceof Error
      ? error.message
      : String(error);
}

const latencyMs =
  performance.now() - start;

let balanceAfter =
  await getUsdcBalance();

for (
  let i = 0;
  i < 10 &&
  balanceAfter === balanceBefore;
  i++
) {
  await sleep(1000);
  balanceAfter =
    await getUsdcBalance();
}

const observedSpend =
  balanceBefore - balanceAfter;

let parsedOutput = null;
let jsonValid = false;

if (responseBody) {
  try {
    parsedOutput =
      JSON.parse(responseBody);
    jsonValid = true;
  } catch {}
}

const qc =
  reference.quality_contract;

const authoritative =
  reference.authoritative_payload;

const requiredFields =
  qc.required_fields || [];

const exactFields =
  qc.exact_match_fields || [];

const requiredFieldsPass =
  jsonValid &&
  requiredFields.every(
    field =>
      Object.prototype.hasOwnProperty.call(
        parsedOutput,
        field
      )
  );

const contextPass =
  jsonValid &&
  parsedOutput?.["@context"] ===
    qc.context_expected;

const exactFieldResults = {};

for (
  const field of exactFields
) {
  exactFieldResults[field] =
    jsonValid &&
    parsedOutput?.[field] ===
      authoritative?.[field];
}

const exactFieldsPass =
  Object.values(
    exactFieldResults
  ).every(Boolean);

const qualityPass =
  requiredFieldsPass &&
  contextPass &&
  exactFieldsPass;

fs.mkdirSync(
  "data/raw",
  { recursive: true }
);

const rawFile =
  "data/raw/CD-WORKLOAD-20260828-001-P3-pilot-response.json";

if (responseBody) {
  fs.writeFileSync(
    rawFile,
    responseBody.endsWith("\n")
      ? responseBody
      : responseBody + "\n"
  );
}

const paymentResponseHeader =
  response?.headers.get(
    "payment-response"
  ) ||
  response?.headers.get(
    "x-payment-response"
  ) ||
  null;

const summary = {
  study_id: STUDY_ID,
  path: "P3",
  run_class:
    "PAID_PILOT_NOT_YET_OFFICIAL_OBSERVATION",
  capture_timestamp_utc:
    new Date().toISOString(),
  endpoint: ENDPOINT,
  payer_address:
    PAYER_ADDRESS,
  expected_payment: {
    x402_version: 2,
    scheme: SCHEME,
    network: NETWORK,
    amount_atomic:
      AMOUNT_ATOMIC,
    amount_usdc:
      AMOUNT_USDC,
    asset: ASSET,
    pay_to: PAY_TO
  },
  payment_safety: {
    native_per_asset_cap_atomic:
      AMOUNT_ATOMIC,
    policy_exact_match_required:
      true,
    before_payment_hook_enabled:
      true
  },
  http_status:
    response?.status ?? null,
  latency_ms:
    Number(
      latencyMs.toFixed(3)
    ),
  balance_before_atomic:
    balanceBefore.toString(),
  balance_after_atomic:
    balanceAfter.toString(),
  observed_spend_atomic:
    observedSpend.toString(),
  observed_spend_usdc:
    formatUnits(
      observedSpend,
      6
    ),
  expected_spend_match:
    observedSpend ===
      BigInt(AMOUNT_ATOMIC),
  payment_response_header_present:
    Boolean(
      paymentResponseHeader
    ),
  json_valid:
    jsonValid,
  quality_contract_version:
    qc.contract_version,
  quality: {
    required_fields_pass:
      requiredFieldsPass,
    context_pass:
      contextPass,
    exact_field_results:
      exactFieldResults,
    exact_fields_pass:
      exactFieldsPass,
    overall_pass:
      qualityPass
  },
  raw_response_file:
    responseBody
      ? rawFile
      : null,
  raw_response_sha256:
    responseBody
      ? sha256(
          fs.readFileSync(
            rawFile
          )
        )
      : null,
  error:
    runError
};

const summaryFile =
  "data/CD-WORKLOAD-20260828-001-P3-pilot-summary.json";

fs.writeFileSync(
  summaryFile,
  JSON.stringify(
    summary,
    null,
    2
  ) + "\n"
);

console.log(
  "PAYER_ADDRESS:",
  PAYER_ADDRESS
);

console.log(
  "HTTP_STATUS:",
  summary.http_status
);

console.log(
  "BALANCE_BEFORE_USDC:",
  formatUnits(
    balanceBefore,
    6
  )
);

console.log(
  "BALANCE_AFTER_USDC:",
  formatUnits(
    balanceAfter,
    6
  )
);

console.log(
  "OBSERVED_SPEND_USDC:",
  summary.observed_spend_usdc
);

console.log(
  "EXPECTED_SPEND_MATCH:",
  summary.expected_spend_match
);

console.log(
  "JSON_VALID:",
  summary.json_valid
);

console.log(
  "QUALITY_PASS:",
  summary.quality.overall_pass
);

console.log(
  "LATENCY_MS:",
  summary.latency_ms
);

console.log(
  "RUN_ERROR:",
  summary.error ?? "none"
);
