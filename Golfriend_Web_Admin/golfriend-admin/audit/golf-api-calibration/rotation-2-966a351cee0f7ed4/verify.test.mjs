import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),d=require('../../../functions-course-catalogue/domain.js'),directory=path.dirname(fileURLToPath(import.meta.url)),verifier=path.join(directory,'verify.mjs'),packetPath=path.join(directory,'packet.json');
test('committed calibration deployment packet verifies',()=>{const result=spawnSync(process.execPath,[verifier],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).valid,true);});
test('altered revision rejects even with recomputed outer packet digest',()=>{const packet=JSON.parse(fs.readFileSync(packetPath,'utf8'));packet.providerFunctions.runGolfApiCalibrationCanary.revisionResource=packet.providerFunctions.runGolfApiCalibrationCanary.revisionResource.replace('00001-joj','00002-bad');const payload={...packet};delete payload.packetDigest;packet.packetDigest=d.digest(payload);const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'golf-api-calibration-deployment-')),altered=path.join(temporary,'altered.json');try{fs.writeFileSync(altered,JSON.stringify(packet));const result=spawnSync(process.execPath,[verifier,altered],{encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/FUNCTION_REVISION_UNBOUND/);}finally{fs.rmSync(temporary,{recursive:true,force:true});}});
