import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nearbyClubHouses} from '../src/components/public/clubhouseDiscoveryModel.mjs';
const origin={latitude:12.9236,longitude:100.8825};
const rows=nearbyClubHouses([{clubhouseId:'siam',displayName:'Siam Country Club',country:'Thailand',coordinateVerified:true,location:{latitude:12.909432,longitude:101.008623}},{clubhouseId:'unverified',displayName:'Unverified Club',country:'Thailand',location:{latitude:12.91,longitude:101.01}},{clubhouseId:'seoul',displayName:'Seoul Siam',coordinateVerified:true,location:{latitude:14.733029,longitude:101.409471}}],origin,50);
assert.equal(rows.length,1); assert.deepEqual(Object.keys(rows[0]).sort(),['area','clubHouseId','clubHouseName','distanceKm']); assert.equal(rows[0].clubHouseId,'siam'); assert.equal(rows[0].clubHouseName,'Siam Country Club'); assert.ok(rows[0].distanceKm<=50); assert.doesNotMatch(JSON.stringify(rows),/layout|course|provider|secret|token|authorization/i);
assert.deepEqual(nearbyClubHouses([{clubhouseId:'unknown',displayName:'Unknown',location:{latitude:12.9,longitude:101}}],origin,50),[]); assert.deepEqual(nearbyClubHouses([{clubhouseId:'unknown',displayName:'Unknown',coordinateVerified:true,location:{latitude:12.9,longitude:101}}],null,50),[]);
const discovery=readFileSync(new URL('../src/components/public/CourseDiscovery.tsx',import.meta.url),'utf8'); assert.match(discovery,/nearbyClubHouses/); assert.match(discovery,/layoutIdsByClubhouse/); assert.match(discovery,/setSelectedSlot\(s\)/); assert.doesNotMatch(discovery,/selectedDestination\.layoutIds/);
console.log('clubhouse discovery: verified-coordinate fail-closed and member DTO boundary passed.');
