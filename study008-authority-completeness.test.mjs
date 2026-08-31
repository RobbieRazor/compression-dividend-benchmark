import assert from 'node:assert/strict';

import { execFileSync } from 'node:child_process';

import { createHash } from 'node:crypto';

import { existsSync, readFileSync } from 'node:fs';

import test from 'node:test';

const readJson = (path) => JSON.parse(
  readFileSync(new URL(path, import.meta.url), 'utf8')
);

const readText = (path) => readFileSync(
  new URL(path, import.meta.url),
  'utf8'
);

const sha256 = (path) => createHash('sha256')
  .update(readFileSync(new URL(path, import.meta.url)))
  .digest('hex');

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(
      (item) => collectStrings(item, out)
    );
  }
  return out;
}

const plan = readJson(
  './data/CD-WORKLOAD-20260831-008-authority-completeness-audit-plan.json'
);

const schema = readJson(
  './data/CD-WORKLOAD-20260831-008-prospective-graph-schema.json'
);

const captureFreeze = readJson(
  './data/CD-WORKLOAD-20260831-008-authority-capture-freeze.json'
);

const captureManifest = readJson(
  './data/raw/CD-008-authority-capture/capture-manifest.json'
);

const previousAvailability = readJson(
  './data/CD-WORKLOAD-20260831-007-arm-b-authority-availability-audit.json'
);

const runnerPath =
  './scripts/audit-study008-authority-completeness.mjs';

const runnerSource = readText(runnerPath);

test('audit protocol pins the immutable contemporaneous capture', () => {
  assert.equal(plan.study_id, 'CD-WORKLOAD-20260831-008');
  assert.equal(
    plan.audit_plan_id,
    'CD008-AUTHORITY-COMPLETENESS-AUDIT-1.0'
  );
  assert.equal(
    plan.status,
    'AUDIT_PROTOCOL_FROZEN_BEFORE_COMPLETENESS_EXECUTION_OR_TARGET_CONSTRUCTION'
  );
  assert.equal(
    plan.frozen_inputs.capture_freeze.sha256,
    sha256('./' + plan.frozen_inputs.capture_freeze.path)
  );
  assert.equal(
    plan.frozen_inputs.capture_manifest.sha256,
    sha256('./' + plan.frozen_inputs.capture_manifest.path)
  );
  assert.equal(
    plan.frozen_inputs.prospective_graph_schema.sha256,
    sha256('./' + plan.frozen_inputs.prospective_graph_schema.path)
  );
  assert.equal(
    plan.frozen_inputs.capture_freeze.commit,
    '95069a896aa646ea529cf3b3eb0c6fadc1580960'
  );
  assert.equal(
    captureFreeze.capture_manifest.sha256,
    sha256('./' + captureFreeze.capture_manifest.path)
  );
  assert.equal(captureManifest.source_count, 14);
});

test('audit plan schema and runner bytes are pinned exactly', () => {
  assert.equal(
    sha256(
      './data/CD-WORKLOAD-20260831-008-authority-completeness-audit-plan.json'
    ),
    'd6c9c3a6a5490b291988b3c1d42881c40b418d9aa54a668cfe2b39f9739f3f96'
  );
  assert.equal(
    sha256(
      './data/CD-WORKLOAD-20260831-008-prospective-graph-schema.json'
    ),
    '96c3210bda3420cb392d279bc9045eba2ea1a83d6df4ee26d6df4a4a4abaa150'
  );
  assert.equal(
    sha256(runnerPath),
    'e22e4b428164b35de6938b29707cb632a15fb5d1cfd0947dd7137801c5787439'
  );
});

test('prospective graph freezes one subject ten relationships and one rights boundary', () => {
  assert.equal(schema.graph_shape.subject_count, 1);
  assert.equal(schema.relationships.length, 10);
  assert.equal(schema.graph_shape.relationship_count, 10);
  assert.equal(schema.graph_shape.rights_boundary_count, 1);
  assert.equal(schema.graph_shape.all_relationships_required, true);
  assert.equal(schema.graph_shape.extra_relationships_allowed, false);
  assert.equal(schema.graph_shape.partial_graph_pass_allowed, false);
  assert.equal(
    new Set(
      schema.relationships.map(
        (relationship) => relationship.relationship_id
      )
    ).size,
    10
  );
});

test('declared audit counts are reproduced exactly from the schema', () => {
  const subjectLeaves = Object.keys(
    schema.subject.required_fields
  ).length;

  const relationshipLeaves = schema.relationships.reduce(
    (sum, relationship) =>
      sum + Object.keys(relationship.required_fields).length,
    0
  );

  const rightsLeaves = Object.keys(
    schema.rights_boundary.required_fields
  ).length;

  const subjectChecks =
    schema.subject.cross_source_checks.length;

  const relationshipChecks = schema.relationships.reduce(
    (sum, relationship) =>
      sum + relationship.required_binding_checks.length,
    0
  );

  const htmlSelectors =
    1 +
    schema.relationships.filter(
      (relationship) =>
        relationship.target_selector.kind ===
        'html_jsonld_node'
    ).length;

  const jsonRootSelectors = schema.relationships.filter(
    (relationship) =>
      relationship.target_selector.kind === 'json_root'
  ).length;

  assert.equal(subjectLeaves, 8);
  assert.equal(relationshipLeaves, 47);
  assert.equal(rightsLeaves, 8);
  assert.equal(
    subjectLeaves + relationshipLeaves + rightsLeaves,
    63
  );
  assert.equal(subjectChecks, 2);
  assert.equal(relationshipChecks, 15);
  assert.equal(subjectChecks + relationshipChecks, 17);
  assert.equal(htmlSelectors, 6);
  assert.equal(jsonRootSelectors, 5);

  assert.equal(
    plan.audit_scope.total_governed_leaf_count,
    63
  );
  assert.equal(
    plan.audit_scope.total_cross_source_check_count,
    17
  );
});

test('all fourteen captured sources have a frozen audit role', () => {
  const used = new Set();

  used.add(
    schema.subject.canonical_authority_binding.source_id
  );

  used.add(schema.subject.identity_selector.source_id);

  for (const field of Object.values(
    schema.subject.required_fields
  )) {
    used.add(field.source_id);
  }

  for (const check of schema.subject.cross_source_checks) {
    used.add(check.left.source_id);
    used.add(check.right.source_id);
  }

  for (const relationship of schema.relationships) {
    used.add(relationship.binding.source_id);
    used.add(relationship.target_selector.source_id);

    for (const field of Object.values(
      relationship.required_fields
    )) {
      if (field && typeof field === 'object') {
        used.add(field.source_id);
      }
    }
  }

  used.add(schema.rights_boundary.governing_source_id);

  for (
    const source of
    schema.rights_boundary.corroborating_sources
  ) {
    used.add(source.source_id);
  }

  for (
    const sourceId of
    plan.content_equivalence_policy
      .byte_identical_source_ids
  ) {
    used.add(sourceId);
  }

  const expected = Array.from(
    { length: 14 },
    (_, index) =>
      'CD008-AUTH-S' +
      String(index + 1).padStart(3, '0')
  );

  assert.deepEqual([...used].sort(), expected);
});

test('every target has exact source-native type evidence', () => {
  assert.equal(
    schema.subject.required_fields.entity_type.selector_field,
    '@type'
  );

  for (const relationship of schema.relationships) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(
        relationship.required_fields,
        'entity_type'
      ),
      relationship.relationship_id
    );

    assert.equal(
      relationship.version_required,
      Object.prototype.hasOwnProperty.call(
        relationship.required_fields,
        'version'
      ),
      relationship.relationship_id
    );
  }

  assert.equal(
    schema.source_native_type_policy.ontology_inference_allowed,
    false
  );
  assert.equal(
    schema.source_native_type_policy.alternate_type_label_allowed,
    false
  );
  assert.equal(
    plan.source_native_type_policy.inferred_type_allowed,
    false
  );
});

test('selectors pointers digests and ambiguity rules remain exact', () => {
  assert.equal(
    plan.deterministic_extraction.json_pointer_standard,
    'RFC6901'
  );
  assert.equal(
    plan.deterministic_extraction.html_jsonld_parse_failure_fails,
    true
  );
  assert.equal(
    plan.deterministic_extraction.html_selector_predicates_are_exact,
    true
  );
  assert.equal(
    plan.deterministic_extraction.html_selector_required_match_count,
    1
  );
  assert.equal(
    plan.deterministic_extraction.normalization_allowed,
    false
  );
  assert.equal(
    plan.deterministic_extraction.case_folding_allowed,
    false
  );
  assert.equal(
    plan.deterministic_extraction.paraphrase_allowed,
    false
  );
  assert.equal(
    plan.value_digest_policy.algorithm,
    'sha256'
  );
  assert.equal(
    plan.value_digest_policy.raw_values_emitted_by_audit,
    false
  );
  assert.equal(
    plan.value_digest_policy.target_object_constructed_by_audit,
    false
  );
  assert.equal(
    schema.ambiguity_policy.unresolved_conflict_causes_failure,
    true
  );
  assert.equal(
    schema.ambiguity_policy.post_audit_selector_change_allowed,
    false
  );
});

test('historical target values and diagnostics remain excluded', () => {
  assert.equal(
    plan.allowed_evidence.study005_through_007_hidden_target,
    false
  );
  assert.equal(
    plan.allowed_evidence.study005_through_007_model_outputs,
    false
  );
  assert.equal(
    plan.allowed_evidence.study005_through_007_failed_field_diagnostics,
    false
  );
  assert.equal(
    schema.historical_boundary.study005_through_007_target_loaded,
    false
  );
  assert.equal(
    schema.historical_boundary.study005_through_007_target_comparison_allowed,
    false
  );
  assert.equal(
    schema.historical_boundary.historical_failed_values_used,
    false
  );

  const exposed = new Set([
    ...collectStrings(plan),
    ...collectStrings(schema)
  ]);

  for (const fact of previousAvailability.unavailable_exact_facts) {
    assert.equal(
      exposed.has(fact.required_value),
      false,
      'historical protected value disclosed: ' +
        fact.required_value
    );
  }

  assert.equal(
    runnerSource.includes(
      'CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json'
    ),
    false
  );
});

test('audit runner is local model-free credential-free and nonpaying', () => {
  assert.equal(runnerSource.includes('fetch('), false);
  assert.equal(runnerSource.includes('process.env'), false);
  assert.equal(runnerSource.includes('openai'), false);
  assert.equal(
    plan.execution_modes.preflight.network_allowed,
    false
  );
  assert.equal(
    plan.execution_modes.preflight.filesystem_write_allowed,
    false
  );
  assert.equal(
    plan.execution_modes.audit.network_allowed,
    false
  );
  assert.equal(
    plan.execution_modes.audit.model_api_call_allowed,
    false
  );
  assert.equal(
    plan.execution_modes.audit.x402_payment_allowed,
    false
  );
  assert.equal(plan.audit_output.overwrite_allowed, false);
  assert.equal(plan.audit_output.contains_raw_target_values, false);
  assert.equal(plan.audit_output.contains_completed_target, false);
});

test('offline preflight validates frozen inputs without writing audit output', () => {
  const outputFile = new URL(
    './data/CD-WORKLOAD-20260831-008-authority-completeness-audit.json',
    import.meta.url
  );

  const existedBefore = existsSync(outputFile);

  const output = execFileSync(
    process.execPath,
    [
      'scripts/audit-study008-authority-completeness.mjs',
      '--preflight'
    ],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  const existsAfter = existsSync(outputFile);

  assert.equal(existsAfter, existedBefore);
  assert.match(output, /GOVERNED_LEAF_COUNT: 63/);
  assert.match(output, /SELECTOR_COUNT: 11/);
  assert.match(output, /CROSS_SOURCE_CHECK_COUNT: 17/);
  assert.match(output, /HISTORICAL_TARGET_LOADED: false/);
  assert.match(output, /RAW_TARGET_VALUES_EMITTED: false/);
  assert.match(output, /NETWORK_CALL_PERFORMED: false/);
  assert.match(output, /MODEL_API_CALL_PERFORMED: false/);
  assert.match(output, /X402_PAYMENT_PERFORMED: false/);
  assert.match(output, /FILESYSTEM_WRITE_PERFORMED: false/);
  assert.match(output, /AUDIT_AUTHORIZED_NOW: false/);
  assert.match(output, /PREFLIGHT_PASS: true/);
});

test('protocol freeze blocks target measurement payment and mutation', () => {
  assert.deepEqual(plan.actions_performed_by_plan_freeze, {
    authority_completeness_audit: false,
    audit_output_written: false,
    target_construction: false,
    model_visible_input_construction: false,
    network_call: false,
    model_api_call: false,
    automatic_retry: false,
    p2_probe: false,
    p3_retrieval: false,
    x402_payment: false,
    economic_comparison: false,
    production_mutation: false,
    website_mutation: false,
    pricing_mutation: false
  });

  assert.equal(
    plan.pass_next_step_boundary.target_construction_immediately_performed_by_audit,
    false
  );
  assert.equal(
    plan.pass_next_step_boundary.model_measurement_authorized,
    false
  );
  assert.equal(
    plan.pass_next_step_boundary.x402_payment_authorized,
    false
  );
  assert.equal(
    plan.pass_next_step_boundary.economic_comparison_authorized,
    false
  );
});
