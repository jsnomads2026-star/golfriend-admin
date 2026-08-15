// ==========================================
// FILE: test/fixtures/mondayAuthorityWorld.mjs
// The Admin / Partner Portal AUTHORITY section of the canonical V2 Monday Test World.
//
// Conventions are inherited from the Example World contract
// (golfriend-example-world/test/fixtures/exampleWorldContract.js): the `dev_mock`
// namespace, deterministic ids, a named seed, and a frozen contract object. Ids here use
// the `dev_mock_mtw_*` prefix so an authority fixture can never be mistaken for a golfer
// persona, and so a stray fixture id is obvious in any log.
//
// PRINCIPAL IDENTITY IS THE IMMUTABLE `principalId`. NEVER THE EMAIL ADDRESS.
// Two fixtures deliberately share one address with different principal ids, because that
// is the shape that broke a real call site: b2b_partners is email-keyed during the
// webhook-buffer window, so an address was briefly enough to be treated as a partner. An
// address is a contact detail and a collision is expected; only `principalId` binds.
//
// TEST-ONLY. Nothing here is written anywhere. There is no Firestore client, no
// credential, no network call and no runtime seeding — `seed()` returns an in-memory
// object and the tooling asserts that the world it builds is byte-identical each time.
// ==========================================

export const WORLD_ID = 'monday-test-world.authority';
export const WORLD_VERSION = '1.0.0';
export const WORLD_SEED = 'monday-authority-default-seed';
export const NAMESPACE = 'dev_mock';

/**
 * Deterministic RNG, matching the Example World's xorshift so a shared seed produces the
 * same stream in both worlds. Only used for filler; every meaningful fixture is explicit,
 * because a scenario that depends on a random draw is not a scenario.
 */
export function makeRng(seed) {
  let state = 0;
  for (let i = 0; i < String(seed).length; i += 1) {
    state = (state * 31 + String(seed).charCodeAt(i)) >>> 0;
  }
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return (state >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- organizations ------
export const ORGANIZATIONS = Object.freeze([
  Object.freeze({
    organizationId: 'dev_mock_mtw_org_active',
    label: 'Active Partner Organization',
    status: 'active',
    primaryOwnerPrincipalId: 'dev_mock_mtw_prn_partner_owner',
    authorizedCourseIds: ['dev_mock_mtw_course_01'],
    version: 3,
  }),
  Object.freeze({
    organizationId: 'dev_mock_mtw_org_suspended',
    label: 'Suspended Partner Organization',
    status: 'suspended',
    primaryOwnerPrincipalId: 'dev_mock_mtw_prn_partner_mgr_suspended_org',
    authorizedCourseIds: ['dev_mock_mtw_course_02'],
    version: 7,
  }),
  Object.freeze({
    organizationId: 'dev_mock_mtw_org_deactivated',
    label: 'Deactivated Partner Organization',
    status: 'deactivated',
    primaryOwnerPrincipalId: 'dev_mock_mtw_prn_partner_mgr_deactivated_org',
    authorizedCourseIds: [],
    version: 11,
  }),
  Object.freeze({
    organizationId: 'dev_mock_mtw_org_other',
    label: 'Unrelated Organization (cross-organization attacks)',
    status: 'active',
    primaryOwnerPrincipalId: 'dev_mock_mtw_prn_partner_mgr_other_org',
    authorizedCourseIds: ['dev_mock_mtw_course_03'],
    version: 2,
  }),
]);

// -------------------------------------------------------------------- identities ------
/**
 * Every identity the authority surfaces must handle. `adminDoc` is the admin_users record
 * as stored (or null when there is none); `partner` describes membership where one exists.
 *
 * `expect.staff` / `expect.director` are the REQUIRED verdicts of the shared predicate.
 * They are part of the fixture, not derived from the implementation — otherwise the world
 * would agree with whatever the code happens to do.
 */
export const IDENTITIES = Object.freeze([
  // ---- Admin staff -------------------------------------------------------------------
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_dir_active',
    label: 'Active Director',
    contactEmail: 'mtw-director@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Director', status: 'Active' }),
    partner: null,
    expect: Object.freeze({ staff: true, director: true, portal: 'authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_dir_suspended',
    label: 'Suspended Director',
    contactEmail: 'mtw-director-suspended@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Director', status: 'Suspended' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'suspended' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_admin_active',
    label: 'Active Admin (Manager tier)',
    contactEmail: 'mtw-admin@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Manager', status: 'Active' }),
    partner: null,
    expect: Object.freeze({ staff: true, director: false, portal: 'authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_admin_suspended',
    label: 'Suspended Admin',
    contactEmail: 'mtw-admin-suspended@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Manager', status: 'Suspended' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'suspended' }),
  }),

  // ---- Malformed / legacy admin records ---------------------------------------------
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_missing_status',
    label: 'Missing-status user (the legacy shape the old denylist admitted)',
    contactEmail: 'mtw-missing-status@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Director' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_null_status',
    label: 'Null-status user',
    contactEmail: 'mtw-null-status@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Manager', status: null }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_malformed_status',
    label: 'Malformed-status user (wrong type)',
    contactEmail: 'mtw-malformed@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Manager', status: 42 }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_unknown_status',
    label: 'Unknown-status user (a value nobody wrote down)',
    contactEmail: 'mtw-unknown-status@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Manager', status: 'Archived' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_missing_role',
    label: 'Missing-role user (active but no role assigned)',
    contactEmail: 'mtw-missing-role@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ status: 'Active' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_unknown_role',
    label: 'Unknown-role user (active, role outside the known vocabulary)',
    contactEmail: 'mtw-unknown-role@example.test',
    emailVerified: true,
    // NOTE: the predicate accepts any non-empty role, so this identity IS staff today.
    // The fixture records that truthfully rather than asserting the behaviour we might
    // prefer — and OPERATOR_DECISION_MANIFEST records the missing role allowlist.
    adminDoc: Object.freeze({ role: 'intern', status: 'Active' }),
    partner: null,
    expect: Object.freeze({ staff: true, director: false, portal: 'authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_case_variant',
    label: 'Whitespace/case status variant (canonically equivalent, therefore accepted)',
    contactEmail: 'mtw-case-variant@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Support', status: '  ACTIVE  ' }),
    partner: null,
    expect: Object.freeze({ staff: true, director: false, portal: 'authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_confusable',
    label: 'Confusable status (Cyrillic A — looks active, is not)',
    contactEmail: 'mtw-confusable@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Support', status: 'Аctive' }),
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),

  // ---- Dual role: staff AND partner --------------------------------------------------
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_dual_role',
    label: 'Dual-role user (active Admin AND active partner manager)',
    contactEmail: 'mtw-dual@example.test',
    emailVerified: true,
    adminDoc: Object.freeze({ role: 'Support', status: 'Active' }),
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 4,
    }),
    expect: Object.freeze({ staff: true, director: false, portal: 'authorized' }),
  }),

  // ---- Partner principals -------------------------------------------------------------
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_owner',
    label: 'Active Partner primary owner',
    contactEmail: 'mtw-partner-owner@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'primary_owner',
      membershipStatus: 'active',
      membershipVersion: 5,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_mgr_active',
    label: 'Active Partner manager',
    contactEmail: 'mtw-partner-manager@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 6,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_mgr_suspended',
    label: 'Suspended Partner manager (membership revoked)',
    contactEmail: 'mtw-partner-manager-suspended@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'manager',
      membershipStatus: 'revoked',
      membershipVersion: 8,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_denied' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_mgr_suspended_org',
    label: 'Active manager inside a SUSPENDED organization',
    contactEmail: 'mtw-partner-suspended-org@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_suspended',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 2,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_denied' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_mgr_deactivated_org',
    label: 'Active manager inside a DEACTIVATED organization',
    contactEmail: 'mtw-partner-deactivated-org@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_deactivated',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 1,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_denied' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_mgr_other_org',
    label: 'Manager of an UNRELATED organization (cross-organization attacks)',
    contactEmail: 'mtw-partner-other-org@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_other',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 3,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_partner_rep',
    label: 'Partner representative (read-only tier)',
    contactEmail: 'mtw-partner-rep@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'viewer',
      membershipStatus: 'active',
      membershipVersion: 1,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_authorized' }),
  }),

  // ---- Unverified address, and the duplicate-address pair ------------------------------
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_unverified',
    label: 'Unverified-email user',
    contactEmail: 'mtw-collision@example.test',
    emailVerified: false,
    adminDoc: null,
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_collision_a',
    label: 'Duplicate-address identity A — genuine partner, VERIFIED address',
    // Deliberately the SAME address as dev_mock_mtw_prn_unverified and _collision_b.
    // An address is a contact detail; only principalId binds authority.
    contactEmail: 'mtw-collision@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: Object.freeze({
      organizationId: 'dev_mock_mtw_org_active',
      role: 'manager',
      membershipStatus: 'active',
      membershipVersion: 9,
    }),
    expect: Object.freeze({ staff: false, director: false, portal: 'partner_authorized' }),
  }),
  Object.freeze({
    principalId: 'dev_mock_mtw_prn_collision_b',
    label: 'Duplicate-address identity B — impostor, no authority anywhere',
    contactEmail: 'mtw-collision@example.test',
    emailVerified: true,
    adminDoc: null,
    partner: null,
    expect: Object.freeze({ staff: false, director: false, portal: 'unauthorized' }),
  }),
]);

// -------------------------------------------- legacy admin_users status dataset -------
/**
 * The migration dataset. Separate from IDENTITIES because it models RECORDS AS STORED,
 * including shapes no current writer can produce — which is exactly the population a
 * migration has to survive.
 *
 * `classification` is the required verdict of the dry-run classifier.
 */
export const LEGACY_STATUS_RECORDS = Object.freeze([
  Object.freeze({ principalId: 'dev_mock_mtw_leg_01', data: { role: 'Director', status: 'Active' }, classification: 'active', authorizes: true }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_02', data: { role: 'Manager', status: 'active' }, classification: 'active', authorizes: true }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_03', data: { role: 'Support', status: '  ACTIVE  ' }, classification: 'active', authorizes: true }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_04', data: { role: 'Support', status: '\tActive\n' }, classification: 'active', authorizes: true }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_05', data: { role: 'Director', status: 'Suspended' }, classification: 'inactive_suspended', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_06', data: { role: 'Manager', status: 'inactive' }, classification: 'inactive_inactive', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_07', data: { role: 'Manager' }, classification: 'missing_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_08', data: { role: 'Manager', status: null }, classification: 'missing_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_09', data: { role: 'Manager', status: '' }, classification: 'blank_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_10', data: { role: 'Manager', status: '   ' }, classification: 'blank_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_11', data: { role: 'Manager', status: 42 }, classification: 'malformed_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_12', data: { role: 'Manager', status: true }, classification: 'malformed_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_13', data: { role: 'Manager', status: ['Active'] }, classification: 'malformed_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_14', data: { role: 'Manager', status: 'Archived' }, classification: 'unknown_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_15', data: { role: 'Manager', status: 'Аctive' }, classification: 'unknown_status', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_16', data: null, classification: 'malformed_record', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_17', data: { status: 'Active' }, classification: 'active', authorizes: false }),
  Object.freeze({ principalId: 'dev_mock_mtw_leg_18', data: { role: '   ', status: 'Active' }, classification: 'active', authorizes: false }),
]);

/**
 * A SECOND dataset in which no active Director survives. Activation must be refused for
 * this population even though several records are individually fine — because there would
 * be no in-product way back in.
 */
export const LEGACY_NO_SURVIVING_DIRECTOR = Object.freeze([
  Object.freeze({ principalId: 'dev_mock_mtw_nsd_01', data: { role: 'Director', status: 'Suspended' } }),
  Object.freeze({ principalId: 'dev_mock_mtw_nsd_02', data: { role: 'Director' } }),
  Object.freeze({ principalId: 'dev_mock_mtw_nsd_03', data: { role: 'Manager', status: 'Active' } }),
]);

/** A wholly conforming population, so "refused" is proved to be a decision and not a stub. */
export const LEGACY_CONFORMING = Object.freeze([
  Object.freeze({ principalId: 'dev_mock_mtw_ok_01', data: { role: 'Director', status: 'Active' } }),
  Object.freeze({ principalId: 'dev_mock_mtw_ok_02', data: { role: 'Manager', status: 'Active' } }),
  Object.freeze({ principalId: 'dev_mock_mtw_ok_03', data: { role: 'Support', status: 'Suspended' } }),
]);

// ------------------------------------------------------------------ App Check ---------
/**
 * Deterministic attestation evidence. `stage` is the commissioning stage the case is
 * evaluated under; `expect` is the required decision code.
 */
export const APP_CHECK_EVIDENCE = Object.freeze([
  Object.freeze({ id: 'ac_ready', stage: 'enforced', evidence: { appId: 'dev_mock_mtw_app', projectId: '__EXPECTED__', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_ready' }, expect: 'allowed' }),
  Object.freeze({ id: 'ac_web_not_required', stage: 'monitoring', evidence: null, expect: 'allowed', note: 'Monitoring is the ONLY stage where absent attestation is legitimately permitted, and it reports the request as unattested.' }),
  Object.freeze({ id: 'ac_missing', stage: 'enforced', evidence: null, expect: 'app_check_required' }),
  Object.freeze({ id: 'ac_unknown_stage', stage: 'bogus_stage', evidence: { appId: 'a', projectId: '__EXPECTED__', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_u' }, expect: 'app_check_not_provisioned' }),
  Object.freeze({ id: 'ac_failed', stage: 'enforced', evidence: { appId: 'a', projectId: '__EXPECTED__', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_f', verificationError: 'jwt malformed' }, expect: 'app_check_invalid' }),
  Object.freeze({ id: 'ac_wrong_project', stage: 'enforced', evidence: { appId: 'a', projectId: 'dev_mock_mtw_other_project', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_wp' }, expect: 'app_check_project_mismatch' }),
  Object.freeze({ id: 'ac_expired', stage: 'enforced', evidence: { appId: 'a', projectId: '__EXPECTED__', issuedAt: -7200, expiresAt: -1, tokenId: 'dev_mock_mtw_tok_e' }, expect: 'app_check_invalid' }),
  Object.freeze({ id: 'ac_replayed', stage: 'enforced', evidence: { appId: 'a', projectId: '__EXPECTED__', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_replay' }, expect: 'app_check_replayed', replayOf: 'dev_mock_mtw_tok_replay' }),
  Object.freeze({ id: 'ac_current', stage: 'enforced', evidence: { appId: 'dev_mock_mtw_app', projectId: '__EXPECTED__', issuedAt: -5, expiresAt: 3600, tokenId: 'dev_mock_mtw_tok_current' }, expect: 'allowed' }),
  Object.freeze({ id: 'ac_production_default', stage: '__CURRENT__', evidence: { appId: 'a', projectId: '__EXPECTED__', issuedAt: -60, expiresAt: 1800, tokenId: 'dev_mock_mtw_tok_pd' }, expect: 'app_check_not_provisioned', note: 'The production default must refuse regardless of how good the evidence is.' }),
]);

// --------------------------------------------------------------------- scenarios ------
/**
 * Every scenario the authority section asserts. `surface` groups them for reporting;
 * `principalId` selects the actor; `expect` is the required outcome.
 *
 * `authorized` means the caller passed the AUTHORIZATION gate (it may then fail on a
 * business precondition, which is a different thing and is recorded separately).
 */
const s = (surface, principalId, expectAuthorized, note) =>
  Object.freeze({ surface, principalId, expect: Object.freeze({ authorized: expectAuthorized }), note: note || null });

export const SCENARIOS = Object.freeze([
  // ---- privileged Admin/Portal surfaces, each across the identity matrix -------------
  ...['member administration', 'template approval', 'delivery orchestration',
    'CSV conflict resolution', 'campaigns', 'partner queues', 'booking oversight',
    'claim/availability review', 'partner activation', 'outreach',
    'admin hiring/status change', 'incident reporting', 'sponsor dashboard visibility',
  ].flatMap((surface) => [
    s(surface, 'dev_mock_mtw_prn_dir_active', true, 'active Director'),
    s(surface, 'dev_mock_mtw_prn_admin_active', true, 'active Admin'),
    s(surface, 'dev_mock_mtw_prn_dir_suspended', false, 'suspended Director'),
    s(surface, 'dev_mock_mtw_prn_admin_suspended', false, 'suspended Admin'),
    s(surface, 'dev_mock_mtw_prn_missing_status', false, 'missing status'),
    s(surface, 'dev_mock_mtw_prn_missing_role', false, 'missing role'),
    s(surface, 'dev_mock_mtw_prn_unknown_status', false, 'unknown status'),
    s(surface, 'dev_mock_mtw_prn_malformed_status', false, 'malformed status'),
    s(surface, 'dev_mock_mtw_prn_confusable', false, 'confusable status'),
    s(surface, 'dev_mock_mtw_prn_partner_mgr_active', false, 'partner principal reaching an Admin surface'),
    s(surface, 'dev_mock_mtw_prn_partner_rep', false, 'partner representative reaching an Admin surface'),
    s(surface, 'dev_mock_mtw_prn_collision_b', false, 'address-collision impostor'),
    s(surface, 'dev_mock_mtw_prn_unverified', false, 'unverified address'),
  ]),
]);

/** Organization-authority scenarios, expressed against the Portal's own vocabulary. */
export const ORGANIZATION_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'org_active_manager_creates_rep', principalId: 'dev_mock_mtw_prn_partner_mgr_active', organizationId: 'dev_mock_mtw_org_active', action: 'create_representative', expectAuthorized: true }),
  Object.freeze({ id: 'org_suspended_manager_denied', principalId: 'dev_mock_mtw_prn_partner_mgr_suspended', organizationId: 'dev_mock_mtw_org_active', action: 'create_representative', expectAuthorized: false }),
  Object.freeze({ id: 'org_suspended_org_denies_all', principalId: 'dev_mock_mtw_prn_partner_mgr_suspended_org', organizationId: 'dev_mock_mtw_org_suspended', action: 'create_representative', expectAuthorized: false }),
  Object.freeze({ id: 'org_suspended_org_no_mint', principalId: 'dev_mock_mtw_prn_partner_mgr_suspended_org', organizationId: 'dev_mock_mtw_org_suspended', action: 'mint_principal', expectAuthorized: false }),
  Object.freeze({ id: 'org_deactivated_org_denies_all', principalId: 'dev_mock_mtw_prn_partner_mgr_deactivated_org', organizationId: 'dev_mock_mtw_org_deactivated', action: 'create_representative', expectAuthorized: false }),
  // The caller manages org_other and NAMES org_active in the payload. The runtime derives
  // the organization from the caller's own identity binding and never reads the payload's
  // organizationId, so the action succeeds WITHIN THEIR OWN organization and cannot reach
  // the named one. Cross-organization access is impossible by construction rather than by
  // a comparison, which is stronger — so the scenario asserts that property directly.
  Object.freeze({ id: 'org_wrong_organization_denied', principalId: 'dev_mock_mtw_prn_partner_mgr_other_org', organizationId: 'dev_mock_mtw_org_active', action: 'create_representative', expectAuthorized: true, crossOrgImpossibleByConstruction: true }),
  Object.freeze({ id: 'org_unverified_email_denied', principalId: 'dev_mock_mtw_prn_unverified', organizationId: 'dev_mock_mtw_org_active', action: 'accept_invitation', expectAuthorized: false }),
  Object.freeze({ id: 'org_email_collision_no_cross_bind', principalId: 'dev_mock_mtw_prn_collision_b', organizationId: 'dev_mock_mtw_org_active', action: 'accept_invitation', expectAuthorized: false }),
  Object.freeze({ id: 'org_suspension_invalidates_cached', principalId: 'dev_mock_mtw_prn_partner_mgr_suspended', organizationId: 'dev_mock_mtw_org_active', action: 'cached_authority', expectAuthorized: false }),
  Object.freeze({ id: 'org_late_callback_after_suspension', principalId: 'dev_mock_mtw_prn_partner_mgr_suspended', organizationId: 'dev_mock_mtw_org_active', action: 'late_callback', expectAuthorized: false }),
  Object.freeze({ id: 'org_reactivation_requires_versions', principalId: 'dev_mock_mtw_prn_partner_owner', organizationId: 'dev_mock_mtw_org_active', action: 'reactivate_stale_version', expectAuthorized: false }),
  Object.freeze({ id: 'org_exact_replay_succeeds', principalId: 'dev_mock_mtw_prn_partner_mgr_active', organizationId: 'dev_mock_mtw_org_active', action: 'exact_replay', expectAuthorized: true }),
  Object.freeze({ id: 'org_altered_replay_fails', principalId: 'dev_mock_mtw_prn_partner_mgr_active', organizationId: 'dev_mock_mtw_org_active', action: 'altered_replay', expectAuthorized: false }),
]);

/** Offline / replay / disposal scenarios. */
export const LIFECYCLE_SCENARIOS = Object.freeze([
    // Going offline BEFORE the command is sent: there is nothing in flight, so nothing can
  // double-apply, and the id is disposed with the rest of the private state. Preserving it
  // here would retain state for a command that never left the browser.
  Object.freeze({ id: 'life_offline_during_intent', event: 'offline_before_reserve', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_transport_failure_after_reserve', event: 'transport_failure', expectIdPreserved: true, expectContentDisposed: false }),
  Object.freeze({ id: 'life_restart_in_flight', event: 'restart', expectIdPreserved: true, expectContentDisposed: false }),
  Object.freeze({ id: 'life_retry_same_command', event: 'retry_same', expectIdPreserved: true, expectContentDisposed: false }),
  Object.freeze({ id: 'life_altered_retry', event: 'retry_altered', expectIdPreserved: false, expectContentDisposed: false }),
  Object.freeze({ id: 'life_logout', event: 'logout', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_member_switch', event: 'member_switch', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_role_change', event: 'role_change', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_suspension', event: 'suspension', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_deactivation', event: 'deactivation', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_appcheck_failure', event: 'appcheck_failure', expectIdPreserved: false, expectContentDisposed: true }),
  Object.freeze({ id: 'life_offline_in_flight', event: 'offline_while_in_flight', expectIdPreserved: true, expectContentDisposed: true, note: 'THE composed case: private content must be disposed while the in-flight command identity survives, or the retry double-applies.' }),
  Object.freeze({ id: 'life_late_completion_after_disposal', event: 'late_completion', expectIdPreserved: true, expectContentDisposed: true }),
]);

// ------------------------------------------------------------------------ world -------
/**
 * Build the world. PURE: returns a new in-memory object, writes nothing, contacts nothing.
 * Calling it twice with the same seed yields deeply equal output — the tooling asserts it.
 */
export function seed(options = {}) {
  const seedValue = options.seed === undefined ? WORLD_SEED : String(options.seed);
  const rng = makeRng(seedValue);
  // Filler is generated deterministically so the world has volume without any fixture
  // depending on a random draw.
  const filler = [];
  const fillerCount = Number.isInteger(options.fillerCount) ? options.fillerCount : 6;
  for (let i = 0; i < fillerCount; i += 1) {
    const slot = String(i + 1).padStart(3, '0');
    const roll = rng();
    filler.push(Object.freeze({
      principalId: `dev_mock_mtw_prn_filler_${slot}`,
      label: `Filler staff ${slot}`,
      contactEmail: `mtw-filler-${slot}@example.test`,
      emailVerified: true,
      adminDoc: Object.freeze({ role: roll > 0.5 ? 'Support' : 'Manager', status: 'Active' }),
      partner: null,
      expect: Object.freeze({ staff: true, director: false, portal: 'authorized' }),
    }));
  }

  return {
    worldId: WORLD_ID,
    worldVersion: WORLD_VERSION,
    seed: seedValue,
    namespace: NAMESPACE,
    organizations: ORGANIZATIONS.map((o) => ({ ...o })),
    identities: [...IDENTITIES.map((i) => ({ ...i })), ...filler.map((f) => ({ ...f }))],
    legacyStatusRecords: LEGACY_STATUS_RECORDS.map((r) => ({ ...r })),
    legacyNoSurvivingDirector: LEGACY_NO_SURVIVING_DIRECTOR.map((r) => ({ ...r })),
    legacyConforming: LEGACY_CONFORMING.map((r) => ({ ...r })),
    appCheckEvidence: APP_CHECK_EVIDENCE.map((e) => ({ ...e })),
    scenarios: SCENARIOS.map((x) => ({ ...x })),
    organizationScenarios: ORGANIZATION_SCENARIOS.map((x) => ({ ...x })),
    lifecycleScenarios: LIFECYCLE_SCENARIOS.map((x) => ({ ...x })),
  };
}

/** Reset is a no-op by construction: there is no persistent state to clear. */
export function reset() {
  return { reset: true, wrote: 0, note: 'The world is built in memory on every seed(); there is nothing persistent to clear.' };
}

/** Canonical JSON with sorted keys, so the digest depends on values and not key order. */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export const SCENARIO_COUNT = SCENARIOS.length + ORGANIZATION_SCENARIOS.length
  + LIFECYCLE_SCENARIOS.length + APP_CHECK_EVIDENCE.length;
