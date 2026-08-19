import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const d=require('../../../functions-course-catalogue/domain.js');
const directory=path.dirname(fileURLToPath(import.meta.url));
const verifier=path.join(directory,'verify.mjs');
const packetPath=path.join(directory,'packet.json');

test('committed operational evidence packet verifies',()=>{
  const result=spawnSync(process.execPath,[verifier],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).valid,true);
});

test('altered receipt evidence rejects even with recomputed outer packet digest',()=>{
  const packet=JSON.parse(fs.readFileSync(packetPath,'utf8'));
  packet.canaryReceipt.responseValidation.clubCount=199;
  const payload={...packet};
  delete payload.packetDigest;
  packet.packetDigest=d.digest(payload);
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'golf-api-canary-evidence-'));
  const altered=path.join(temporary,'altered-packet.json');
  try{
    fs.writeFileSync(altered,JSON.stringify(packet));
    const result=spawnSync(process.execPath,[verifier,altered],{encoding:'utf8'});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/CANARY_DIGEST_INVALID/);
  }finally{
    fs.rmSync(temporary,{recursive:true,force:true});
  }
});
