#!/usr/bin/env node
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const d=require('../../../functions-course-catalogue/domain.js');
const packet=JSON.parse(fs.readFileSync(process.argv[2]||new URL('./packet.json',import.meta.url),'utf8'));
const fail=message=>{throw Error(message);};
const equal=(actual,expected,message)=>{if(actual!==expected)fail(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);};
const same=(actual,expected,message)=>equal(d.canonicalJson(actual),d.canonicalJson(expected),message);
const packetPayload={...packet};delete packetPayload.packetDigest;
equal(d.digest(packetPayload),packet.packetDigest,'PACKET_DIGEST_INVALID');
equal(packet.immutable,true,'PACKET_NOT_IMMUTABLE');
equal(packet.providerRequestsDuringExport,0,'EXPORT_PROVIDER_REQUESTS_NONZERO');
equal(packet.secretValueAccessed,false,'SECRET_VALUE_ACCESS_INVALID');

const activation=packet.activationReceipt;
equal(d.activationReceiptMatches(activation.payload,activation.digest),true,'ACTIVATION_DIGEST_INVALID');
equal(activation.state,'verified','ACTIVATION_NOT_VERIFIED');
equal(activation.bindingState,'current','ACTIVATION_NOT_CURRENT');
equal(activation.immutable,true,'ACTIVATION_NOT_IMMUTABLE');

const canary=packet.canaryReceipt;
equal(d.canaryReceiptMatches(canary),true,'CANARY_DIGEST_INVALID');
equal(canary.immutable,true,'CANARY_NOT_IMMUTABLE');
equal(canary.providerRequestCount,1,'CANARY_REQUEST_COUNT_INVALID');
equal(canary.weightedAmount,.1,'CANARY_WEIGHT_INVALID');
equal(canary.detailsPerRun,0,'CANARY_DETAILS_INVALID');
equal(canary.requestedPath,'/api/v2.3/clubs?pageSize=200','CANARY_PATH_INVALID');
equal(canary.responseValidation.valid,true,'CANARY_RESPONSE_INVALID');
equal(canary.responseValidation.requestedPageSize,200,'CANARY_PAGE_SIZE_INVALID');
equal(canary.responseValidation.clubCount,200,'CANARY_CLUB_COUNT_INVALID');
equal(canary.failure,null,'CANARY_FAILURE_PRESENT');
equal(canary.zeroCourseWrites,true,'ZERO_WRITE_ASSERTION_MISSING');
same(canary.recordCountsBefore,canary.recordCountsAfter,'CATALOGUE_COUNTS_CHANGED');

const evidence=packet.quotaEvidence;
equal(d.digest(evidence.payload),evidence.derivedDigest,'QUOTA_EVIDENCE_DIGEST_INVALID');
equal(evidence.payload.immutable,true,'QUOTA_EVIDENCE_NOT_IMMUTABLE');
equal(evidence.documentId,canary.providerEvidenceId,'QUOTA_EVIDENCE_LINK_INVALID');
equal(evidence.payload.runId,canary.runId,'QUOTA_EVIDENCE_RUN_INVALID');
equal(evidence.payload.responseDigest,canary.responseDigest,'RESPONSE_DIGEST_LINK_INVALID');
equal(evidence.payload.cost,canary.weightedAmount,'QUOTA_EVIDENCE_COST_INVALID');
equal(evidence.payload.providerReportedRemaining,canary.providerRemaining,'PROVIDER_REMAINING_INVALID');

const reservation=packet.reservation;
equal(reservation.documentId,evidence.payload.reservationId,'RESERVATION_LINK_INVALID');
equal(reservation.status,'completed','RESERVATION_NOT_COMPLETED');
equal(reservation.runId,canary.runId,'RESERVATION_RUN_INVALID');
equal(reservation.responseDigest,canary.responseDigest,'RESERVATION_RESPONSE_DIGEST_INVALID');
equal(reservation.cost,.1,'RESERVATION_COST_INVALID');
equal(reservation.providerReportedRemaining,canary.providerRemaining,'RESERVATION_REMAINING_INVALID');
equal(reservation.pathDigest,d.digest(canary.requestedPath),'RESERVATION_PATH_DIGEST_INVALID');

const ledger=packet.quotaLedger;
equal(ledger.lastSettledRunId,canary.runId,'LEDGER_RUN_INVALID');
equal(ledger.weightedCompleted,canary.quotaAfter.weightedCompleted,'LEDGER_COMPLETED_INVALID');
equal(ledger.weightedFailed,canary.quotaAfter.weightedFailed,'LEDGER_FAILED_INVALID');
equal(ledger.weightedReserved,canary.quotaAfter.weightedReserved,'LEDGER_RESERVED_INVALID');
equal(ledger.providerReportedRemaining,canary.quotaAfter.providerReportedRemaining,'LEDGER_REMAINING_INVALID');
equal(Math.round((canary.quotaAfter.weightedCompleted-canary.quotaBefore.weightedCompleted)*10)/10,.1,'LEDGER_DELTA_INVALID');

const config=packet.finalSafetyState.configuration,checkpoint=packet.finalSafetyState.checkpoint;
equal(config.bindingReceiptId,activation.documentId,'CONFIG_BINDING_INVALID');
equal(config.providerRequestsAllowed,false,'PROVIDER_GATE_OPEN');
equal(config.canaryRequestsAllowed,false,'CANARY_GATE_OPEN');
equal(config.enabled,false,'PIPELINE_ENABLED');
equal(config.canaryState,'consumed','CANARY_NOT_CONSUMED');
equal(checkpoint.state,'blocked','CHECKPOINT_NOT_BLOCKED');
equal(checkpoint.providerRequestsAllowed,false,'CHECKPOINT_PROVIDER_GATE_OPEN');
equal(checkpoint.leaseToken,null,'CHECKPOINT_LEASE_PRESENT');

const expectedFunctions=['scheduledGolfApiCatalogueCanary','scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries'];
same(Object.keys(packet.deployedMetadata.providerFunctions).sort(),expectedFunctions,'FUNCTION_SET_INVALID');
same(Object.keys(packet.deployedMetadata.schedulers).sort(),expectedFunctions,'SCHEDULER_SET_INVALID');
const expectedServices=Object.values(packet.deployedMetadata.providerFunctions).map(item=>item.service).sort();
for(const [name,fn] of Object.entries(packet.deployedMetadata.providerFunctions)){
  equal(fn.state,'ACTIVE',`FUNCTION_NOT_ACTIVE:${name}`);
  equal(fn.secretBinding.version,'2',`FUNCTION_SECRET_VERSION_INVALID:${name}`);
  const revision=d.normalizeRevisionIdentity(fn.revisionResource,fn.service);
  if(!revision)fail(`FUNCTION_REVISION_MALFORMED:${name}`);
  equal(d.activationRevisionBindingsMatch(activation.payload.functionRevisions,expectedServices,fn.service,revision),true,`FUNCTION_REVISION_UNBOUND:${name}`);
}
for(const [name,job] of Object.entries(packet.deployedMetadata.schedulers))equal(job.state,'PAUSED',`SCHEDULER_NOT_PAUSED:${name}`);

const requested=packet.sourceReads.find(item=>item.path==='golf_api_quota_reservations/20291da5-20291da5-c734-41ed-9d62-cc6600a69466');
equal(requested?.found,false,'REQUESTED_RESERVATION_DISCREPANCY_MISSING');
const resolved=packet.sourceReads.find(item=>item.path===`golf_api_quota_reservations/${reservation.documentId}`);
equal(resolved?.found,true,'RESOLVED_RESERVATION_READ_MISSING');
const serialized=JSON.stringify(packet).toLowerCase();
for(const marker of ['access_token','refresh_token','providerresponsebody','rawproviderresponse'])if(serialized.includes(marker))fail(`FORBIDDEN_SECRET_OR_BODY_FIELD:${marker}`);

console.log(JSON.stringify({valid:true,packetDigest:packet.packetDigest,activationDigest:activation.digest,canaryDigest:canary.digest,quotaEvidenceDigest:evidence.derivedDigest,providerRequests:canary.providerRequestCount,weightedAmount:canary.weightedAmount,zeroWrites:canary.zeroCourseWrites,finalGates:{providerRequestsAllowed:config.providerRequestsAllowed,canaryRequestsAllowed:config.canaryRequestsAllowed,checkpoint:checkpoint.state,schedulers:Object.fromEntries(Object.entries(packet.deployedMetadata.schedulers).map(([name,job])=>[name,job.state]))}}));
