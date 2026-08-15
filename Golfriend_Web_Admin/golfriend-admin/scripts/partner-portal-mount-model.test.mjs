import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePartnerPortalMount} from '../src/components/smallBusiness/partnerPortalMountModel.ts';

const projection=(status='active')=>({schema:'golfriend.small-business.v1',state:'current',business:{businessId:'opaque_business_01',version:3,status},locations:[],plans:[],promotions:[],receipts:[],evidenceReferences:[{evidenceId:'opaque_evidence_01',kind:'registration',objectReference:'opaque_object_01',contentDigest:'a'.repeat(64)}]});

test('verified server projection mounts without client identity authority',()=>assert.equal(resolvePartnerPortalMount(projection()).state,'ready'));
test('suspension and terminal organization states fail closed',()=>['suspended','expired','rejected','closed'].forEach(status=>assert.equal(resolvePartnerPortalMount(projection(status)).state,'blocked')));
test('cross-organization and private document authority cannot be supplied by client fields',()=>['memberId','partnerUid','organizationId','storagePath','signedUrl'].forEach(key=>assert.equal(resolvePartnerPortalMount({...projection(),[key]:'forged'}).state,'unavailable')));
test('malformed or raw evidence fails closed',()=>assert.equal(resolvePartnerPortalMount({...projection(),evidenceReferences:[{evidenceId:'x',kind:'registration',objectReference:'x',contentDigest:'bad'}]}).state,'unavailable'));
test('surplus evidence fields and path-shaped object references fail closed',()=>{assert.equal(resolvePartnerPortalMount({...projection(),evidenceReferences:[{...projection().evidenceReferences[0],raw:'secret'}]}).state,'unavailable');assert.equal(resolvePartnerPortalMount({...projection(),evidenceReferences:[{...projection().evidenceReferences[0],objectReference:'private/path'}]}).state,'unavailable')});
test('approval is never inferred from absent or non-current authority',()=>{assert.equal(resolvePartnerPortalMount({...projection(),state:'empty'}).state,'unavailable');assert.equal(resolvePartnerPortalMount({schema:'golfriend.small-business.v1',state:'current'}).state,'unavailable')});
