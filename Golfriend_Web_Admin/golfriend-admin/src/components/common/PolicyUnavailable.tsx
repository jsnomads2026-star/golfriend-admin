// ==========================================
// FILE: src/components/common/PolicyUnavailable.tsx
// Honest replacement surface for admin/portal consoles whose backing Cloud
// Function was quarantined (prohibited financial/wallet/escrow/commerce) or is
// unresolved (tournament/raffle/check-in) under the non-financial V2 policy.
// Renders a clear unavailable/policy-review state. It performs NO callable, NO
// write, and exposes NO privileged control — it only explains why the console is
// off. See docs/V2_CALLABLE_AUTHORITY_CLASSIFICATION.md.
// ==========================================
type Category = 'prohibited-financial' | 'unresolved-policy';

const COPY: Record<Category, { badge: string; tone: string; line: string }> = {
  'prohibited-financial': {
    badge: 'UNAVAILABLE — NON-FINANCIAL V2 POLICY',
    tone: '#d4af37',
    line: 'This console drove chip/wallet/escrow/settlement or commerce flow, which is not part of the non-financial V2 world. Its Cloud Function is quarantined and fails closed. No action here can move money or economy state.',
  },
  'unresolved-policy': {
    badge: 'PENDING FOUNDER POLICY REVIEW',
    tone: '#8ab4f8',
    line: 'This tournament / raffle / check-in control is held pending an explicit founder policy decision for the non-financial V2 world. Its Cloud Function is failed closed and will stay unavailable until that decision is made.',
  },
};

export default function PolicyUnavailable({
  feature,
  category,
  callable,
}: {
  feature: string;
  category: Category;
  callable?: string;
}) {
  const c = COPY[category];
  return (
    <div
      role="status"
      aria-live="polite"
      data-policy-unavailable={category}
      style={{
        margin: '40px auto', maxWidth: 640, padding: '28px 32px',
        background: '#121212', border: `1px solid ${c.tone}33`, borderRadius: 12,
        color: '#e8e8e8', fontFamily: 'sans-serif',
      }}
    >
      <div style={{ color: c.tone, letterSpacing: 1, fontSize: 12, marginBottom: 12 }}>🔒 {c.badge}</div>
      <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{feature} is unavailable</h2>
      <p style={{ margin: 0, lineHeight: 1.6, color: '#b8b8b8' }}>{c.line}</p>
      {callable ? (
        <p style={{ marginTop: 16, fontSize: 12, color: '#6a6a6a' }}>
          Backing function <code style={{ color: '#8a8a8a' }}>{callable}</code> is quarantined server-side.
        </p>
      ) : null}
    </div>
  );
}
