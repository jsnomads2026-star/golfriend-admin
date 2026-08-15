import {useLocale} from '../../i18n/hooks';
import {SMALL_BUSINESS_COPY} from '../../i18n/smallBusiness';
import {smallBusinessLabel} from '../../i18n/smallBusinessLabels';
import type {PortalProjection} from '../smallBusiness/smallBusinessModel';
import {resolvePartnerPortalMount} from '../smallBusiness/partnerPortalMountModel';

/** Displays only current server-owned application state; never infers course approval. */
export default function PartnerOnboarding({projection}:{projection:PortalProjection}){
  const locale=useLocale(),t=SMALL_BUSINESS_COPY[locale],mount=resolvePartnerPortalMount(projection),status=mount.projection?.business?.status;
  return <section className="sb-card" aria-labelledby="partner-onboarding-title">
    <h2 id="partner-onboarding-title">{t.status}</h2><p>{status?smallBusinessLabel(locale,status):t.unavailable}</p><p role="status">{t.noContact}</p>
  </section>;
}
