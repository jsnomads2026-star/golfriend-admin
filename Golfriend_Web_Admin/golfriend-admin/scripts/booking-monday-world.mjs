import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const manifestPath=new URL('../fixtures/monday-booking-world.v1.json',import.meta.url);
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const digest=value=>createHash('sha256').update(stable(value)).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));
const TOP=['schema','fixtureId','seed','fixedNow','sourceIdentityCommit','mappingAuthority','courseCompatibility','runtime','identities','services','courses','bookingRequest','economicTruth','commissioningPorts','locales','scenarios'];
const PORTS=['f7_producer_identity_manifest','hmac_multi_key_provider','durable_nonce_store','verified_active_member_authority','authoritative_booking_source','enterprise_transport_outbox_consumer','approved_message_transmitter','scheduler_provider_evidence_adapter'];
const LOCALES=['en','th','ko','ja','zh','es','fr','de'];
const PINNED_DIGEST='243013439066e863f6db23d98045e029164a2952647cbd958c456ca97e421380';
function verify(value){
 if(!exact(value,TOP)||value.schema!=='golfriend.booking-monday-world.v1'||value.sourceIdentityCommit!=='ce37bf542d771520198695450b7bab3ac3e78c16'||!Number.isFinite(Date.parse(value.fixedNow)))throw Error('MONDAY_WORLD_INVALID');
 if(value.runtime?.localTestOnly!==true||value.runtime?.loopbackOnly!==true||value.runtime?.runtimeSeedingEnabled!==false||value.runtime?.productionWrites!==0||value.runtime?.providerTransmissions!==0||value.runtime?.credentialsIncluded!==false)throw Error('MONDAY_WORLD_RUNTIME_BOUNDARY_INVALID');
 if(value.identities?.length!==11||new Set(value.identities.map(item=>item.role)).size!==11||value.courses?.length!==11||new Set(value.courses.map(item=>item.courseId)).size!==11||value.scenarios?.length!==52||new Set(value.scenarios.map(item=>item.id)).size!==52||value.scenarios.some(item=>!exact(item,['id','surface','expected'])||!['golfer','enterprise','economy'].includes(item.surface)))throw Error('MONDAY_WORLD_RECORD_INVALID');
 if(JSON.stringify(value.locales)!==JSON.stringify(LOCALES)||JSON.stringify(value.commissioningPorts)!==JSON.stringify(PORTS)||value.services.some(item=>item.transmissionIncluded!==false))throw Error('MONDAY_WORLD_PORT_OR_LOCALE_INVALID');
 const economy=value.economicTruth;if(economy.golfriendBookingPayment!==false||economy.stripe!==false||economy.escrow!==false||economy.refundProcessing!==false||economy.bookingCommissionRecognized!==false||economy.messageRevenue!==false||economy.coursePricePayableTo!=='course'||economy.separateTeeActionAuthority!=='EconomyConfig'||economy.separateTeeActionIsCoursePayment!==false||economy.cancellationCreatesRefund!==false)throw Error('MONDAY_WORLD_ECONOMY_INVALID');
 const identityMapping=value.identities.map(item=>({role:item.role,personaId:item.personaId,golferRef:item.golferRef??null,staffRef:item.staffRef??null})),courseMapping=value.courses.map(item=>({courseId:item.courseId,fixture:item.fixture,version:item.version})),mapping=value.mappingAuthority;
 if(mapping.identityMappingDigest!==digest(identityMapping)||mapping.courseMappingDigest!==digest(courseMapping)||mapping.identityGraphCommit!==value.sourceIdentityCommit||mapping.courseSeedCommit!=='1df39a958dc82244b879ac50f3d616db2fe66ae1'||mapping.courseAlias?.sourceAlias!=='course-ew-burapha-01'||mapping.courseAlias?.canonicalCourseId!=='ex_course_riverbend'||mapping.courseAlias?.sourceCommit!==mapping.courseSeedCommit||mapping.catalogueCommissioned!==false||mapping.heuristicInference!==false)throw Error('MONDAY_WORLD_MAPPING_INVALID');
 if(/sk_live|sk_test|PRIVATE KEY|memberUid|email@|paymentIntent/i.test(JSON.stringify(value)))throw Error('MONDAY_WORLD_PRIVATE_OR_SECRET_FACT');
 return value;
}
const command=process.argv[2]||'verify';let result;
if(command==='verify'||command==='manifest'){const value=digest(verify(manifest));if(value!==PINNED_DIGEST)throw Error('MONDAY_WORLD_PINNED_DIGEST_MISMATCH');result={schema:'golfriend.booking-monday-world-digest.v1',digest:value,scenarioCount:52,identityCount:11,courseCount:11};}
else if(command==='seed'||command==='reset'){const value=digest(verify(manifest));if(value!==PINNED_DIGEST)throw Error('MONDAY_WORLD_PINNED_DIGEST_MISMATCH');result={schema:`golfriend.booking-monday-world-${command}.v1`,mode:'memory_only',digest:value,writes:0,transmissions:0};}
else if(command==='compare'){const other=verify(JSON.parse(readFileSync(resolve(process.argv[3]),'utf8'))),localDigest=digest(verify(manifest)),otherDigest=digest(other);if(localDigest!==otherDigest)throw Error('MONDAY_WORLD_DIGEST_MISMATCH');result={schema:'golfriend.booking-monday-world-comparison.v1',equal:true,digest:localDigest}}
else throw Error('command must be verify, manifest, seed, reset, or compare');
console.log(JSON.stringify(result));
