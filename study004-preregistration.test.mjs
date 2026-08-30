import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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


const target = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json'
);
const authority = readJson(
  './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
);
const quality = readJson(
  './data/CD-WORKLOAD-20260829-004-quality-contract.json'
);
const metadata = readJson(
  './data/CD-WORKLOAD-20260829-004-task-metadata.json'
);
const provider = readJson(
  './data/CD-WORKLOAD-20260829-004-provider.json'
);
const manifest = readJson(
  './data/CD-WORKLOAD-20260829-004-preregistration-manifest.json'
);


test('preregistration manifest freezes every required artifact', () => {
  assert.equal(
    manifest.status,
    'QUALITY_TASK_PROVIDER_AND_EVALUATOR_FROZEN_PRE_MEASUREMENT'
  );

  for (const artifact of manifest.artifacts) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
  }

  assert.deepEqual(manifest.frozen_state, {
    public_authority_package_frozen: true,
    target_representation_frozen: true,
    quality_contract_frozen: true,
    neutral_task_frozen: true,
    task_visibility_boundary_frozen: true,
    provider_configuration_frozen: true,
    evaluator_frozen: true,
    p1_measurement_started: false,
    p2_eligibility_probe_started: false,
    p2_measurement_started: false,
    p3_payment_performed: false,
    economic_comparison_performed: false
  });
});


test('quality contract pins the independent target and authority package', () => {
  assert.equal(
    quality.target_representation.sha256,
    sha256(
      './data/CD-WORKLOAD-20260829-004-enriched-biography-target-representation.json'
    )
  );
  assert.equal(
    quality.authority_package.sha256,
    sha256(
      './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
    )
  );
  assert.equal(quality.comparison_model.type, 'DETERMINISTIC_SEMANTIC_GRAPH_SUBSET');
  assert.equal(quality.comparison_model.partial_credit_changes_primary_pass, false);
});


test('all nine target relationships remain mandatory', () => {
  const expectedNames = target.representation.relationships.map(
    (item) => item.relationship
  );
  const authorityNames = authority.relationship_coverage.map(
    (item) => item.relationship
  );
  const expectedIds = target.representation.relationships.map(
    (item) => item.relationship_id
  );

  assert.equal(expectedNames.length, 9);
  assert.deepEqual(authorityNames, expectedNames);
  assert.deepEqual(quality.relationship_gate.required_relationship_ids, expectedIds);
  assert.equal(quality.relationship_gate.required_relationship_count, 9);
  assert.equal(quality.relationship_gate.all_relationships_required, true);
  assert.equal(
    quality.relationship_gate
      .all_contract_required_target_facts_required_per_relationship,
    true
  );
  assert.equal(
    Object.keys(
      quality.relationship_gate.required_target_fields_by_relationship
    ).length,
    9
  );
  assert.equal(
    quality.provenance_gate.all_relationships_require_traceable_provenance,
    true
  );
});


test('neutral task names the scope but does not expose evaluator-only files', () => {
  const task = readText('./prompts/CD-WORKLOAD-20260829-004-neutral-task.txt');

  for (const relationship of target.representation.relationships) {
    assert.match(task, new RegExp(relationship.relationship.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(task, /CD004-QC-1\.0/);
  assert.doesNotMatch(task, /CD004-EVAL-1\.0/);
  assert.doesNotMatch(task, /TARGET-1\.0/);
  assert.equal(metadata.visibility_assertions.target_representation_visible_to_p1_p2, false);
  assert.equal(metadata.visibility_assertions.quality_contract_visible_to_p1_p2, false);
  assert.equal(metadata.visibility_assertions.evaluator_visible_to_p1_p2, false);
  assert.equal(metadata.visibility_assertions.protected_p3_payload_visible_to_p1_p2, false);
});


test('frozen model-visible input composition is exactly reproducible', () => {
  const task = readText('./prompts/CD-WORKLOAD-20260829-004-neutral-task.txt').trim();
  const study004Authority = readText(
    './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
  ).trim();
  const inheritedAuthority = readText(
    './data/CD-WORKLOAD-20260829-002-public-authority-sources.json'
  ).trim();
  const input =
    task +
    '\n\nSTUDY 004 PUBLIC AUTHORITY PACKAGE BEGIN\n\n' +
    study004Authority +
    '\n\nSTUDY 004 PUBLIC AUTHORITY PACKAGE END\n\n' +
    'INHERITED PUBLIC AUTHORITY EVIDENCE BEGIN\n\n' +
    inheritedAuthority +
    '\n\nINHERITED PUBLIC AUTHORITY EVIDENCE END';
  const hash = createHash('sha256').update(input).digest('hex');

  assert.equal(Buffer.byteLength(input), metadata.model_visible_input_composition.byte_count);
  assert.equal(hash, metadata.model_visible_input_composition.sha256);
  assert.equal(metadata.model_visible_input_composition.p1_p2_exact_input_match_required, true);
});


test('P2 availability is not inherited or synthesized', () => {
  assert.equal(
    provider.p2_eligibility_configuration.status,
    'NOT_YET_PROBED_FOR_EXACT_STUDY004_INPUT'
  );
  assert.equal(provider.p2_eligibility_configuration.synthetic_cache_hit_allowed, false);
  assert.equal(metadata.p2_boundary.study003_cache_eligibility_inherited, false);
  assert.equal(metadata.p2_boundary.study004_exact_input_probe_required, true);
  assert.equal(metadata.p2_boundary.measurement_allowed_before_cache_read_observed, false);
});


test('P3 payment remains blocked until a valid baseline exists', () => {
  assert.equal(provider.p3_configuration.price_usdc, '0.025');
  assert.equal(provider.p3_configuration.price_atomic_units, '25000');
  assert.equal(provider.p3_configuration.rights_count_Krights, 1);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
  assert.equal(manifest.payment_gate.p3_payment_allowed_now, false);
  assert.equal(quality.p3_boundary.payment_forbidden_until_valid_quality_equivalent_baseline_exists, true);
});


test('deterministic evaluator preflight passes without measurement', () => {
  const result = spawnSync(
    'python3',
    ['scripts/evaluate-study004.py', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CANONICAL_PASS_FIXTURE: True/);
  assert.match(result.stdout, /MISSING_RELATIONSHIP_REJECTED: True/);
  assert.match(result.stdout, /OBSERVATION_READ: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
});


test('the next action is P1 measurement, not P2 or P3', () => {
  assert.equal(
    manifest.next_artifact.type,
    'P1_FRESH_RECONSTRUCTION_RUNNER_AND_FIRST_MEASUREMENT'
  );
  assert.equal(manifest.next_artifact.required_before_p2_probe, true);
  assert.equal(manifest.next_artifact.p3_payment_allowed, false);
});
