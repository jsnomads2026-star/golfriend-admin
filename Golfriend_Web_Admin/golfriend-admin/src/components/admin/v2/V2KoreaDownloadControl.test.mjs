import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('./V2KoreaDownloadControl.tsx',import.meta.url),'utf8'),service=readFileSync(new URL('./courseOperationsService.ts',import.meta.url),'utf8');
test('global cutover control is Director and App Check gated with authoritative fields only',()=>{for(const marker of ['identity.role===\'Director\'','identity.appCheck===true','service.startGlobalCatalogueCutover()','service.loadCountryIngestionProjection()','Start global catalogue cutover','Receipt ID','Provider calls','Quota remaining','Next country'])assert.ok(source.includes(marker),marker);assert.ok(service.includes("httpsCallable(functions,'startGlobalCatalogueCutover')({confirmed:true})"));assert.ok(service.includes("httpsCallable(functions,'getCourseCountryIngestionProjection')()"));});
