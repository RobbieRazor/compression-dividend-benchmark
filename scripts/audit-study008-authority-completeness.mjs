import { createHash } from 'node:crypto';

import { execFileSync } from 'node:child_process';

import {
  existsSync,
  readFileSync,
  writeFileSync
} from 'node:fs';

import { fileURLToPath } from 'node:url';

import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const planPath = path.join(
  root,
  'data/CD-WORKLOAD-20260831-008-authority-completeness-audit-plan.json'
);

const schemaPath = path.join(
  root,
  'data/CD-WORKLOAD-20260831-008-prospective-graph-schema.json'
);

const runnerPath = fileURLToPath(import.meta.url);

const planBytes = readFileSync(planPath);

const schemaBytes = readFileSync(schemaPath);

const plan = JSON.parse(planBytes.toString('utf8'));

const schema = JSON.parse(schemaBytes.toString('utf8'));

const expectedPlanSha256 =
  'd6c9c3a6a5490b291988b3c1d42881c40b418d9aa54a668cfe2b39f9739f3f96';

const expectedSchemaSha256 =
  '96c3210bda3420cb392d279bc9045eba2ea1a83d6df4ee26d6df4a4a4abaa150';

const outputPath = path.join(root, plan.audit_output.path);

const mode = process.argv[2] || '--preflight';

const sourceBytesCache = new Map();

const sourceJsonCache = new Map();

const sourceJsonLdCache = new Map();

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

function readJsonFile(relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function assertPinnedFile(relativePath, expectedHash, label) {
  const bytes = readFileSync(path.join(root, relativePath));

  if (sha256(bytes) !== expectedHash) {
    throw new Error(label + ' hash mismatch.');
  }
}

function decodePointerToken(token) {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveJsonPointer(value, pointer) {
  if (pointer === '') {
    return { found: true, value };
  }

  if (typeof pointer !== 'string' || !pointer.startsWith('/')) {
    return { found: false };
  }

  const tokens = pointer.slice(1).split('/').map(decodePointerToken);

  let current = value;

  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) {
        return { found: false };
      }

      const index = Number(token);

      if (index >= current.length) {
        return { found: false };
      }

      current = current[index];
      continue;
    }

    if (
      !current ||
      typeof current !== 'object' ||
      !Object.prototype.hasOwnProperty.call(current, token)
    ) {
      return { found: false };
    }

    current = current[token];
  }

  return { found: true, value: current };
}

function jsonValueDigest(value) {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new Error('Unsupported undefined value for digest.');
  }

  return sha256(Buffer.from(serialized, 'utf8'));
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function parseJsonLdNodes(html, sourceId) {
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const nodes = [];

  let blockIndex = 0;

  let match;

  while ((match = pattern.exec(html)) !== null) {
    blockIndex += 1;

    let parsed;

    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      throw new Error(sourceId + ' contains an invalid JSON-LD block.');
    }

    const blockNodes =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

    blockNodes.forEach((node, index) => {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        nodes.push({
          node,
          locator:
            'html_jsonld:block=' +
            blockIndex +
            '/node=' +
            (index + 1)
        });
      }
    });
  }

  if (blockIndex === 0) {
    throw new Error(sourceId + ' contains no JSON-LD blocks.');
  }

  return nodes;
}

function exactPredicateMatch(node, predicates) {
  return Object.entries(predicates).every(
    ([key, expected]) =>
      Object.prototype.hasOwnProperty.call(node, key) &&
      JSON.stringify(node[key]) === JSON.stringify(expected)
  );
}

function validateFrozenInputs() {
  if (sha256(planBytes) !== expectedPlanSha256) {
    throw new Error('Audit plan hash mismatch.');
  }

  if (sha256(schemaBytes) !== expectedSchemaSha256) {
    throw new Error('Prospective graph schema hash mismatch.');
  }

  if (plan.study_id !== 'CD-WORKLOAD-20260831-008') {
    throw new Error('Unexpected Study ID.');
  }

  if (
    plan.status !==
    'AUDIT_PROTOCOL_FROZEN_BEFORE_COMPLETENESS_EXECUTION_OR_TARGET_CONSTRUCTION'
  ) {
    throw new Error('Audit plan is not frozen.');
  }

  if (
    schema.status !==
    'SCHEMA_AND_SELECTORS_FROZEN_BEFORE_COMPLETENESS_AUDIT_OR_TARGET_CONSTRUCTION'
  ) {
    throw new Error('Prospective graph schema is not frozen.');
  }

  assertPinnedFile(
    plan.frozen_inputs.capture_freeze.path,
    plan.frozen_inputs.capture_freeze.sha256,
    'Capture freeze'
  );

  assertPinnedFile(
    plan.frozen_inputs.capture_manifest.path,
    plan.frozen_inputs.capture_manifest.sha256,
    'Capture manifest'
  );

  assertPinnedFile(
    plan.frozen_inputs.prospective_graph_schema.path,
    plan.frozen_inputs.prospective_graph_schema.sha256,
    'Prospective graph schema'
  );

  const captureFreeze = readJsonFile(
    plan.frozen_inputs.capture_freeze.path
  );

  const captureManifest = readJsonFile(
    plan.frozen_inputs.capture_manifest.path
  );

  if (captureFreeze.capture_manifest.sha256 !== sha256(
    readFileSync(path.join(root, captureFreeze.capture_manifest.path))
  )) {
    throw new Error('Capture freeze no longer pins the manifest.');
  }

  if (captureManifest.source_count !== 14) {
    throw new Error('Capture manifest source count changed.');
  }

  const recordsById = new Map(
    captureManifest.records.map((record) => [record.source_id, record])
  );

  if (recordsById.size !== 14) {
    throw new Error('Capture manifest source IDs are not unique.');
  }

  for (const record of captureManifest.records) {
    const bytes = readFileSync(
      path.join(
        root,
        'data/raw/CD-008-authority-capture',
        record.filename
      )
    );

    if (bytes.length !== record.byte_count) {
      throw new Error(record.source_id + ' byte count mismatch.');
    }

    if (sha256(bytes) !== record.sha256) {
      throw new Error(record.source_id + ' response hash mismatch.');
    }
  }

  const subjectLeafCount = Object.keys(
    schema.subject.required_fields
  ).length;

  const relationshipLeafCount = schema.relationships.reduce(
    (sum, relationship) =>
      sum + Object.keys(relationship.required_fields).length,
    0
  );

  const rightsLeafCount = Object.keys(
    schema.rights_boundary.required_fields
  ).length;

  const subjectCheckCount =
    schema.subject.cross_source_checks.length;

  const relationshipCheckCount = schema.relationships.reduce(
    (sum, relationship) =>
      sum + relationship.required_binding_checks.length,
    0
  );

  const htmlSelectorCount =
    1 +
    schema.relationships.filter(
      (relationship) =>
        relationship.target_selector.kind === 'html_jsonld_node'
    ).length;

  const jsonRootSelectorCount = schema.relationships.filter(
    (relationship) =>
      relationship.target_selector.kind === 'json_root'
  ).length;

  if (subjectLeafCount !== plan.audit_scope.subject_leaf_count) {
    throw new Error('Subject leaf count mismatch.');
  }

  if (
    relationshipLeafCount !==
    plan.audit_scope.relationship_leaf_count
  ) {
    throw new Error('Relationship leaf count mismatch.');
  }

  if (rightsLeafCount !== plan.audit_scope.rights_leaf_count) {
    throw new Error('Rights leaf count mismatch.');
  }

  if (
    subjectLeafCount +
      relationshipLeafCount +
      rightsLeafCount !==
    plan.audit_scope.total_governed_leaf_count
  ) {
    throw new Error('Total governed leaf count mismatch.');
  }

  if (
    subjectCheckCount !==
    plan.audit_scope.subject_cross_source_check_count
  ) {
    throw new Error('Subject cross-source check count mismatch.');
  }

  if (
    relationshipCheckCount !==
    plan.audit_scope.relationship_binding_check_count
  ) {
    throw new Error('Relationship binding check count mismatch.');
  }

  if (
    subjectCheckCount + relationshipCheckCount !==
    plan.audit_scope.total_cross_source_check_count
  ) {
    throw new Error('Total cross-source check count mismatch.');
  }

  if (
    htmlSelectorCount !==
    plan.audit_scope.html_jsonld_selector_count
  ) {
    throw new Error('HTML selector count mismatch.');
  }

  if (
    jsonRootSelectorCount !==
    plan.audit_scope.json_root_selector_count
  ) {
    throw new Error('JSON root selector count mismatch.');
  }

  if (
    schema.relationships.length !==
    plan.audit_scope.relationship_count
  ) {
    throw new Error('Relationship count mismatch.');
  }

  return {
    captureFreeze,
    captureManifest,
    recordsById
  };
}

function printPreflight() {
  const frozen = validateFrozenInputs();

  console.log('========================================');
  console.log('STUDY 008 AUTHORITY COMPLETENESS PREFLIGHT');
  console.log('========================================');
  console.log('STUDY_ID: ' + plan.study_id);
  console.log('AUDIT_PLAN_ID: ' + plan.audit_plan_id);
  console.log('AUDIT_PLAN_SHA256: ' + sha256(planBytes));
  console.log('GRAPH_SCHEMA_SHA256: ' + sha256(schemaBytes));
  console.log('AUDIT_RUNNER_SHA256: ' + sha256(readFileSync(runnerPath)));
  console.log(
    'CAPTURE_MANIFEST_SHA256: ' +
    sha256(
      readFileSync(
        path.join(root, plan.frozen_inputs.capture_manifest.path)
      )
    )
  );
  console.log(
    'CAPTURE_SOURCE_COUNT: ' +
    frozen.captureManifest.source_count
  );
  console.log(
    'GOVERNED_LEAF_COUNT: ' +
    plan.audit_scope.total_governed_leaf_count
  );
  console.log(
    'SELECTOR_COUNT: ' +
    (
      plan.audit_scope.html_jsonld_selector_count +
      plan.audit_scope.json_root_selector_count
    )
  );
  console.log(
    'CROSS_SOURCE_CHECK_COUNT: ' +
    plan.audit_scope.total_cross_source_check_count
  );
  console.log('HISTORICAL_TARGET_LOADED: false');
  console.log('RAW_TARGET_VALUES_EMITTED: false');
  console.log('NETWORK_CALL_PERFORMED: false');
  console.log('MODEL_API_CALL_PERFORMED: false');
  console.log('X402_PAYMENT_PERFORMED: false');
  console.log('FILESYSTEM_WRITE_PERFORMED: false');
  console.log('OUTPUT_EXISTS: ' + existsSync(outputPath));
  console.log('GIT_HEAD: ' + readGitHead());
  console.log(
    'GIT_WORKTREE_CLEAN: ' + (readGitStatus().length === 0)
  );
  console.log('AUDIT_AUTHORIZED_NOW: false');
  console.log('PREFLIGHT_PASS: true');
}

function runAudit() {
  const frozen = validateFrozenInputs();

  const captureManifest = frozen.captureManifest;

  const recordsById = frozen.recordsById;

  const issues = {
    availability: [],
    ambiguity: [],
    binding: []
  };

  const provenanceSupport = [];

  const bindingSupport = [];

  const corroborationSupport = [];

  let selectorPassCount = 0;

  let governedLeafPassCount = 0;

  let crossSourceCheckPassCount = 0;

  function addIssue(category, code, location) {
    issues[category].push({
      code,
      location
    });
  }

  function sourceRecord(sourceId) {
    const record = recordsById.get(sourceId);

    if (!record) {
      addIssue(
        'availability',
        'SOURCE_NOT_IN_CAPTURE',
        sourceId
      );
      return null;
    }

    return record;
  }

  function sourceBytes(sourceId) {
    if (sourceBytesCache.has(sourceId)) {
      return sourceBytesCache.get(sourceId);
    }

    const record = sourceRecord(sourceId);

    if (!record) return null;

    const bytes = readFileSync(
      path.join(
        root,
        'data/raw/CD-008-authority-capture',
        record.filename
      )
    );

    sourceBytesCache.set(sourceId, bytes);

    return bytes;
  }

  function sourceJson(sourceId) {
    if (sourceJsonCache.has(sourceId)) {
      return sourceJsonCache.get(sourceId);
    }

    const bytes = sourceBytes(sourceId);

    if (!bytes) return null;

    try {
      const value = JSON.parse(bytes.toString('utf8'));
      sourceJsonCache.set(sourceId, value);
      return value;
    } catch {
      addIssue(
        'availability',
        'SOURCE_JSON_PARSE_FAILED',
        sourceId
      );
      return null;
    }
  }

  function sourceJsonLd(sourceId) {
    if (sourceJsonLdCache.has(sourceId)) {
      return sourceJsonLdCache.get(sourceId);
    }

    const bytes = sourceBytes(sourceId);

    if (!bytes) return null;

    try {
      const nodes = parseJsonLdNodes(
        bytes.toString('utf8'),
        sourceId
      );
      sourceJsonLdCache.set(sourceId, nodes);
      return nodes;
    } catch {
      addIssue(
        'availability',
        'SOURCE_JSONLD_PARSE_FAILED',
        sourceId
      );
      return null;
    }
  }

  function selectHtmlNode(selector, location) {
    const nodes = sourceJsonLd(selector.source_id);

    if (!nodes) return null;

    const matches = nodes.filter((entry) =>
      exactPredicateMatch(entry.node, selector.predicates)
    );

    if (matches.length !== selector.required_match_count) {
      addIssue(
        'ambiguity',
        matches.length === 0
          ? 'HTML_SELECTOR_ZERO_MATCHES'
          : 'HTML_SELECTOR_MULTIPLE_MATCHES',
        location
      );
      return null;
    }

    selectorPassCount += 1;

    return matches[0];
  }

  function selectTarget(selector, location) {
    if (selector.kind === 'html_jsonld_node') {
      return selectHtmlNode(selector, location);
    }

    if (selector.kind === 'json_root') {
      const value = sourceJson(selector.source_id);

      if (!value) return null;

      selectorPassCount += 1;

      return {
        node: value,
        locator: 'json_root'
      };
    }

    addIssue(
      'availability',
      'UNSUPPORTED_SELECTOR_KIND',
      location
    );

    return null;
  }

  function validateRequiredValue(
    value,
    expectedType,
    minimumItems,
    location
  ) {
    if (value === null || value === undefined) {
      addIssue(
        'availability',
        'REQUIRED_VALUE_NULL_OR_MISSING',
        location
      );
      return false;
    }

    if (expectedType === 'string') {
      if (typeof value !== 'string' || value.length === 0) {
        addIssue(
          'availability',
          'REQUIRED_STRING_INVALID',
          location
        );
        return false;
      }
      return true;
    }

    if (expectedType === 'boolean') {
      if (typeof value !== 'boolean') {
        addIssue(
          'availability',
          'REQUIRED_BOOLEAN_INVALID',
          location
        );
        return false;
      }
      return true;
    }

    if (expectedType === 'array_of_strings') {
      if (
        !Array.isArray(value) ||
        value.length < (minimumItems || 0) ||
        !value.every(
          (item) =>
            typeof item === 'string' && item.length > 0
        )
      ) {
        addIssue(
          'availability',
          'REQUIRED_STRING_ARRAY_INVALID',
          location
        );
        return false;
      }
      return true;
    }

    addIssue(
      'availability',
      'UNSUPPORTED_EXPECTED_TYPE',
      location
    );

    return false;
  }

  function recordLeafSupport(
    leafId,
    sourceId,
    locator,
    value
  ) {
    const record = sourceRecord(sourceId);

    if (!record) return;

    provenanceSupport.push({
      leaf_id: leafId,
      source_id: sourceId,
      source_sha256: record.sha256,
      locator,
      value_type: valueType(value),
      value_sha256: jsonValueDigest(value)
    });

    governedLeafPassCount += 1;
  }

  function pointerValue(
    sourceId,
    pointer,
    location,
    expectedType,
    minimumItems
  ) {
    const source = sourceJson(sourceId);

    if (!source) return undefined;

    const result = resolveJsonPointer(source, pointer);

    if (!result.found) {
      addIssue(
        'availability',
        'JSON_POINTER_NOT_FOUND',
        location
      );
      return undefined;
    }

    if (
      expectedType &&
      !validateRequiredValue(
        result.value,
        expectedType,
        minimumItems,
        location
      )
    ) {
      return undefined;
    }

    return result.value;
  }

  function scalarTargetValue(
    target,
    fieldPath,
    location
  ) {
    if (!target) return undefined;

    const value = target.node[fieldPath];

    if (
      !validateRequiredValue(
        value,
        'string',
        undefined,
        location
      )
    ) {
      return undefined;
    }

    return value;
  }

  function compareValues(
    comparison,
    left,
    right,
    location
  ) {
    if (left === undefined || right === undefined) {
      addIssue(
        'binding',
        'BINDING_INPUT_UNAVAILABLE',
        location
      );
      return false;
    }

    let passed = false;

    if (comparison === 'exact') {
      passed = left === right;
    } else if (comparison === 'url_path_equals') {
      try {
        passed =
          new URL(left).pathname === right;
      } catch {
        passed = false;
      }
    }

    if (!passed) {
      addIssue(
        'binding',
        'CROSS_SOURCE_BINDING_FAILED',
        location
      );
      return false;
    }

    crossSourceCheckPassCount += 1;

    return true;
  }

  const subjectSelector = schema.subject.identity_selector;

  const subjectTarget = selectHtmlNode(
    subjectSelector,
    'subject.identity_selector'
  );

  const subjectValues = new Map();

  for (const [fieldName, fieldRule] of Object.entries(
    schema.subject.required_fields
  )) {
    const leafId = 'subject.' + fieldName;

    let value;

    let locator;

    if (fieldRule.selector_field) {
      value = scalarTargetValue(
        subjectTarget,
        fieldRule.selector_field,
        leafId
      );

      locator =
        subjectTarget
          ? subjectTarget.locator +
            '/' +
            fieldRule.selector_field
          : 'unresolved_html_selector';
    } else {
      value = pointerValue(
        fieldRule.source_id,
        fieldRule.json_pointer,
        leafId,
        fieldRule.expected_type
      );

      locator = fieldRule.json_pointer;
    }

    if (value !== undefined) {
      subjectValues.set(fieldName, value);

      recordLeafSupport(
        leafId,
        fieldRule.source_id,
        locator,
        value
      );
    }
  }

  for (const check of schema.subject.cross_source_checks) {
    const location =
      'subject.cross_source_check.' + check.check_id;

    const left = subjectTarget
      ? scalarTargetValue(
          subjectTarget,
          check.left.selector_field,
          location + '.left'
        )
      : undefined;

    const right = pointerValue(
      check.right.source_id,
      check.right.json_pointer,
      location + '.right',
      'string'
    );

    compareValues(
      check.comparison,
      left,
      right,
      location
    );
  }

  const relationshipResults = [];

  for (const relationship of schema.relationships) {
    const relationshipId = relationship.relationship_id;

    const target = selectTarget(
      relationship.target_selector,
      'relationship.' + relationshipId + '.selector'
    );

    const targetValues = new Map();

    let requiredFieldPassCount = 0;

    for (const [fieldName, fieldRule] of Object.entries(
      relationship.required_fields
    )) {
      const leafId =
        'relationship.' +
        relationshipId +
        '.' +
        fieldName;

      let sourceId;

      let locator;

      let value;

      if (
        fieldRule &&
        typeof fieldRule === 'object' &&
        !Array.isArray(fieldRule)
      ) {
        sourceId = fieldRule.source_id;

        locator = fieldRule.json_pointer;

        value = pointerValue(
          sourceId,
          locator,
          leafId,
          'string'
        );
      } else if (
        relationship.target_selector.kind ===
        'html_jsonld_node'
      ) {
        sourceId =
          relationship.target_selector.source_id;

        locator =
          target
            ? target.locator + '/' + fieldRule
            : 'unresolved_html_selector';

        value = scalarTargetValue(
          target,
          fieldRule,
          leafId
        );
      } else {
        sourceId =
          relationship.target_selector.source_id;

        locator = fieldRule;

        value = pointerValue(
          sourceId,
          locator,
          leafId,
          'string'
        );
      }

      if (value !== undefined) {
        targetValues.set(fieldName, value);

        recordLeafSupport(
          leafId,
          sourceId,
          locator,
          value
        );

        requiredFieldPassCount += 1;
      }
    }

    const bindingValue = pointerValue(
      relationship.binding.source_id,
      relationship.binding.json_pointer,
      'relationship.' +
        relationshipId +
        '.binding',
      undefined
    );

    if (bindingValue !== undefined) {
      const bindingRecord = sourceRecord(
        relationship.binding.source_id
      );

      bindingSupport.push({
        relationship_id: relationshipId,
        source_id: relationship.binding.source_id,
        source_sha256: bindingRecord.sha256,
        json_pointer: relationship.binding.json_pointer,
        value_type: valueType(bindingValue),
        value_sha256: jsonValueDigest(bindingValue)
      });
    }

    let bindingCheckPassCount = 0;

    for (
      let checkIndex = 0;
      checkIndex <
      relationship.required_binding_checks.length;
      checkIndex += 1
    ) {
      const check =
        relationship.required_binding_checks[checkIndex];

      const location =
        'relationship.' +
        relationshipId +
        '.binding_check.' +
        (checkIndex + 1);

      const left = pointerValue(
        relationship.binding.source_id,
        check.binding_pointer,
        location + '.left',
        'string'
      );

      let right;

      if (check.target_field) {
        right = targetValues.get(check.target_field);
      } else {
        right = pointerValue(
          relationship.target_selector.source_id,
          check.target_pointer,
          location + '.right',
          'string'
        );
      }

      if (
        compareValues(
          check.comparison,
          left,
          right,
          location
        )
      ) {
        bindingCheckPassCount += 1;
      }
    }

    const requiredFieldCount = Object.keys(
      relationship.required_fields
    ).length;

    const bindingCheckCount =
      relationship.required_binding_checks.length;

    relationshipResults.push({
      relationship_id: relationshipId,
      selector_pass: target !== null,
      required_field_pass_count:
        requiredFieldPassCount,
      required_field_count: requiredFieldCount,
      binding_check_pass_count:
        bindingCheckPassCount,
      binding_check_count: bindingCheckCount,
      relationship_complete:
        target !== null &&
        requiredFieldPassCount === requiredFieldCount &&
        bindingCheckPassCount === bindingCheckCount &&
        bindingValue !== undefined
    });
  }

  let rightsLeafPassCount = 0;

  for (const [fieldName, fieldRule] of Object.entries(
    schema.rights_boundary.required_fields
  )) {
    const leafId = 'rights.' + fieldName;

    const value = pointerValue(
      schema.rights_boundary.governing_source_id,
      fieldRule.json_pointer,
      leafId,
      fieldRule.expected_type,
      fieldRule.minimum_items
    );

    if (value !== undefined) {
      recordLeafSupport(
        leafId,
        schema.rights_boundary.governing_source_id,
        fieldRule.json_pointer,
        value
      );

      rightsLeafPassCount += 1;
    }
  }

  for (
    const corroboration of
    schema.rights_boundary.corroborating_sources
  ) {
    const location =
      'rights.corroboration.' +
      corroboration.source_id;

    const value = pointerValue(
      corroboration.source_id,
      corroboration.json_pointer,
      location,
      'string'
    );

    if (value !== undefined) {
      const record = sourceRecord(
        corroboration.source_id
      );

      corroborationSupport.push({
        source_id: corroboration.source_id,
        source_sha256: record.sha256,
        json_pointer: corroboration.json_pointer,
        value_type: valueType(value),
        value_sha256: jsonValueDigest(value)
      });
    }
  }

  const hashGroups = new Map();

  for (const record of captureManifest.records) {
    const ids = hashGroups.get(record.sha256) || [];
    ids.push(record.source_id);
    hashGroups.set(record.sha256, ids);
  }

  const duplicateGroups = [...hashGroups.entries()]
    .filter((entry) => entry[1].length > 1)
    .map((entry) => ({
      sha256: entry[0],
      source_ids: entry[1].sort()
    }));

  const expectedDuplicateGroup = {
    sha256:
      plan.content_equivalence_policy.expected_sha256,
    source_ids: [
      ...plan.content_equivalence_policy
        .byte_identical_source_ids
    ].sort()
  };

  if (
    JSON.stringify(duplicateGroups) !==
    JSON.stringify([expectedDuplicateGroup])
  ) {
    addIssue(
      'ambiguity',
      'UNEXPECTED_CONTENT_EQUIVALENCE_GROUP',
      'capture_manifest.response_hashes'
    );
  }

  const selectorRequiredCount =
    plan.audit_scope.html_jsonld_selector_count +
    plan.audit_scope.json_root_selector_count;

  const relationshipPassCount =
    relationshipResults.filter(
      (result) => result.relationship_complete
    ).length;

  const availabilityIssueCount =
    issues.availability.length;

  const ambiguityIssueCount =
    issues.ambiguity.length;

  const bindingIssueCount =
    issues.binding.length;

  const primaryPass =
    governedLeafPassCount ===
      plan.audit_scope.total_governed_leaf_count &&
    selectorPassCount === selectorRequiredCount &&
    crossSourceCheckPassCount ===
      plan.audit_scope.total_cross_source_check_count &&
    relationshipPassCount ===
      plan.audit_scope.relationship_count &&
    rightsLeafPassCount ===
      plan.audit_scope.rights_leaf_count &&
    availabilityIssueCount === 0 &&
    ambiguityIssueCount === 0 &&
    bindingIssueCount === 0;

  let primaryDecision;

  if (primaryPass) {
    primaryDecision =
      plan.primary_decision_rule.pass_label;
  } else if (ambiguityIssueCount > 0) {
    primaryDecision =
      plan.primary_decision_rule.ambiguity_fail_label;
  } else if (availabilityIssueCount > 0) {
    primaryDecision =
      plan.primary_decision_rule.availability_fail_label;
  } else {
    primaryDecision =
      plan.primary_decision_rule.binding_fail_label;
  }

  const auditOutput = {
    study_id: plan.study_id,
    audit_id: plan.audit_plan_id,
    status: 'AUTHORITY_COMPLETENESS_AUDIT_COMPLETE',
    audit_timestamp_utc: new Date().toISOString(),
    protocol_git_head: readGitHead(),
    frozen_inputs: {
      audit_plan: {
        path: path.relative(root, planPath),
        sha256: sha256(planBytes)
      },
      prospective_graph_schema: {
        path: path.relative(root, schemaPath),
        sha256: sha256(schemaBytes)
      },
      capture_freeze: plan.frozen_inputs.capture_freeze,
      capture_manifest:
        plan.frozen_inputs.capture_manifest,
      audit_runner: {
        path: path.relative(root, runnerPath),
        sha256: sha256(readFileSync(runnerPath))
      }
    },
    result: {
      primary_decision: primaryDecision,
      authority_complete_and_unambiguous:
        primaryPass,
      selector_pass_count: selectorPassCount,
      selector_required_count:
        selectorRequiredCount,
      governed_leaf_pass_count:
        governedLeafPassCount,
      governed_leaf_count:
        plan.audit_scope.total_governed_leaf_count,
      relationship_pass_count:
        relationshipPassCount,
      relationship_count:
        plan.audit_scope.relationship_count,
      rights_leaf_pass_count:
        rightsLeafPassCount,
      rights_leaf_count:
        plan.audit_scope.rights_leaf_count,
      cross_source_check_pass_count:
        crossSourceCheckPassCount,
      cross_source_check_count:
        plan.audit_scope.total_cross_source_check_count,
      provenance_support_count:
        provenanceSupport.length,
      unresolved_availability_issue_count:
        availabilityIssueCount,
      unresolved_ambiguity_issue_count:
        ambiguityIssueCount,
      unresolved_binding_issue_count:
        bindingIssueCount,
      raw_target_values_emitted: false,
      completed_target_constructed: false
    },
    relationship_results: relationshipResults,
    provenance_support: provenanceSupport,
    binding_support: bindingSupport,
    corroboration_support: corroborationSupport,
    content_equivalence: {
      unique_response_body_count:
        hashGroups.size,
      duplicate_groups: duplicateGroups,
      duplicate_group_counted_as_independent_support:
        false
    },
    issues,
    next_step_boundary: {
      independent_target_construction_protocol_permitted:
        primaryPass,
      target_constructed_by_audit: false,
      target_construction_performed: false,
      model_visible_input_construction_performed:
        false,
      model_measurement_authorized: false,
      p2_probe_authorized: false,
      p3_retrieval_authorized: false,
      x402_payment_authorized: false,
      economic_comparison_authorized: false,
      production_repair_authorized: false,
      recapture_authorized: false
    },
    actions_performed: {
      local_authority_audit: true,
      network_call: false,
      model_api_call: false,
      automatic_retry: false,
      target_construction: false,
      model_visible_input_construction: false,
      p2_probe: false,
      p3_retrieval: false,
      x402_payment: false,
      economic_comparison: false,
      production_mutation: false,
      website_mutation: false,
      pricing_mutation: false
    }
  };

  writeFileSync(
    outputPath,
    JSON.stringify(auditOutput, null, 2) + '\n',
    { flag: 'wx' }
  );

  console.log(
    'AUDIT_STATUS: ' + auditOutput.status
  );
  console.log(
    'PRIMARY_DECISION: ' +
    auditOutput.result.primary_decision
  );
  console.log(
    'AUTHORITY_COMPLETE_AND_UNAMBIGUOUS: ' +
    auditOutput.result
      .authority_complete_and_unambiguous
  );
  console.log(
    'SELECTORS: ' +
    auditOutput.result.selector_pass_count +
    '/' +
    auditOutput.result.selector_required_count
  );
  console.log(
    'GOVERNED_LEAVES: ' +
    auditOutput.result.governed_leaf_pass_count +
    '/' +
    auditOutput.result.governed_leaf_count
  );
  console.log(
    'RELATIONSHIPS: ' +
    auditOutput.result.relationship_pass_count +
    '/' +
    auditOutput.result.relationship_count
  );
  console.log(
    'RIGHTS_LEAVES: ' +
    auditOutput.result.rights_leaf_pass_count +
    '/' +
    auditOutput.result.rights_leaf_count
  );
  console.log(
    'CROSS_SOURCE_CHECKS: ' +
    auditOutput.result.cross_source_check_pass_count +
    '/' +
    auditOutput.result.cross_source_check_count
  );
  console.log(
    'AVAILABILITY_ISSUES: ' +
    auditOutput.result
      .unresolved_availability_issue_count
  );
  console.log(
    'AMBIGUITY_ISSUES: ' +
    auditOutput.result
      .unresolved_ambiguity_issue_count
  );
  console.log(
    'BINDING_ISSUES: ' +
    auditOutput.result
      .unresolved_binding_issue_count
  );
  console.log('RAW_TARGET_VALUES_EMITTED: false');
  console.log('TARGET_CONSTRUCTED: false');
  console.log('NETWORK_CALL_PERFORMED: false');
  console.log('MODEL_API_CALL_PERFORMED: false');
  console.log('X402_PAYMENT_PERFORMED: false');
  console.log(
    'AUDIT_OUTPUT: ' +
    plan.audit_output.path
  );
}

try {
  if (mode === '--preflight') {
    printPreflight();
  } else if (mode === '--audit') {
    if (existsSync(outputPath)) {
      throw new Error(
        'Audit output already exists: ' + outputPath
      );
    }

    if (readGitStatus().length !== 0) {
      throw new Error(
        'Audit execution requires a clean committed worktree.'
      );
    }

    validateFrozenInputs();

    runAudit();
  } else {
    throw new Error(
      'Usage: node scripts/audit-study008-authority-completeness.mjs [--preflight|--audit]'
    );
  }
} catch (error) {
  console.error(
    'STUDY008_AUTHORITY_AUDIT_ERROR: ' +
    error.message
  );
  process.exitCode = 1;
}
