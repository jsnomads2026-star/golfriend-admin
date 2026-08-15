import assert from 'node:assert/strict';import{readFileSync}from'node:fs';const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const ui=read('src/components/admin/v2/V2EnterpriseMemberRequests.tsx'),provider=read('src/components/admin/v2/enterpriseMemberRequestsProvider.ts'),copy=read('src/i18n/admin/enterpriseMemberRequests.ts'),mount=read('src/App.tsx'),css=read('src/components/admin/v2/V2EnterpriseMemberRequests.css');
const checks=[
 ['mounted only in V2 Admin partners area',mount.includes("activeArea === 'partners' && <V2EnterpriseMemberRequests")],
 ['producer contract',provider.includes('golfriend.enterprise-member-admin-resolution.v1')],
 ['six callable adapters',['getEnterpriseMemberRequestsAdminV1','getEnterpriseMemberRequestAdminV1','decideEnterpriseMemberRequestAdminV1','resolveEnterpriseMemberCsvConflictsAdminV1','prepareEnterpriseMemberDeliveryAdminV1','getEnterpriseMemberDeliveryOutboxAdminV1'].every(x=>provider.includes(x))],
 ['all decision verbs',['mark_duplicate','link_existing','reject','request_correction','escalate_identity_consent','approve_delivery','cancel_before_delivery'].every(x=>provider.includes(x)&&ui.includes(x))],
 ['opaque paging',provider.includes('cursor?:string')&&ui.includes('nextCursor')],
 ['immutable receipt/history',provider.includes('ReceiptProjection')&&ui.includes('detail.history')],
 ['delivery is provider-neutral',provider.includes("'email'|'sms'|'push'")&&copy.includes('awaiting delivery provider')],
 ['consent distinct from provider',ui.includes('detail.consent?.status')&&ui.includes('detail.lifecycle?.status')],
 ['CSV bounded explicit rows',ui.includes('previewId:csv.previewId')&&ui.includes('rowDigest:csv.rowDigest')&&ui.includes('resolutions:Object.entries')],
 ['consequential confirmation',ui.includes('type="checkbox"')&&ui.includes('!confirmed')],
 ['privacy boundary',copy.includes('raw identities')&&copy.includes('private contacts')&&!ui.includes('contactReference')&&!ui.includes('rawUid')],
 ['dialog focus and escape',ui.includes('useDialogFocus(true,close)')],
 ['accessible table and live announcement',ui.includes('<table>')&&ui.includes('aria-live="polite"')&&ui.includes('role="dialog"')],
 ['48px controls',css.includes('min-height:48px')],
 ['loading empty unavailable retry',['loading','empty','unavailable','retry'].every(x=>copy.includes(`${x}:`))],
 ['eight locales',['en,','th:','ko:','ja:','zh:','es:','fr:','de:'].every(x=>copy.includes(x))],
 ['no direct datastore or communications',!provider.includes('firestore')&&!ui.includes('sendEmail')&&!ui.includes('createUser')],
];for(const[n,ok]of checks){assert.ok(ok,n);console.log(`PASS ${n}`)}console.log(`${checks.length}/${checks.length} enterprise member Admin UI checks passed`);
