import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const ui=read('src/components/admin/v2/EnterpriseMemberCommissioningPanel.tsx');
const provider=read('src/components/admin/v2/enterpriseMemberCommissioningProvider.ts');
const copy=read('src/i18n/admin/enterpriseMemberCommissioning.ts');
const mounted=read('src/components/admin/v2/V2EnterpriseMemberRequests.tsx');
const css=read('src/components/admin/v2/EnterpriseMemberCommissioningPanel.css');
const checks=[
 ['mounted under member requests',mounted.includes('<EnterpriseMemberCommissioningPanel />')],
 ['all callable adapters', ['getEnterpriseMemberCommissioningAdminV1','proposeEnterpriseMemberDeliveryTemplateAdminV1','recordEnterpriseMemberTemplateApprovalAdminV1','activateEnterpriseMemberDeliveryTemplateAdminV1','rejectEnterpriseMemberDeliveryTemplateAdminV1','retireEnterpriseMemberDeliveryTemplateAdminV1','runEnterpriseMemberDeliveryDryRunAdminV1','validateEnterpriseMemberJHCCPortAdminV1'].every((name)=>provider.includes(name))],
 ['metadata-only proposal',ui.includes('metadataOnly')&&ui.includes('contentDigest')&&provider.includes('customerApprovalRequired')&&!ui.slice(ui.indexOf('function ProposalForm'),ui.indexOf('function TemplateActions')).includes('customerApprovalRequired')],
 ['strict provider projections',provider.includes('RECEIPT_IMMUTABILITY_VIOLATION')&&provider.includes('TEMPLATE_ENUM_MALFORMED')&&provider.includes('exactFalse')],
 ['stable command IDs and replay-safe calls',ui.includes('newCommissioningCommandId')&&ui.includes('commandId:')],
 ['command IDs rotate only after success',ui.includes('const ok=await run')&&ui.includes('if(ok){setConfirmed(false)')&&ui.includes('if(await run(task))clear()')],
 ['explicit confirmations',ui.includes('type="checkbox"')&&ui.includes('!approvalConfirm')&&ui.includes('!stateConfirm')&&ui.includes('!dryConfirm')&&ui.includes('!jhccConfirm')],
 ['immutable receipt presentation',ui.includes('commissioningReceipts')&&ui.includes('immutable')],
 ['provider and JHCC honest boundaries',ui.includes('providerNotCommissioned')&&ui.includes('jhccNotCommissioned')&&provider.includes('transmitted')],
 ['bounded JHCC identifiers',ui.includes('listIds(eventText).length>100')&&!ui.includes('.slice(0,100)')],
 ['accessible live status and labels',ui.includes('aria-live="polite"')&&ui.includes('role="alert"')&&ui.includes('<caption>')&&ui.includes('scope="col"')],
 ['48px keyboard-safe controls',css.includes('min-height:48px')&&css.includes(':focus-visible')],
 ['loading empty offline unavailable retry', ['loading','empty','offline','unavailable','retry'].every((key)=>copy.includes(`${key}:`))],
 ['all eight locales', ['en,','th:','ko:','ja:','zh:','es:','fr:','de:'].every((key)=>copy.includes(key))],
 ['no legal text, send or economy authority',!ui.includes('legalTextArea')&&!ui.includes('sendEmail')&&!ui.includes('sendSms')&&!ui.includes('writeTee')],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log(`PASS ${name}`)}
console.log(`${checks.length}/${checks.length} enterprise member commissioning UI checks passed`);
