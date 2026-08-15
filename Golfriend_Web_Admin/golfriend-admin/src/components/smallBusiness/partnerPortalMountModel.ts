import type {PortalProjection} from './smallBusinessModel';

export type PartnerPortalMount =
  | {state:'ready';projection:PortalProjection}
  | {state:'blocked'|'unavailable';projection:null};

const blockedStatuses=new Set(['suspended','expired','rejected','closed']);
const forbidden=/(memberId|partnerUid|organizationId|ownerId|email|phone|storagePath|signedUrl|rawDocument)/i;
const opaque=/^[A-Za-z0-9_-]{3,128}$/;

export function resolvePartnerPortalMount(value:unknown):PartnerPortalMount{
  if(!value||typeof value!=='object'||forbidden.test(JSON.stringify(value)))return{state:'unavailable',projection:null};
  const projection=value as PortalProjection;
  if(projection.schema!=='golfriend.small-business.v1'||projection.state!=='current'||!projection.business)return{state:'unavailable',projection:null};
  if(blockedStatuses.has(projection.business.status))return{state:'blocked',projection:null};
  const evidence=projection.evidenceReferences||[];
  if(!Array.isArray(evidence)||evidence.some(item=>!item||Object.keys(item).sort().join(',')!=='contentDigest,evidenceId,kind,objectReference'||!opaque.test(item.evidenceId)||!opaque.test(item.kind)||!opaque.test(item.objectReference)||!/^[a-f0-9]{64}$/.test(item.contentDigest)))return{state:'unavailable',projection:null};
  return{state:'ready',projection};
}
