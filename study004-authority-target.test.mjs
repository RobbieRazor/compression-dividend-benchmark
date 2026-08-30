import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  );
}

function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest('hex');
}

const registry = readJson(
  './data/CD-WORKLOAD-20260829-004-workload-class-calibration-registry.json'
);
const authority = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
);
const target = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json'
);

test('authority package and target freeze the selected module', () => {
  assert.equal(authority.study_id, registry.study_id);
  assert.equal(authority.module_id, registry.selection.module_id);
  assert.equal(target.study_id, registry.study_id);
  assert.equal(target.module_id, registry.selection.module_id);
  assert.equal(
    authority.status,
    'INDEPENDENT_FROM_PAID_P3_PUBLIC_AUTHORITY_PACKAGE_FROZEN'
  );
  assert.equal(
    target.status,
    'INDEPENDENT_PUBLIC_TARGET_REPRESENTATION_FROZEN'
  );
});

test('target pins the exact authority-package bytes', () => {
  assert.equal(
    target.authority_package.sha256,
    sha256(
      './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
    )
  );
});

test('all nine declared relationships are covered exactly once', () => {
  const selected = registry.candidates.find(
    (candidate) =>
      candidate.candidate_id === registry.selection.selected_candidate_id
  );
  const declared = selected.declared_relationships;
  const authorityRelationships = authority.relationship_coverage.map(
    (entry) => entry.relationship
  );
  const targetRelationships = target.representation.relationships.map(
    (entry) => entry.relationship
  );

  assert.equal(authority.relationship_coverage.length, 9);
  assert.equal(target.representation.relationship_count, 9);
  assert.equal(target.representation.relationships.length, 9);
  assert.deepEqual(authorityRelationships, declared);
  assert.deepEqual(targetRelationships, declared);
  assert.equal(new Set(targetRelationships).size, 9);
});

test('every target relationship has frozen authority provenance', () => {
  const sourceIds = new Set(authority.sources.map((source) => source.source_id));

  assert.equal(authority.source_count, authority.sources.length);
  assert.equal(sourceIds.size, authority.sources.length);

  for (const relationship of target.representation.relationships) {
    assert.equal(relationship.provenance_source_ids.length > 0, true);
    for (const sourceId of relationship.provenance_source_ids) {
      assert.equal(sourceIds.has(sourceId), true, sourceId);
    }
  }
});

test('public live-source hashes agree with the selection freeze', () => {
  const sources = Object.fromEntries(
    authority.sources.map((source) => [source.source_id, source])
  );

  assert.equal(
    sources['CD004-AUTH-S003'].raw_sha256,
    registry.live_production_evidence.ai_catalog
      .sha256_observed_2026_08_30
  );
  assert.equal(
    sources['CD004-AUTH-S005'].raw_sha256,
    registry.live_production_evidence.pricing_manifest
      .sha256_observed_2026_08_30
  );
  assert.equal(sources['CD004-AUTH-S004'].http_status, 200);
  assert.equal(sources['CD004-AUTH-S006'].http_status, 200);
});

test('protected P3 response is excluded from target construction', () => {
  assert.equal(authority.construction_boundary.protected_p3_payload_read, false);
  assert.equal(authority.construction_boundary.x402_payment_performed, false);
  assert.equal(target.construction_boundary.protected_p3_payload_read, false);
  assert.equal(target.construction_boundary.protected_p3_payload_used, false);
  assert.equal(target.construction_boundary.x402_payment_performed, false);
  assert.equal(
    target.construction_boundary.representation_kind,
    'semantic-target-not-provider-payload-template'
  );
});

test('rights boundary forbids multi-task amortization', () => {
  assert.equal(authority.rights_boundary.primary_empirical_Krights, 1);
  assert.equal(target.retrieval_rights_boundary.primary_empirical_Krights, 1);
  assert.equal(
    target.retrieval_rights_boundary.multi_task_amortization_allowed,
    false
  );
});

test('measurement remains blocked on the next preregistration package', () => {
  assert.equal(target.measurement_state.authority_package_frozen, true);
  assert.equal(target.measurement_state.target_representation_frozen, true);
  assert.equal(target.measurement_state.quality_contract_frozen, false);
  assert.equal(target.measurement_state.neutral_task_frozen, false);
  assert.equal(target.measurement_state.evaluator_frozen, false);
  assert.equal(target.measurement_state.p1_measurement_started, false);
  assert.equal(target.measurement_state.p2_measurement_started, false);
  assert.equal(target.measurement_state.p3_payment_performed, false);
  assert.equal(
    target.next_artifact.type,
    'QUALITY_CONTRACT_NEUTRAL_TASK_PROVIDER_AND_EVALUATOR_FREEZE'
  );
});
