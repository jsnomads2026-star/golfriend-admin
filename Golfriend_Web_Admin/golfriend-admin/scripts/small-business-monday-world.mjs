import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixturePath=resolve(root,'fixtures/lanec-clean-v2-seed.json');
export const loadWorld=()=>JSON.parse(readFileSync(fixturePath,'utf8')).small_business_test_world;
export const resetWorld=()=>structuredClone(loadWorld());
export const seedWorld=()=>{const world=resetWorld();return {schema:world.schema,clock:world.clock,productionWrites:false,documents:[...world.identities.map(value=>({collection:'members',id:value.uid,value})),...world.businesses.map(value=>({collection:'small_businesses',id:value.businessId,value})),...world.subscriptionFacts.map((value,index)=>({collection:'small_business_subscription_test_facts',id:`fact_${String(index+1).padStart(2,'0')}`,value}))]}};
export const verifyWorld=(world=loadWorld())=>{
 const errors=[];const ids=new Set();
 const require=(condition,message)=>{if(!condition)errors.push(message)};
 require(world.schema==='golfriend.small-business.monday-world.v1','schema');require(world.productionWrites===false,'productionWrites');require(world.identities.length===3,'identities');require(world.businesses.length===6,'businesses');require(world.scenarios.length===21,'scenarios');
 for(const business of world.businesses){require(!ids.has(business.businessId),`duplicate business ${business.businessId}`);ids.add(business.businessId);const locationIds=new Set();for(const location of business.locations){require(!locationIds.has(location.locationId),`duplicate location ${location.locationId}`);locationIds.add(location.locationId)}}
 const cafe=world.businesses.find(value=>value.businessId==='sb_cafe_siam');require(cafe?.locations.length===2,'two-location cafe');require(world.reportingFacts.promotionGolfriendRevenue===0,'zero promotion revenue');require(world.reportingFacts.externalCommissionIsGolfriendRevenue===false,'external commission separation');require(world.reportingFacts.jhccTransmission===false,'no JHCC transmission');
 const digest=createHash('sha256').update(JSON.stringify(world)).digest('hex');return {ok:errors.length===0,errors,digest,counts:{businesses:world.businesses.length,identities:world.identities.length,scenarios:world.scenarios.length}};
};

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=verifyWorld();if(!result.ok){console.error(result.errors.join('\n'));process.exit(1)}
 const outputArg=process.argv.find(value=>value.startsWith('--output='));
 if(outputArg){const output=resolve(outputArg.slice(9));writeFileSync(output,`${JSON.stringify(seedWorld(),null,2)}\n`,'utf8');console.log(`Synthetic reset/seed package written to ${output}`)}
 console.log(`Small Business Monday world verified: ${result.counts.businesses} businesses, ${result.counts.identities} identities, ${result.counts.scenarios} scenarios, ${result.digest}`);
}
