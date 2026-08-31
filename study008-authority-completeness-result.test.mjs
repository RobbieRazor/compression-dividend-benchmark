import assert from 'node:assert/strict';

import { createHash } from 'node:crypto';

import { readFileSync } from 'node:fs';

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

const auditPath =
  './data/CD-WORKLOAD-20260831-008-authority-completeness-audit.json';

const audit = readJson(auditPath);

const plan = readJson(
  './data/CD-WORKLOAD-20260831-008-authority-completeness-audit-plan.json'
);

const schema = readJson(
  './data/CD-WORKLOAD-20260831-008-prospective-graph-schema.json'
);

const captureManifest = readJson(
  './data/raw/CD-008-authority-capture/capture-manifest.json'
);

const recordsById = new Map(
  captureManifest.records.map(
    (record) => [record.source_id, record]
  )
);

function parseJsonLdNodes(html) {
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  const nodes = [];

  let match;

  while ((match = pattern.exec(html)) !== null) {
    const parsed = JSON.parse(match[1].trim());

    const blockNodes =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

    for (const node of blockNodes) {
      if (
        node &&
        typeof node === 'object' &&
        !Array.isArray(node)
      ) {
        nodes.push(node);
      }
    }
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

function capturedPath(sourceId) {
  const record = recordsById.get(sourceId);
  assert.ok(record, sourceId);

  return (
    './data/raw/CD-008-authority-capture/' +
    record.filename
  );
}

test('authority completeness audit output is pinned exactly', () => {
  assert.equal(
    sha256(auditPath),
    '7d191faae7eabc2703d59327c7826510217534b20143dab96b361d3449b62822'
  );
  assert.equal(
    audit.study_id,
    'CD-WORKLOAD-20260831-008'
  );
  assert.equal(
    audit.audit_id,
    'CD008-AUTHORITY-COMPLETENESS-AUDIT-1.0'
  );
  assert.equal(
    audit.status,
    'AUTHORITY_COMPLETENESS_AUDIT_COMPLETE'
  );
  assert.equal(
    audit.protocol_git_head,
    '42c9f6cbd338d566f187cb76ef62bf51f3e90cae'
  );
  assert.equal(
    audit.frozen_inputs.audit_plan.sha256,
    sha256('./' + audit.frozen_inputs.audit_plan.path)
  );
  assert.equal(
    audit.frozen_inputs.prospective_graph_schema.sha256,
    sha256(
      './' +
        audit.frozen_inputs.prospective_graph_schema.path
    )
  );
  assert.equal(
    audit.frozen_inputs.audit_runner.sha256,
    sha256('./' + audit.frozen_inputs.audit_runner.path)
  );
});

test('primary decision preserves the exact binding-censored result', () => {
  assert.equal(
    audit.result.primary_decision,
    'AUTHORITY_BINDING_CENSORED_BEFORE_TARGET_CONSTRUCTION'
  );
  assert.equal(
    audit.result.authority_complete_and_unambiguous,
    false
  );
  assert.equal(audit.result.selector_pass_count, 11);
  assert.equal(audit.result.selector_required_count, 11);
  assert.equal(audit.result.governed_leaf_pass_count, 63);
  assert.equal(audit.result.governed_leaf_count, 63);
  assert.equal(audit.result.relationship_pass_count, 9);
  assert.equal(audit.result.relationship_count, 10);
  assert.equal(audit.result.rights_leaf_pass_count, 8);
  assert.equal(audit.result.rights_leaf_count, 8);
  assert.equal(
    audit.result.cross_source_check_pass_count,
    16
  );
  assert.equal(audit.result.cross_source_check_count, 17);
  assert.equal(
    audit.result.unresolved_availability_issue_count,
    0
  );
  assert.equal(
    audit.result.unresolved_ambiguity_issue_count,
    0
  );
  assert.equal(
    audit.result.unresolved_binding_issue_count,
    1
  );
});

test('only the Naturepedia reference-implementation binding fails', () => {
  const incomplete = audit.relationship_results.filter(
    (relationship) => !relationship.relationship_complete
  );

  assert.deepEqual(incomplete, [
    {
      relationship_id: 'has_reference_implementation',
      selector_pass: true,
      required_field_pass_count: 4,
      required_field_count: 4,
      binding_check_pass_count: 1,
      binding_check_count: 2,
      relationship_complete: false
    }
  ]);

  assert.deepEqual(audit.issues, {
    availability: [],
    ambiguity: [],
    binding: [
      {
        code: 'CROSS_SOURCE_BINDING_FAILED',
        location:
          'relationship.has_reference_implementation.binding_check.2'
      }
    ]
  });
});

test('failed binding is an exact meaningful-mark mismatch not missing evidence', () => {
  const relationship = schema.relationships.find(
    (item) =>
      item.relationship_id ===
      'has_reference_implementation'
  );

  assert.ok(relationship);

  const bindingSource = readJson(
    capturedPath(relationship.binding.source_id)
  );

  const targetHtml = readText(
    capturedPath(
      relationship.target_selector.source_id
    )
  );

  const matches = parseJsonLdNodes(targetHtml).filter(
    (node) =>
      exactPredicateMatch(
        node,
        relationship.target_selector.predicates
      )
  );

  assert.equal(matches.length, 1);

  const target = matches[0];

  const bindingName =
    bindingSource.referenceImplementation.name;

  const bindingUrl =
    bindingSource.referenceImplementation.url;

  assert.equal(bindingUrl, target.url);
  assert.notEqual(bindingName, target.name);
  assert.equal(
    target.name.replace(/\u2122/g, ''),
    bindingName
  );
  assert.equal(
    plan.deterministic_extraction.trademark_omission_allowed,
    false
  );
  assert.equal(
    plan.deterministic_extraction.normalization_allowed,
    false
  );
});

test('all 63 governed leaves retain unique digest-only provenance', () => {
  assert.equal(audit.provenance_support.length, 63);
  assert.equal(
    new Set(
      audit.provenance_support.map(
        (item) => item.leaf_id
      )
    ).size,
    63
  );
  assert.equal(
    audit.result.provenance_support_count,
    63
  );

  for (const support of audit.provenance_support) {
    const record = recordsById.get(support.source_id);
    assert.ok(record, support.leaf_id);
    assert.equal(
      support.source_sha256,
      record.sha256,
      support.leaf_id
    );
    assert.match(
      support.value_sha256,
      /^[0-9a-f]{64}$/,
      support.leaf_id
    );
    assert.ok(support.locator.length > 0);
    assert.deepEqual(
      Object.keys(support).sort(),
      [
        'leaf_id',
        'locator',
        'source_id',
        'source_sha256',
        'value_sha256',
        'value_type'
      ]
    );
  }

  assert.equal(audit.result.raw_target_values_emitted, false);
  assert.equal(
    audit.result.completed_target_constructed,
    false
  );
});

test('binding corroboration and content-equivalence records are complete', () => {
  assert.equal(audit.binding_support.length, 10);
  assert.equal(audit.corroboration_support.length, 2);
  assert.equal(
    audit.content_equivalence.unique_response_body_count,
    13
  );
  assert.equal(
    audit.content_equivalence
      .duplicate_group_counted_as_independent_support,
    false
  );
  assert.deepEqual(
    audit.content_equivalence.duplicate_groups,
    [
      {
        sha256:
          '79bf98dbd31b8e9beffa1b8fab0289fcbfaa7c9999c0154d3da23ef13ccb98b5',
        source_ids: [
          'CD008-AUTH-S005',
          'CD008-AUTH-S013'
        ]
      }
    ]
  );
});

test('failed gate blocks target model payment economics and repair', () => {
  assert.equal(
    audit.next_step_boundary
      .independent_target_construction_protocol_permitted,
    false
  );
  assert.equal(
    audit.next_step_boundary.target_constructed_by_audit,
    false
  );
  assert.equal(
    audit.next_step_boundary.target_construction_performed,
    false
  );
  assert.equal(
    audit.next_step_boundary.model_measurement_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.p2_probe_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.p3_retrieval_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.x402_payment_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.economic_comparison_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.production_repair_authorized,
    false
  );
  assert.equal(
    audit.next_step_boundary.recapture_authorized,
    false
  );

  assert.deepEqual(audit.actions_performed, {
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
  });
});
