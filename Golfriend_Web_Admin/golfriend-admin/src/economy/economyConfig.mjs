// Central versioned economy configuration — the SINGLE source of commercial bounds.
//
// Acquisition, booking and partner surfaces read their commission bound from here rather than
// hard-coding a figure. A rate is a Founder pricing decision, not a constant to be duplicated
// across modules where two copies can silently diverge.
//
// Changing a value requires a NEW version with its own effective date. Versions are immutable
// and cannot backdate: a receipt issued under an earlier version keeps that version's terms.
// This module issues no invoice, statement or payment of any kind.

const deepFreeze=(value)=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}return value;};
const isoDay=(v)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;const parsed=new Date(`${v}T00:00:00.000Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===v?v:null;};

export const ECONOMY_CONFIG_SCHEMA='golfriend.economy.configuration.v1';
/** Basis points are integers out of 10000. 300 bps = 3%. */
export const BASIS_POINT_SCALE=10000;

/**
 * Immutable, append-only policy versions. The newest EFFECTIVE version governs new decisions;
 * an existing receipt keeps the version it was issued under.
 */
export const ECONOMY_POLICY_VERSIONS=deepFreeze([
  {
    version:'2026-08-15.v1',
    effectiveFrom:'2026-08-15',
    effectiveUntil:null,
    approvedBy:'Founder',
    /** Initial booking commission authority: 3%. */
    bookingCommissionBps:300,
    /** No acquisition or booking contract may exceed the centrally authorized bound. */
    maxCommissionBps:300,
    minCommissionBps:0,
    notice:'Initial Founder pricing authority. Commission is charged only under a signed, effective-dated agreement with verified activation.',
    prohibited:['OEM revenue','advertising revenue','commission on an unsigned course','commission backdated to a prior policy version'],
  },
  {
    version:'2026-08-18.v1',
    effectiveFrom:'2026-08-18',
    effectiveUntil:null,
    approvedBy:'Founder',
    /** Enterprise booking commission authority, unchanged from 2026-08-15.v1: 3%. */
    bookingCommissionBps:300,
    maxCommissionBps:300,
    minCommissionBps:0,
    /**
     * Small Business founding subscription. Minor units of the stated currency, so no
     * float ever reaches a statement. A future rate is a NEW version with its own
     * effective date; Web, Portal and statements read this authority and are not rewritten.
     */
    smallBusinessSubscription:{currency:'USD',amountMinor:2900,period:'monthly'},
    /** Worldwide free trial. 10000 bps = 100% discount, so nothing is due during it. */
    trialDays:90,
    trialDiscountBps:BASIS_POINT_SCALE,
    /**
     * The ONLY receivables Golfriend may invoice. This list is the overturn of the
     * partner onboarding contract's `external_authority_required` default, and it is
     * deliberately narrow: everything absent from it stays external money.
     */
    golfriendOwnedReceivables:['small_business_subscription','enterprise_attributed_commission','accepted_custom_work'],
    notice:'Founding Small Business and Enterprise offers. Billing begins only after the 90-day trial, under an accepted agreement and verified activation. Contract wording has not completed legal review.',
    prohibited:[
      'OEM revenue','advertising revenue','commission on an unsigned course','commission backdated to a prior policy version',
      'course tee-time payment','tournament entry fee','tournament prize','organizer funds','betting','stakes','escrow',
      'Enterprise monthly subscription charged alongside attributed commission','commission on a booking without verified Golfriend attribution',
      'Small Business booking commission','custom work billed without a separately accepted quote',
    ],
  },
]);

/** Receivable kinds Golfriend may invoice on a given day. Absent kind → external money. */
export function golfriendOwnedReceivables(at){const policy=economyPolicyFor(at);return policy?.golfriendOwnedReceivables??[];}

/** Fail-closed: a receivable Golfriend is not authorized to invoice can never be billed. */
export function isGolfriendOwnedReceivable(kind,at){return golfriendOwnedReceivables(at).includes(kind);}

/** The Small Business subscription effective on a day, or null. Never a hardcoded literal. */
export function smallBusinessSubscription(at){const policy=economyPolicyFor(at);return policy?.smallBusinessSubscription??null;}

/** Trial terms effective on a day, or null. */
export function trialTerms(at){
  const policy=economyPolicyFor(at);
  if(!policy||!Number.isInteger(policy.trialDays))return null;
  return{days:policy.trialDays,discountBps:policy.trialDiscountBps};
}

/** The policy version effective on a given day, or null. Fail-closed: no day, no policy. */
export function economyPolicyFor(at){
  const day=isoDay(at);
  if(!day)return null;
  const applicable=ECONOMY_POLICY_VERSIONS.filter((policy)=>policy.effectiveFrom<=day&&(!policy.effectiveUntil||day<=policy.effectiveUntil));
  return applicable.length?applicable[applicable.length-1]:null;
}

/** Look a version up by id so a historic receipt can be re-read under its own terms. */
export function economyPolicyByVersion(version){return ECONOMY_POLICY_VERSIONS.find((policy)=>policy.version===version)??null;}

/**
 * The centrally authorized commission ceiling for a day. Callers must use this instead of a
 * literal: a generic "any rate up to 100%" allowance would let a contract record a rate the
 * pricing authority never granted.
 */
export function maxCommissionBps(at){const policy=economyPolicyFor(at);return policy?policy.maxCommissionBps:null;}

/** Validate a proposed commission rate against the policy effective on that day. */
export function validateCommissionBps(bps,at){
  const policy=economyPolicyFor(at);
  if(!policy)return{valid:false,reason:'no_effective_economy_policy',policyVersion:null,maxCommissionBps:null};
  if(!Number.isInteger(bps))return{valid:false,reason:'rate_must_be_integer_basis_points',policyVersion:policy.version,maxCommissionBps:policy.maxCommissionBps};
  if(bps<=policy.minCommissionBps)return{valid:false,reason:'rate_not_positive',policyVersion:policy.version,maxCommissionBps:policy.maxCommissionBps};
  if(bps>policy.maxCommissionBps)return{valid:false,reason:'rate_exceeds_authorized_ceiling',policyVersion:policy.version,maxCommissionBps:policy.maxCommissionBps};
  return{valid:true,reason:'within_authorized_bound',policyVersion:policy.version,maxCommissionBps:policy.maxCommissionBps};
}

/** A policy version can never be re-dated: an existing receipt keeps the terms it was issued under. */
export function policyAppliesToReceipt(receiptPolicyVersion,at){
  const issued=economyPolicyByVersion(receiptPolicyVersion);
  if(!issued)return{applies:false,reason:'unknown_policy_version'};
  const day=isoDay(at);
  if(!day)return{applies:false,reason:'invalid_evaluation_date'};
  if(day<issued.effectiveFrom)return{applies:false,reason:'policy_cannot_be_backdated'};
  return{applies:true,reason:'issued_under_this_version'};
}
