// Shared presentation primitives for C2A admin booking surfaces.
// Consume V2Theme tokens only. No business logic, no data flow.
import { V2Theme } from './v2Theme';

// ─── Status / action badge ────────────────────────────────────────────────

const STATUS_PALETTE: Record<string, string> = {
  confirmed:        V2Theme.successGreen,
  admin_confirmed:  V2Theme.successGreen,
  pending:          V2Theme.warningAmber,
  requested:        V2Theme.warningAmber,
  rejected:         V2Theme.errorRed,
  admin_rejected:   V2Theme.errorRed,
  cancelled:        V2Theme.surfaceTextMuted,
  admin_cancelled:  V2Theme.surfaceTextMuted,
  open:             V2Theme.fairwayLight,
  closed:           V2Theme.surfaceMuted,
};

/** Pill badge for booking status or audit action. Falls back to muted if unknown. */
export function V2Badge({ status, label }: { status: string; label?: string }) {
  const color = STATUS_PALETTE[status.toLowerCase()] ?? V2Theme.surfaceTextMuted;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: V2Theme.radiusPill,
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}55`,
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label ?? status}
    </span>
  );
}

// ─── Filter / control row ─────────────────────────────────────────────────

/** Flex row for filter pills and search inputs with consistent gap and wrapping. */
export function V2ControlRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        flexWrap: 'wrap' as const,
        marginBottom: '18px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
