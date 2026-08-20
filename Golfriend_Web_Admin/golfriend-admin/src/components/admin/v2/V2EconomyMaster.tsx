import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../firebaseConfig';
import './V2EconomyMaster.css';

type Snapshot = {
  policies: Array<{ policyVersion: string; purpose: string; amountTee: number | null; greenFeeIncluded: boolean | null; effectiveAt: string | null }>;
  teeInventory: { issued: number; remaining: number; reserved: number; available: number; byAction: Array<{ purpose: string; policyVersion: string; amountTee: number | null; reserved: number; settled: number; released: number; total: number }> };
  ledger: { entriesReviewed: number; balancedEntries: number; unbalancedEntries: number; pendingReconciliationCases: number; recentEntries: Array<{ entryId: string; commandType: string; createdAt: string | null; policyVersion: string; debitTee: number; creditTee: number; balanced: boolean }> };
  countryUsage: { status: 'available' | 'unavailable'; rows: Array<{ countryCode: string; journalCount: number; teeVolume: number }>; reason?: string };
  policyAudit: { status: 'available' | 'unavailable'; entries: Array<{ id: string; policyVersion: string; actionType: string; reason: string | null; createdAt: string | null }>; reason?: string };
};

const tee = (value: number | null) => value === null ? 'Not recorded' : `${value} Tee`;

export default function V2EconomyMaster({ isDirector }: { isDirector: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'unavailable'>('loading');

  useEffect(() => {
    if (!isDirector) { setState('denied'); return; }
    const load = async () => {
      try {
        const read = httpsCallable<unknown, Snapshot>(functions, 'getV2EconomyMasterSnapshot');
        const result = await read({});
        setSnapshot(result.data);
        setState('ready');
      } catch (error: unknown) {
        const code = (error as { code?: string }).code;
        setState(code === 'functions/permission-denied' ? 'denied' : 'unavailable');
      }
    };
    void load();
  }, [isDirector]);

  if (state === 'loading') return <section className="economy-master-state" role="status">Loading the Director-only V2 economy read model…</section>;
  if (state === 'denied') return <section className="economy-master-state is-denied" role="alert"><h2>Director authority required</h2><p>This read-only Economy Master is server-gated to an active Director. No financial action is available here.</p></section>;
  if (state === 'unavailable' || !snapshot) return <section className="economy-master-state is-unavailable" role="alert"><h2>Canonical V2 economy read unavailable</h2><p>The Admin has no verified connection to the canonical V2 economy authority. No local, legacy, payment, or estimated data is substituted.</p></section>;

  return <div className="economy-master">
    <header><div><span>DIRECTOR · READ-ONLY</span><h2>Economy Master / Ledger</h2><p>Canonical V2 Tees only. This screen cannot price, issue, settle, reverse, or change policy.</p></div><aside><b>Live-data dependency</b><small>Requires the deployed `getV2EconomyMasterSnapshot` callable and canonical V2 economy records.</small></aside></header>
    <section className="economy-master-metrics" aria-label="Tee inventory"><article><span>Issued Tees</span><strong>{snapshot.teeInventory.issued}</strong></article><article><span>Remaining Tees</span><strong>{snapshot.teeInventory.remaining}</strong></article><article><span>Reserved Tees</span><strong>{snapshot.teeInventory.reserved}</strong></article><article><span>Available Tees</span><strong>{snapshot.teeInventory.available}</strong></article></section>
    <section className="economy-master-card"><h3>Current price policy</h3>{snapshot.policies.length ? <table><thead><tr><th>Purpose</th><th>Policy version</th><th>Price</th><th>Effective</th><th>Green fee</th></tr></thead><tbody>{snapshot.policies.map((policy) => <tr key={`${policy.purpose}-${policy.policyVersion}`}><td>{policy.purpose}</td><td><code>{policy.policyVersion}</code></td><td>{tee(policy.amountTee)}</td><td>{policy.effectiveAt ?? 'Not recorded'}</td><td>{policy.greenFeeIncluded === null ? 'Not recorded' : policy.greenFeeIncluded ? 'Included' : 'Not included'}</td></tr>)}</tbody></table> : <p className="economy-empty">No active canonical policy record is available.</p>}</section>
    <section className="economy-master-card"><h3>Action / feature Tee inventory</h3>{snapshot.teeInventory.byAction.length ? <table><thead><tr><th>Action</th><th>Policy</th><th>Amount</th><th>Reserved</th><th>Settled</th><th>Released</th></tr></thead><tbody>{snapshot.teeInventory.byAction.map((row) => <tr key={`${row.purpose}-${row.policyVersion}-${row.amountTee}`}><td>{row.purpose}</td><td><code>{row.policyVersion}</code></td><td>{tee(row.amountTee)}</td><td>{row.reserved}</td><td>{row.settled}</td><td>{row.released}</td></tr>)}</tbody></table> : <p className="economy-empty">No canonical journal action inventory is available.</p>}</section>
    <section className="economy-master-card"><h3>Read-only ledger reconciliation</h3><div className="economy-ledger-summary"><span>Entries reviewed <b>{snapshot.ledger.entriesReviewed}</b></span><span>Balanced <b>{snapshot.ledger.balancedEntries}</b></span><span>Unbalanced <b>{snapshot.ledger.unbalancedEntries}</b></span><span>Pending cases <b>{snapshot.ledger.pendingReconciliationCases}</b></span></div>{snapshot.ledger.recentEntries.length ? <table><thead><tr><th>Entry</th><th>Action</th><th>Created</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{snapshot.ledger.recentEntries.map((entry) => <tr key={entry.entryId}><td><code>{entry.entryId}</code></td><td>{entry.commandType}</td><td>{entry.createdAt ?? 'Not recorded'}</td><td>{entry.debitTee}</td><td>{entry.creditTee}</td><td>{entry.balanced ? 'Balanced' : 'Requires review'}</td></tr>)}</tbody></table> : <p className="economy-empty">No canonical journal entries are available.</p>}</section>
    <section className="economy-master-grid"><article className="economy-master-card"><h3>Country-level usage</h3>{snapshot.countryUsage.status === 'available' ? <table><thead><tr><th>Country</th><th>Journals</th><th>Tee volume</th></tr></thead><tbody>{snapshot.countryUsage.rows.map((row) => <tr key={row.countryCode}><td>{row.countryCode}</td><td>{row.journalCount}</td><td>{row.teeVolume}</td></tr>)}</tbody></table> : <p className="economy-empty">Unavailable: {snapshot.countryUsage.reason}</p>}</article><article className="economy-master-card"><h3>Future price-change audit</h3>{snapshot.policyAudit.status === 'available' ? <table><thead><tr><th>Policy</th><th>Action</th><th>Reason</th><th>Created</th></tr></thead><tbody>{snapshot.policyAudit.entries.map((entry) => <tr key={entry.id}><td><code>{entry.policyVersion}</code></td><td>{entry.actionType}</td><td>{entry.reason ?? 'Not recorded'}</td><td>{entry.createdAt ?? 'Not recorded'}</td></tr>)}</tbody></table> : <p className="economy-empty">Unavailable: {snapshot.policyAudit.reason}</p>}</article></section>
  </div>;
}
