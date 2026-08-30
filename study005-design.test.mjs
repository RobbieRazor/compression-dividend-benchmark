import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';


function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}


function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}


function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}


function collectStrings(value, results = []) {
  if (typeof value === 'string') {
    results.push(value);
  } else if (Array.isArray(value)) {
    for (const child of value) {
      collectStrings(child, results);
    }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectStrings(child, results);
    }
  }

  return results;
}


const manifest = readJson(
  './data/CD-WORKLOAD-20260830-005-design-manifest.json'
);
const schema = readJson(
  './data/CD-WORKLOAD-20260830-005-neutral-schema.json'
);
const study004Target = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json'
);
const study004Provider = readJson(
  './data/CD-WORKLOAD-20260829-004-provider.json'
);
const study004Closure = readJson(
  './data/CD-WORKLOAD-20260829-004-FINAL-SUMMARY.json'
);


test('Study 005 starts as a design-only successor to immutable Study 004', () => {
  assert.equal(manifest.study_id, 'CD-WORKLOAD-20260830-005');
  assert.equal(
    manifest.status,
    'DESIGN_AND_NEUTRAL_SCHEMA_FROZEN_BEFORE_TASK_TARGET_PROVIDER_OR_MEASUREMENT'
  );
  assert.equal(
    manifest.predecessor_evidence.study004_outcome,
    'QUALITY_CENSORED_STRUCTURAL_FIDELITY_FAILURE'
  );
  assert.equal(
    manifest.predecessor_evidence.study004_outcome,
    study004Closure.benchmark_outcome
  );
  assert.equal(manifest.predecessor_evidence.study004_quality_result_modified, false);
  assert.equal(
    manifest.predecessor_evidence.study004_cost_inherited_as_accepted_baseline,
    false
  );
  assert.equal(manifest.current_freeze_state.design_frozen, true);
  assert.equal(manifest.current_freeze_state.neutral_schema_frozen, true);
  assert.equal(manifest.current_freeze_state.measurement_authorized, false);
});


test('design and neutral schema hashes are frozen exactly', () => {
  for (const [role, artifact] of Object.entries(manifest.frozen_design_artifacts)) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
  }

  for (const [role, artifact] of Object.entries(manifest.predecessor_evidence)) {
    if (!artifact || typeof artifact !== 'object' || !artifact.path) {
      continue;
    }
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, role);
  }
});


test('neutral schema exposes exact placement for all required graph components', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    'subject',
    'relationships',
    'retrieval_rights_boundary'
  ]);
  assert.deepEqual(schema.$defs.subject.required, [
    'canonical_plate_id',
    'canonical_url',
    'canonical_authority',
    'name',
    'entity_type',
    'main_entity'
  ]);
  assert.deepEqual(schema.$defs.subject.properties.main_entity.required, [
    'name',
    'entity_type',
    'url'
  ]);
  assert.equal(schema.$defs.relationships.minItems, 9);
  assert.equal(schema.$defs.relationships.maxItems, 9);
  assert.equal(schema.$defs.relationships.items.oneOf.length, 9);
  assert.equal(schema.$defs.relationships.allOf.length, 9);
  assert.deepEqual(schema.$defs.retrieval_rights_boundary.required, [
    'one_endpoint_retrieval',
    'excluded_rights',
    'multi_task_reuse_authorized',
    'amortization_authorized'
  ]);
});


test('relationship labels and target-field placement match the prior frozen task surface', () => {
  const targetRelationships = study004Target.representation.relationships;
  const schemaRelationships = Array.from({ length: 9 }, (_, index) => {
    const key = `relationship_r${String(index + 1).padStart(2, '0')}`;
    const properties = schema.$defs[key].allOf[1].properties;
    return {
      relationship: properties.relationship.const,
      targetFields: properties.target.required
    };
  });

  assert.deepEqual(
    schemaRelationships.map((item) => item.relationship),
    targetRelationships.map((item) => item.relationship)
  );

  for (let index = 0; index < targetRelationships.length; index += 1) {
    assert.deepEqual(
      schemaRelationships[index].targetFields,
      Object.keys(targetRelationships[index].target),
      targetRelationships[index].relationship_id
    );
  }

  assert.equal(
    schemaRelationships.reduce((sum, item) => sum + item.targetFields.length, 0),
    manifest.neutral_schema_metrics.relationship_target_required_field_count_total
  );
});


test('neutral schema contains vocabulary but no protected target values', () => {
  const allowedRelationshipLabels = new Set(
    study004Target.representation.relationships.map((item) => item.relationship)
  );
  const protectedTargetStrings = new Set(
    collectStrings(study004Target).filter(
      (value) => !allowedRelationshipLabels.has(value)
    )
  );
  const schemaStrings = new Set(collectStrings(schema));

  for (const protectedValue of protectedTargetStrings) {
    assert.equal(
      schemaStrings.has(protectedValue),
      false,
      `Protected target value leaked into schema: ${protectedValue}`
    );
  }

  assert.equal(schemaStrings.has(study004Provider.p3_configuration.url), false);
  assert.equal(schemaStrings.has('robbie-george#robbie-george-biography-plate'), false);
  assert.equal(schemaStrings.has('0.9-draft'), false);
  assert.equal(schemaStrings.has('0.025'), false);
  assert.equal(schemaStrings.has('25000'), false);
});


test('future visibility and spending remain blocked at the design freeze', () => {
  const hidden = manifest.future_model_visibility_boundary.always_hidden_from_p1_p2;

  assert.equal(hidden.includes('completed target representation'), true);
  assert.equal(hidden.includes('protected or paid P3 payload'), true);
  assert.equal(hidden.includes('Study 004 model output'), true);
  assert.equal(hidden.includes('Study 004 structural adjudication'), true);
  assert.equal(manifest.future_model_visibility_boundary.design_manifest_model_visible, false);
  assert.equal(manifest.quality_and_economic_boundary.complete_quality_gate_required, true);
  assert.equal(manifest.quality_and_economic_boundary.partial_credit_changes_primary_pass, false);
  assert.equal(manifest.quality_and_economic_boundary.p2_allowed_before_accepted_p1, false);
  assert.equal(
    manifest.quality_and_economic_boundary
      .p3_payment_allowed_before_quality_equivalent_baseline,
    false
  );
  assert.equal(manifest.quality_and_economic_boundary.economic_comparison_allowed_now, false);
  assert.deepEqual(manifest.actions_performed, {
    api_call: false,
    p2_probe: false,
    x402_payment: false,
    economic_comparison: false,
    website_mutation: false,
    pricing_mutation: false
  });
  assert.equal(manifest.next_artifact.api_call_allowed, false);
  assert.equal(manifest.next_artifact.p2_probe_allowed, false);
  assert.equal(manifest.next_artifact.p3_payment_allowed, false);
});


test('design document preserves sampling and cross-study boundaries', () => {
  const design = readText('./WORKLOAD-CD-20260830-005.md');

  assert.match(design, /One passing observation may establish initial feasibility/);
  assert.match(design, /Repeated accepted observations are required for calibration/);
  assert.match(design, /Their requester costs must not be treated as directly interchangeable/);
  assert.match(design, /Do not tune the study to force governed retrieval to win/);
  assert.equal(manifest.sampling_boundary.one_observation_sufficient_for_stable_cost_calibration, false);
  assert.equal(manifest.sampling_boundary.repeated_accepted_observations_required_for_calibration, true);
  assert.equal(manifest.cross_study_boundary.raw_requester_costs_directly_interchangeable, false);
});
