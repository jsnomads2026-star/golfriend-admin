import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
const source=fs.readFileSync(new URL('../src/components/admin/v2/EconomyMasterControl.tsx',import.meta.url),'utf8');const css=fs.readFileSync(new URL('../src/components/admin/v2/AdminControlSurface.css',import.meta.url),'utf8');
const require=createRequire(import.meta.url);const {SERVICES:payload}=require('C:/Golfriend/gf-packet0-20260824/tee-economy-dashboard-function/backend-tee-economy/serviceCatalogue.js');
const visible=service=>[service.name,service.outcome,service.area,service.launchStatus,service.economyTreatment,service.ledgerReadiness==='READY'&&service.directorPricingPermitted?'Ready to configure':service.economyTreatment==='FREE'?'Price locked':'Not ready',service.readinessReason];
for(const header of ['Service','What member gets','Area','Launch status','Economy treatment','Pricing readiness','Reason / next step'])assert.equal(source.includes(header),true,header);
for(const row of payload){for(const cell of visible(row))assert.ok(String(cell).length>0,`${row.serviceId} has a blank visible cell`);}
assert.deepEqual(visible(payload[0]),['Room entry','Enter a Golfriend room and join the conversation.','Lounge','LIVE','FREE','Price locked','Free for launch and permanently locked against Tee pricing; the legacy admission writer is not a canonical post-trace lifecycle writer.']);
assert.deepEqual(visible(payload[1]),['Booking concierge','Request assisted tee-time booking support.','Play Golf','LIVE','PENDING','Not ready','Reservation, settlement, and release still use quantity-lot accounting; canonical per-Tee lifecycle migration is required.']);
assert.match(source,/economy-service-catalogue/);assert.match(css,/overflow-x:auto/);assert.match(css,/color:#f4f8fc/);
console.log('Economy Service Catalogue component contract PASS');
