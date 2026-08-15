import {useLocale} from '../../i18n/hooks';
import {SMALL_BUSINESS_COPY} from '../../i18n/smallBusiness';
import type {PortalProjection} from '../smallBusiness/smallBusinessModel';
import {resolvePartnerPortalMount} from '../smallBusiness/partnerPortalMountModel';

/** Read-only, server-projected evidence. No client-selected member or organization ID. */
export default function PartnerDocuments({projection}:{projection:PortalProjection}){
  const t=SMALL_BUSINESS_COPY[useLocale()],mount=resolvePartnerPortalMount(projection),evidence=mount.projection?.evidenceReferences||[];
  return <section className="sb-card" aria-labelledby="partner-documents-title">
    <h2 id="partner-documents-title">{t.evidence}</h2><p>{t.noContact}</p>
    {evidence.length?<ul>{evidence.map(item=><li key={item.evidenceId}><code>{item.evidenceId}</code> · {item.kind}</li>)}</ul>:<p role="status">{t.unavailable}</p>}
  </section>;
}
