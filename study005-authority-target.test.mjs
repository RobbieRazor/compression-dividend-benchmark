import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}


function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}


function sortedKeys(value) {
  return Object.keys(value).sort();
}


function leafPaths(value, prefix = '') {
  const paths = [];

  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (child && typeof child === 'object' && !Array.isArray(child)) {
      paths.push(...leafPaths(child, path));
    } else {
      paths.push(path);
    }
  }

  return paths;
}


function assertScalarMatchesSchema(value, fieldSchema, context, schema) {
  if (fieldSchema.$ref === '#/$defs/non_empty_string') {
    assert.equal(typeof value, 'string', context);
    assert.equal(value.length > 0, true, context);
    return;
  }

  if (fieldSchema.$ref === '#/$defs/absolute_uri_string') {
    assert.equal(typeof value, 'string', context);
    assert.doesNotThrow(() => new URL(value), context);
    return;
  }

  if (fieldSchema.type === 'boolean') {
    assert.equal(typeof value, 'boolean', context);
    return;
  }

  if (fieldSchema.$ref) {
    const key = fieldSchema.$ref.replace('#/$defs/', '');
    assertScalarMatchesSchema(value, schema.$defs[key], context, schema);
    return;
  }

  assert.fail(`Unhandled schema definition at ${context}`);
}


const design = readJson(
  './data/CD-WORKLOAD-20260830-005-design-manifest.json'
);
const schema = readJson(
  './data/CD-WORKLOAD-20260830-005-neutral-schema.json'
);
const authority = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-public-authority-package.json'
);
const targetRecord = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json'
);
const study004Authority = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
);
const study004Target = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json'
);
const study004TaskMetadata = readJson(
  './data/CD-WORKLOAD-20260829-004-task-metadata.json'
);


test('Study 005 authority and target freeze the selected schema intervention', () => {
  assert.equal(authority.study_id, design.study_id);
  assert.equal(authority.module_id, design.module_id);
  assert.equal(targetRecord.study_id, design.study_id);
  assert.equal(targetRecord.module_id, design.module_id);
  assert.equal(
    authority.status,
    'INDEPENDENT_PUBLIC_AUTHORITY_EVIDENCE_FROZEN_WITH_EXACT_STUDY004_BYTES'
  );
  assert.equal(
    targetRecord.status,
    'SCHEMA_CONFORMING_INDEPENDENT_PUBLIC_TARGET_FROZEN'
  );
  assert.equal(
    targetRecord.construction_boundary.representation_kind,
    'exact-neutral-schema-instance'
  );
});


test('all authority, schema, design, and predecessor bytes are pinned', () => {
  assert.equal(
    sha256(`./${authority.frozen_design.manifest_path}`),
    authority.frozen_design.manifest_sha256
  );
  assert.equal(
    sha256(`./${authority.frozen_design.neutral_schema_path}`),
    authority.frozen_design.neutral_schema_sha256
  );

  for (const item of [
    ...authority.model_visible_authority_evidence,
    ...authority.evaluator_only_lineage
  ]) {
    assert.equal(sha256(`./${item.path}`), item.sha256, item.role);
  }

  assert.equal(
    sha256(`./${targetRecord.authority_package.path}`),
    targetRecord.authority_package.sha256
  );
  assert.equal(
    sha256(`./${targetRecord.neutral_schema.path}`),
    targetRecord.neutral_schema.sha256
  );
  assert.equal(
    sha256(`./${targetRecord.predecessor_semantic_target.path}`),
    targetRecord.predecessor_semantic_target.sha256
  );
});


test('model-visible authority evidence remains byte-identical to Study 004', () => {
  const study004VisibleAuthority = study004TaskMetadata.model_visible_inputs
    .filter((item) => item.role !== 'neutral_task')
    .map((item) => ({ path: item.path, sha256: item.sha256 }));
  const study005VisibleAuthority = authority.model_visible_authority_evidence
    .map((item) => ({ path: item.path, sha256: item.sha256 }));

  assert.deepEqual(study005VisibleAuthority, study004VisibleAuthority);
  assert.equal(authority.evidence_reuse_rule.study004_model_visible_authority_bytes_preserved, true);
  assert.equal(authority.evidence_reuse_rule.new_target_values_added_to_model_visible_authority, false);

  for (const item of authority.model_visible_authority_evidence) {
    assert.equal(item.study004_model_visible, true);
    assert.equal(item.study005_future_model_visible, true);
    assert.equal(item.byte_content_changed_for_study005, false);
  }
});


test('completed target is an exact instance of the frozen neutral schema shape', () => {
  const target = targetRecord.target;

  assert.deepEqual(sortedKeys(target), [...schema.required].sort());
  assert.deepEqual(sortedKeys(target.subject), [...schema.$defs.subject.required].sort());
  assert.deepEqual(
    sortedKeys(target.subject.main_entity),
    [...schema.$defs.subject.properties.main_entity.required].sort()
  );

  for (const [field, fieldSchema] of Object.entries(schema.$defs.subject.properties)) {
    if (field === 'main_entity') {
      for (const [nestedField, nestedSchema] of Object.entries(fieldSchema.properties)) {
        assertScalarMatchesSchema(
          target.subject.main_entity[nestedField],
          nestedSchema,
          `subject.main_entity.${nestedField}`,
          schema
        );
      }
    } else {
      assertScalarMatchesSchema(target.subject[field], fieldSchema, `subject.${field}`, schema);
    }
  }

  assert.equal(target.relationships.length, schema.$defs.relationships.minItems);
  assert.equal(target.relationships.length, schema.$defs.relationships.maxItems);

  const labels = new Set();

  for (let index = 0; index < target.relationships.length; index += 1) {
    const relationship = target.relationships[index];
    const definition = schema.$defs[`relationship_r${String(index + 1).padStart(2, '0')}`];
    const properties = definition.allOf[1].properties;

    assert.deepEqual(sortedKeys(relationship), [...schema.$defs.relationship_shell.required].sort());
    assert.equal(relationship.relationship, properties.relationship.const);
    assert.equal(labels.has(relationship.relationship), false);
    labels.add(relationship.relationship);
    assert.deepEqual(sortedKeys(relationship.target), [...properties.target.required].sort());

    for (const [field, fieldSchema] of Object.entries(properties.target.properties)) {
      assertScalarMatchesSchema(
        relationship.target[field],
        fieldSchema,
        `${relationship.relationship}.${field}`,
        schema
      );
    }

    assert.equal(Array.isArray(relationship.provenance), true);
    assert.equal(relationship.provenance.length > 0, true);
    assert.equal(new Set(relationship.provenance).size, relationship.provenance.length);
    for (const sourceId of relationship.provenance) {
      assert.equal(typeof sourceId, 'string');
      assert.equal(sourceId.length > 0, true);
    }
  }

  assert.equal(labels.size, 9);
  assert.deepEqual(
    sortedKeys(target.retrieval_rights_boundary),
    [...schema.$defs.retrieval_rights_boundary.required].sort()
  );
  assert.equal(typeof target.retrieval_rights_boundary.one_endpoint_retrieval, 'string');
  assert.equal(target.retrieval_rights_boundary.excluded_rights.length > 0, true);
  assert.equal(new Set(target.retrieval_rights_boundary.excluded_rights).size,
    target.retrieval_rights_boundary.excluded_rights.length);
  assert.equal(typeof target.retrieval_rights_boundary.multi_task_reuse_authorized, 'boolean');
  assert.equal(typeof target.retrieval_rights_boundary.amortization_authorized, 'boolean');
});


test('Study 005 preserves the independent Study 004 semantic target values', () => {
  const expectedRelationships = study004Target.representation.relationships.map((item) => ({
    relationship: item.relationship,
    target: item.target,
    provenance: item.provenance_source_ids
  }));
  const expectedRights = {
    one_endpoint_retrieval: study004Target.retrieval_rights_boundary.conveyed,
    excluded_rights: study004Target.retrieval_rights_boundary.excluded,
    multi_task_reuse_authorized:
      study004Target.retrieval_rights_boundary.multi_task_amortization_allowed,
    amortization_authorized:
      study004Target.retrieval_rights_boundary.multi_task_amortization_allowed
  };

  assert.deepEqual(targetRecord.target.subject, study004Target.subject);
  assert.deepEqual(targetRecord.target.relationships, expectedRelationships);
  assert.deepEqual(targetRecord.target.retrieval_rights_boundary, expectedRights);
  assert.equal(targetRecord.comparison_boundary.study004_semantic_target_values_preserved, true);
  assert.equal(targetRecord.comparison_boundary.study004_output_structure_inherited, false);
  assert.equal(targetRecord.comparison_boundary.study004_failed_output_used_as_template, false);
});


test('every target field has traceable frozen public-authority support', () => {
  const validSourceIds = new Set(study004Authority.sources.map((item) => item.source_id));
  assert.deepEqual(new Set(authority.public_source_ids), validSourceIds);

  const supportedSubjectFields = authority.target_support_coverage.subject
    .map((item) => item.field)
    .sort();
  assert.deepEqual(supportedSubjectFields, leafPaths(targetRecord.target.subject).sort());

  const coverageByRelationship = new Map(
    authority.target_support_coverage.relationships
      .map((item) => [item.relationship, item])
  );

  for (const relationship of targetRecord.target.relationships) {
    const coverage = coverageByRelationship.get(relationship.relationship);
    assert.ok(coverage, relationship.relationship);
    assert.deepEqual([...coverage.target_fields].sort(), sortedKeys(relationship.target));
    assert.deepEqual(coverage.supporting_source_ids, relationship.provenance);
  }

  const supportedRightsFields = authority.target_support_coverage.retrieval_rights_boundary
    .map((item) => item.field)
    .sort();
  assert.deepEqual(supportedRightsFields, sortedKeys(targetRecord.target.retrieval_rights_boundary));

  for (const coverage of [
    ...authority.target_support_coverage.subject,
    ...authority.target_support_coverage.relationships,
    ...authority.target_support_coverage.retrieval_rights_boundary
  ]) {
    assert.equal(coverage.supporting_source_ids.length > 0, true);
    for (const sourceId of coverage.supporting_source_ids) {
      assert.equal(validSourceIds.has(sourceId), true, sourceId);
    }
  }

  assert.deepEqual(targetRecord.traceability_assertions, {
    every_subject_field_supported: true,
    every_relationship_target_field_supported: true,
    every_relationship_has_public_provenance: true,
    every_retrieval_rights_field_supported: true,
    unsupported_target_value_count: 0
  });
});


test('protected outputs, paid payloads, and live refresh remain excluded', () => {
  for (const boundary of [authority.construction_boundary, targetRecord.construction_boundary]) {
    for (const [field, value] of Object.entries(boundary)) {
      if (field === 'representation_kind') {
        continue;
      }
      assert.equal(value, false, field);
    }
  }

  assert.equal(targetRecord.model_visibility_boundary.target_visible_to_p1, false);
  assert.equal(targetRecord.model_visibility_boundary.target_visible_to_p2, false);
  assert.equal(targetRecord.model_visibility_boundary.target_metadata_visible_to_p1, false);
  assert.equal(targetRecord.model_visibility_boundary.target_metadata_visible_to_p2, false);
  assert.equal(
    targetRecord.model_visibility_boundary.authority_freeze_control_visible_to_p1_p2,
    false
  );
  assert.equal(targetRecord.predecessor_semantic_target.model_visible_to_p1_p2, false);
});


test('measurement, P2, P3, and economics remain blocked', () => {
  assert.equal(targetRecord.measurement_state.public_authority_package_frozen, true);
  assert.equal(targetRecord.measurement_state.target_values_frozen, true);
  assert.equal(targetRecord.measurement_state.target_representation_frozen, true);
  assert.equal(targetRecord.measurement_state.quality_contract_frozen, false);
  assert.equal(targetRecord.measurement_state.neutral_task_frozen, false);
  assert.equal(targetRecord.measurement_state.provider_configuration_frozen, false);
  assert.equal(targetRecord.measurement_state.evaluator_frozen, false);
  assert.equal(targetRecord.measurement_state.runner_frozen, false);
  assert.equal(targetRecord.measurement_state.p1_measurement_started, false);
  assert.equal(targetRecord.measurement_state.p2_probe_started, false);
  assert.equal(targetRecord.measurement_state.p3_payment_performed, false);
  assert.equal(targetRecord.measurement_state.economic_comparison_performed, false);
  assert.equal(
    targetRecord.next_artifact.type,
    'QUALITY_CONTRACT_NEUTRAL_TASK_PROVIDER_AND_EVALUATOR_FREEZE'
  );
  assert.equal(targetRecord.next_artifact.required_before_measurement, true);
  assert.equal(targetRecord.next_artifact.api_call_allowed_now, false);
  assert.equal(targetRecord.next_artifact.p2_probe_allowed_now, false);
  assert.equal(targetRecord.next_artifact.p3_payment_allowed_now, false);
});
