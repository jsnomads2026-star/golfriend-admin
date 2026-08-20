// Canonical, non-persistent V2 policy preview copied from the approved Economy
// seed-preview commit. It is returned by the Director-only reader, never saved.
type Direction = 'earn' | 'spend' | 'reserve';

const action = (actionId: string, direction: Direction, amountTee: number) => ({
  actionId, direction, amountTee,
  lifecycle: direction === 'earn'
    ? { reserve: 'prohibited', settle: 'not_applicable_issuance_is_immediate', release: 'prohibited' }
    : direction === 'spend'
      ? { reserve: 'prohibited', settle: 'required_immediate_debit', release: 'prohibited' }
      : { reserve: 'required_hold_exact_amount', settle: 'required_consume_exact_reserved_amount', release: 'required_return_exact_reserved_amount_when_unsettled' },
} as const);

export const V2_ECONOMY_POLICY_SEED_PREVIEW = Object.freeze({
  schema: 'golfriend.economy-policy-seed-preview.v1',
  approvalState: 'director_approval_required',
  policyVersion: 'economy.v2.2026-08-17.2',
  policyDigestSha256: '1bf64f47f69bf2a90f3409c347594bae6725b104f6849a74f66c8cab81cb9a16',
  documentId: 'policy_3a2e4483f1053ddebc6759d578581cb1110206ea5bce4d53f3f23bd6d46e59ce',
  asset: { code: 'TEE', settlementCurrency: 'USD', unitPriceUsd: 0.10 },
  teePacks: [
    { id: 'tees_100', teeCount: 100, currency: 'USD', priceUsd: 10 },
    { id: 'tees_250', teeCount: 250, currency: 'USD', priceUsd: 25 },
    { id: 'tees_500', teeCount: 500, currency: 'USD', priceUsd: 50 },
  ],
  lotRules: { promotionalTtlDays: 180, consumptionOrder: ['promotional_expiring_first', 'purchased_and_member_earned_by_issued_at_then_lot_id'], purchasedExpires: false, memberEarnedExpires: false },
  actions: [
    action('tee.earn.achievement.albatross', 'earn', 500), action('tee.earn.achievement.birdie', 'earn', 5), action('tee.earn.achievement.eagle', 'earn', 20), action('tee.earn.achievement.hole_in_one', 'earn', 300), action('tee.earn.clubhouse_dividend_day_1_3', 'earn', 1), action('tee.earn.clubhouse_dividend_day_4_6', 'earn', 2), action('tee.earn.clubhouse_dividend_day_7', 'earn', 5), action('tee.earn.match_completion_bonus', 'earn', 2), action('tee.earn.membership_monthly_drip', 'earn', 300), action('tee.earn.photo_verified_reward', 'earn', 15), action('tee.earn.profile_completion', 'earn', 10), action('tee.earn.referral_success', 'earn', 50), action('tee.earn.reviewer_bounty', 'earn', 1), action('tee.earn.virtual_drink_payout', 'earn', 3), action('tee.earn.welcome_bonus', 'earn', 50),
    action('tee.reserve.host_lock', 'reserve', 150), action('tee.reserve.joiner_lock', 'reserve', 50), action('tee.reserve.tournament_lock', 'reserve', 500),
    action('tee.spend.ai_caddie_round', 'spend', 25), action('tee.spend.ai_pass', 'spend', 15), action('tee.spend.ai_swing_clinic', 'spend', 50), action('tee.spend.booking_concierge', 'spend', 5), action('tee.spend.expand_master_album', 'spend', 50), action('tee.spend.extra_photo_slot', 'spend', 20), action('tee.spend.extra_video_slot', 'spend', 100), action('tee.spend.global_course_search', 'spend', 15), action('tee.spend.market_ad_listing', 'spend', 50), action('tee.spend.market_bump', 'spend', 5), action('tee.spend.pitch_standard', 'spend', 5), action('tee.spend.pitch_vip', 'spend', 25), action('tee.spend.premium_action', 'spend', 3), action('tee.spend.transport_room_entry', 'spend', 1), action('tee.spend.virtual_drink_cost', 'spend', 5),
  ],
  financialDataState: 'no_policy_ledger_lot_journal_reconciliation_or_audit_record_is_created_by_this_preview',
} as const);
