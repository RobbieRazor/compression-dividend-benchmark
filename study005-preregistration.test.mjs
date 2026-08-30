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


const schema = readJson(
  './data/CD-WORKLOAD-20260830-005-neutral-schema.json'
);
const targetRecord = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json'
);
const authority = readJson(
  './data/CD-WORKLOAD-20260830-005-enriched-biography-public-authority-package.json'
);
const quality = readJson(
  './data/CD-WORKLOAD-20260830-005-quality-contract.json'
);
const metadata = readJson(
  './data/CD-WORKLOAD-20260830-005-task-metadata.json'
);
const provider = readJson(
  './data/CD-WORKLOAD-20260830-005-provider.json'
);
const manifest = readJson(
  './data/CD-WORKLOAD-20260830-005-preregistration-manifest.json'
);


test('preregistration manifest pins every Study 005 premeasurement artifact', () => {
  assert.equal(
    manifest.status,
    'QUALITY_SCHEMA_TASK_PROVIDER_AND_EVALUATOR_FROZEN_PRE_MEASUREMENT'
  );

  for (const artifact of manifest.artifacts) {
    assert.equal(sha256(`./${artifact.path}`), artifact.sha256, artifact.role);
  }

  assert.equal(manifest.frozen_state.design_frozen, true);
  assert.equal(manifest.frozen_state.neutral_schema_frozen, true);
  assert.equal(manifest.frozen_state.public_authority_evidence_frozen, true);
  assert.equal(manifest.frozen_state.target_representation_frozen, true);
  assert.equal(manifest.frozen_state.quality_contract_frozen, true);
  assert.equal(manifest.frozen_state.neutral_task_frozen, true);
  assert.equal(manifest.frozen_state.task_visibility_boundary_frozen, true);
  assert.equal(manifest.frozen_state.provider_configuration_frozen, true);
  assert.equal(manifest.frozen_state.evaluator_frozen, true);
  assert.equal(manifest.frozen_state.runner_frozen, false);
  assert.equal(manifest.frozen_state.p1_measurement_started, false);
  assert.equal(manifest.frozen_state.p2_eligibility_probe_started, false);
  assert.equal(manifest.frozen_state.p3_payment_performed, false);
  assert.equal(manifest.frozen_state.economic_comparison_performed, false);
});


test('quality contract pins the target, authority control, and visible neutral schema', () => {
  assert.equal(
    quality.target_representation.sha256,
    sha256('./data/CD-WORKLOAD-20260830-005-enriched-biography-target-representation.json')
  );
  assert.equal(
    quality.authority_freeze.sha256,
    sha256('./data/CD-WORKLOAD-20260830-005-enriched-biography-public-authority-package.json')
  );
  assert.equal(
    quality.neutral_schema.sha256,
    sha256('./data/CD-WORKLOAD-20260830-005-neutral-schema.json')
  );
  assert.equal(quality.target_representation.model_visible_to_p1_p2, false);
  assert.equal(quality.authority_freeze.model_visible_to_p1_p2, false);
  assert.equal(quality.neutral_schema.model_visible_to_p1_p2, true);
  assert.equal(quality.neutral_schema.contains_protected_target_values, false);
});


test('strict gate requires exact placement and all 52 relationship target fields', () => {
  const target = targetRecord.target;
  const totalTargetFields = target.relationships
    .reduce((sum, item) => sum + Object.keys(item.target).length, 0);

  assert.equal(quality.comparison_model.field_aliases_allowed, false);
  assert.equal(quality.comparison_model.relocated_values_credited, false);
  assert.equal(quality.comparison_model.extra_schema_governed_fields_allowed, false);
  assert.deepEqual(quality.schema_gate.exact_root_fields, schema.required);
  assert.deepEqual(quality.schema_gate.exact_subject_fields, schema.$defs.subject.required);
  assert.deepEqual(
    quality.schema_gate.exact_main_entity_fields,
    schema.$defs.subject.properties.main_entity.required
  );
  assert.deepEqual(
    quality.schema_gate.exact_relationship_fields,
    schema.$defs.relationship_shell.required
  );
  assert.deepEqual(
    quality.schema_gate.exact_rights_fields,
    schema.$defs.retrieval_rights_boundary.required
  );
  assert.equal(quality.schema_gate.relationship_count, 9);
  assert.equal(totalTargetFields, 52);
  assert.equal(quality.relationship_gate.required_target_field_count_total, 52);
  assert.deepEqual(
    quality.relationship_gate.required_relationships,
    target.relationships.map((item) => item.relationship)
  );

  for (const relationship of target.relationships) {
    assert.deepEqual(
      quality.relationship_gate
        .required_target_fields_by_relationship[relationship.relationship],
      Object.keys(relationship.target),
      relationship.relationship
    );
  }

  assert.equal(quality.provenance_gate.all_relationships_require_traceable_provenance, true);
  assert.equal(quality.retrieval_rights_gate.all_rights_values_required, true);
  assert.equal(quality.comparison_model.partial_credit_changes_primary_pass, false);
});


test('neutral task exposes placement instructions but not protected target values', () => {
  const task = readText('./prompts/CD-WORKLOAD-20260830-005-neutral-task.txt');

  for (const relationship of targetRecord.target.relationships) {
    assert.match(
      task,
      new RegExp(relationship.relationship.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    );
  }

  for (const rootField of schema.required) {
    assert.match(task, new RegExp(rootField));
  }

  assert.doesNotMatch(task, /robbie-george#robbie-george-biography-plate/);
  assert.doesNotMatch(task, /who-is-robbie-george#robbie-george-biography-plate/);
  assert.doesNotMatch(task, /ProfilePage/);
  assert.doesNotMatch(task, /0\.9-draft/);
  assert.doesNotMatch(task, /0\.025/);
  assert.doesNotMatch(task, /25000/);
  assert.doesNotMatch(task, /CD005-QC-1\.0/);
  assert.doesNotMatch(task, /CD005-STRICT-SCHEMA-EVAL-1\.0/);
  assert.doesNotMatch(task, /SCHEMA-TARGET-1\.0/);
  assert.doesNotMatch(task, /structural adjudication/i);
  assert.doesNotMatch(task, /local alias/i);
});


test('model-visible input composition is exactly reproducible', () => {
  const task = readText('./prompts/CD-WORKLOAD-20260830-005-neutral-task.txt').trim();
  const schemaText = readText(
    './data/CD-WORKLOAD-20260830-005-neutral-schema.json'
  ).trim();
  const publicAuthority = readText(
    './data/CD-WORKLOAD-20260829-004-enriched-biography-public-authority-package.json'
  ).trim();
  const inheritedAuthority = readText(
    './data/CD-WORKLOAD-20260829-002-public-authority-sources.json'
  ).trim();
  const delimiters = provider.request_input_delimiters;
  const input =
    task +
    '\n\n' + delimiters.neutral_schema_begin +
    '\n\n' + schemaText +
    '\n\n' + delimiters.neutral_schema_end +
    '\n\n' + delimiters.public_authority_begin +
    '\n\n' + publicAuthority +
    '\n\n' + delimiters.public_authority_end +
    '\n\n' + delimiters.inherited_authority_begin +
    '\n\n' + inheritedAuthority +
    '\n\n' + delimiters.inherited_authority_end;
  const hash = createHash('sha256').update(input).digest('hex');

  assert.equal(metadata.model_visible_inputs.length, 4);
  assert.equal(Buffer.byteLength(input), metadata.model_visible_input_composition.byte_count);
  assert.equal(hash, metadata.model_visible_input_composition.sha256);
  assert.equal(metadata.model_visible_input_composition.p1_p2_exact_input_match_required, true);

  for (const item of metadata.model_visible_inputs) {
    assert.equal(sha256(`./${item.path}`), item.sha256, item.role);
  }
});


test('only the schema intervention changes model-visible authority conditions', () => {
  const reused = metadata.model_visible_inputs
    .filter((item) => item.introduced_relative_to_study004 === false);

  assert.equal(reused.length, 2);
  assert.equal(reused.every((item) => item.byte_content_changed_relative_to_study004 === false), true);
  assert.equal(manifest.experimental_control.study004_public_authority_bytes_preserved, true);
  assert.equal(manifest.experimental_control.inherited_public_authority_bytes_preserved, true);
  assert.equal(manifest.experimental_control.value_free_neutral_schema_added, true);
  assert.equal(manifest.experimental_control.schema_matching_task_instructions_added, true);
  assert.equal(manifest.experimental_control.protected_target_values_added_to_model_input, false);
  assert.equal(
    manifest.experimental_control.study004_output_or_failure_diagnostics_added_to_model_input,
    false
  );
  assert.equal(authority.evidence_reuse_rule.study004_model_visible_authority_bytes_preserved, true);
});


test('target, evaluator, contract, and failure diagnostics remain hidden', () => {
  assert.equal(metadata.visibility_assertions.neutral_schema_visible_to_p1, true);
  assert.equal(metadata.visibility_assertions.target_representation_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.quality_contract_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.evaluator_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.protected_p3_payload_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.study004_model_output_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.study004_quality_evaluation_visible_to_p1, false);
  assert.equal(metadata.visibility_assertions.study004_structural_adjudication_visible_to_p1, false);
  assert.equal(provider.visibility_boundary.study004_failure_diagnostics_visible_to_p1_p2, false);
  assert.equal(provider.visibility_boundary.external_knowledge_allowed, false);
});


test('provider freezes one fresh feasibility observation without cache credit', () => {
  assert.equal(provider.model, 'gpt-5.6-luna');
  assert.equal(provider.reasoning_effort, 'none');
  assert.equal(provider.text_verbosity, 'low');
  assert.equal(provider.max_output_tokens, 8192);
  assert.equal(provider.store, false);
  assert.equal(provider.p1_configuration.class, 'PURE_RECOMPUTATION');
  assert.equal(provider.p1_configuration.prompt_cache_mode, 'explicit');
  assert.equal(provider.p1_configuration.explicit_breakpoints, 0);
  assert.equal(provider.p1_configuration.prompt_cache_key, null);
  assert.equal(provider.p1_configuration.planned_observations_in_feasibility_phase, 1);
  assert.equal(provider.p1_configuration.automatic_retry_allowed, false);
  assert.equal(metadata.feasibility_boundary.one_pass_establishes_initial_feasibility, true);
  assert.equal(metadata.feasibility_boundary.one_pass_establishes_stable_cost_calibration, false);
  assert.equal(metadata.feasibility_boundary.rejected_observation_cost_eligible_as_baseline, false);
});


test('deterministic strict-schema evaluator preflight rejects structural defects', () => {
  const result = spawnSync(
    'python3',
    ['scripts/evaluate-study005.py', '--preflight'],
    {
      cwd: new URL('.', import.meta.url),
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /TARGET_FIELDS_REQUIRED: 52/);
  assert.match(result.stdout, /CANONICAL_PASS_FIXTURE: True/);
  assert.match(result.stdout, /MISSING_RELATIONSHIP_REJECTED: True/);
  assert.match(result.stdout, /RELOCATED_VALUE_REJECTED: True/);
  assert.match(result.stdout, /EXTRA_FIELD_REJECTED: True/);
  assert.match(result.stdout, /MALFORMED_TYPES_REJECTED: True/);
  assert.match(result.stdout, /OBSERVATION_READ: False/);
  assert.match(result.stdout, /API_CALL_PERFORMED: False/);
  assert.match(result.stdout, /X402_PAYMENT_PERFORMED: False/);
  assert.match(result.stdout, /PREFLIGHT_PASS: True/);
});


test('P2, P3, and economics remain blocked behind an accepted P1', () => {
  assert.equal(provider.p2_eligibility_configuration.status, 'BLOCKED_UNTIL_ACCEPTED_STUDY005_P1');
  assert.equal(provider.p2_eligibility_configuration.accepted_p1_required_before_probe, true);
  assert.equal(provider.p2_eligibility_configuration.synthetic_cache_hit_allowed, false);
  assert.equal(metadata.p2_boundary.probe_allowed_before_accepted_p1, false);
  assert.equal(metadata.p2_boundary.study004_cache_eligibility_inherited, false);
  assert.equal(provider.p3_configuration.payment_allowed_now, false);
  assert.equal(manifest.payment_gate.p2_probe_allowed_now, false);
  assert.equal(manifest.payment_gate.p3_payment_allowed_now, false);
  assert.equal(manifest.frozen_state.economic_comparison_performed, false);
  assert.equal(
    manifest.next_artifact.type,
    'P1_FRESH_RECONSTRUCTION_RUNNER_AND_SINGLE_FEASIBILITY_MEASUREMENT'
  );
  assert.equal(manifest.next_artifact.required_before_p2_probe, true);
});
