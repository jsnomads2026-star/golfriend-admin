// Shared presentation primitives for C2A/C2B admin booking surfaces.
// Consume V2Theme tokens only. No business logic, no data flow.
import { useEffect, useRef } from 'react';
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

// ─── Focus-trapping modal ─────────────────────────────────────────────────

interface V2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Max width of the panel — default 620px */
  maxWidth?: string;
}

/**
 * Accessible modal: focus-trapped, Escape-closeable, backdrop-click-closeable.
 * aria-modal + role="dialog" + aria-labelledby wired.
 */
export function V2Modal({ isOpen, onClose, title, children, maxWidth = '620px' }: V2ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const firstBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    firstBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const foci = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!foci.length) return;
      if (e.shiftKey && document.activeElement === foci[0]) { e.preventDefault(); foci[foci.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === foci[foci.length - 1]) { e.preventDefault(); foci[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="v2modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        backgroundColor: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          backgroundColor: V2Theme.surfacePanel,
          border: `1px solid ${V2Theme.surfaceBorder}`,
          borderRadius: V2Theme.radiusLg,
          boxShadow: V2Theme.shadowMenu,
          width: '100%',
          maxWidth,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${V2Theme.surfaceBorder}`,
          flexShrink: 0,
        }}>
          <h2
            id="v2modal-title"
            style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: V2Theme.warmWhite, fontFamily: V2Theme.fontFamily }}
          >
            {title}
          </h2>
          <button
            ref={firstBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none',
              color: V2Theme.surfaceTextMuted, cursor: 'pointer',
              fontSize: '22px', lineHeight: 1,
              padding: '4px 8px',
              borderRadius: V2Theme.radiusSm,
              minWidth: '44px', minHeight: '44px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '80vh' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
