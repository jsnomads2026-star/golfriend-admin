import { useMemo, useState } from "react";
import { INITIAL_ECONOMY_RATE_CARD, USD_PER_TEE, rateMargin, type EconomyRate, type PricingMode } from "../economy/rateCard";

export interface EconomyRateCardProps {
  initialRates?: EconomyRate[];
  onPublish?: (nextVersion: { version: string; reason: string; rates: EconomyRate[] }) => Promise<void> | void;
  onRollback?: (version: string) => Promise<void> | void;
}

export function EconomyRateCard({ initialRates = INITIAL_ECONOMY_RATE_CARD, onPublish, onRollback }: EconomyRateCardProps) {
  const [rates, setRates] = useState(initialRates);
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("All");
  const [reason, setReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [lastPublished, setLastPublished] = useState<string | null>(null);

  const sections = useMemo(() => ["All", ...Array.from(new Set(rates.map((rate) => rate.section))).sort()], [rates]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rates.filter((rate) => (section === "All" || rate.section === section) &&
      (!needle || rate.label.toLowerCase().includes(needle) || rate.id.toLowerCase().includes(needle)));
  }, [query, rates, section]);

  const update = (id: string, patch: Partial<EconomyRate>) =>
    setRates((current) => current.map((rate) => rate.id === id ? { ...rate, ...patch } : rate));

  const publish = async () => {
    if (!reason.trim()) throw new Error("PUBLISH_REASON_REQUIRED");
    const version = new Date().toISOString();
    setPublishing(true);
    try {
      await onPublish?.({ version, reason: reason.trim(), rates });
      setRates((current) => current.map((rate) => ({ ...rate, version, effectiveAt: version })));
      setLastPublished(version);
      setReason("");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section aria-labelledby="economy-rate-card-title">
      <header>
        <p>Central Economy Control</p>
        <h1 id="economy-rate-card-title">Economy Rate Card</h1>
        <p>One Tee = {"$" + USD_PER_TEE.toFixed(2)}. Changes require a reason and publish as a new version.</p>
      </header>
      <div>
        <label>Search all costs<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Match, Chat, Tournament…" /></label>
        <label>Section<select value={section} onChange={(event) => setSection(event.target.value)}>
          {sections.map((item) => <option key={item}>{item}</option>)}
        </select></label>
      </div>
      <table>
        <thead><tr>
          <th>Feature / function</th><th>Section</th><th>Mode</th><th>Tees</th><th>USD</th>
          <th>Direct cost</th><th>Margin</th><th>Reward</th><th>Active</th><th>Version</th>
        </tr></thead>
        <tbody>{visible.map((rate) => {
          const margin = rateMargin(rate);
          return <tr key={rate.id}>
            <td><strong>{rate.label}</strong><br /><small>{rate.id}</small></td>
            <td>{rate.section}</td>
            <td><select aria-label={rate.label + " pricing mode"} value={rate.mode}
              onChange={(event) => update(rate.id, { mode: event.target.value as PricingMode })}>
              <option value="free">Free</option><option value="fixed">Fixed</option><option value="metered">AI metered</option>
            </select></td>
            <td><input aria-label={rate.label + " Tee cost"} type="number" min={0} step={1} value={rate.tees}
              onChange={(event) => update(rate.id, { tees: Number(event.target.value) })} /></td>
            <td>{"$" + margin.revenueUsd.toFixed(2)}</td>
            <td><input aria-label={rate.label + " direct cost USD"} type="number" min={0} step={0.001} value={rate.directCostUsd}
              onChange={(event) => update(rate.id, { directCostUsd: Number(event.target.value) })} /></td>
            <td>{margin.marginPercent === null ? "—" : (margin.marginPercent * 100).toFixed(1) + "%"}</td>
            <td><input aria-label={rate.label + " reward Tees"} type="number" min={0} step={1} value={rate.rewardTees}
              onChange={(event) => update(rate.id, { rewardTees: Number(event.target.value) })} /></td>
            <td><input aria-label={rate.label + " active"} type="checkbox" checked={rate.active}
              onChange={(event) => update(rate.id, { active: event.target.checked })} /></td>
            <td><small>{rate.version}</small></td>
          </tr>;
        })}</tbody>
      </table>
      <footer>
        <label>Required change reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <button type="button" disabled={publishing || !reason.trim()} onClick={publish}>
          {publishing ? "Publishing…" : "Publish new rate version"}
        </button>
        {lastPublished && <><p role="status">Published {lastPublished}</p>
          <button type="button" onClick={() => onRollback?.(lastPublished)}>Request rollback</button></>}
      </footer>
    </section>
  );
}
