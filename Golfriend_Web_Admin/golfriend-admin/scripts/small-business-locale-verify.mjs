import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/i18n/smallBusiness.ts',import.meta.url),'utf8');
const locales=['en','th','ko','ja','zh','es','fr','de'];
const interfaceBody=source.match(/export interface SmallBusinessCopy \{([^}]+)\}/s)?.[1]||'';
const keys=[...interfaceBody.matchAll(/([A-Za-z][A-Za-z0-9]*):string/g)].map(match=>match[1]);
assert.ok(keys.length>=40,`expected substantial operational copy, found ${keys.length}`);
assert.doesNotMatch(source,/\.\.\.en\b/,'locale dictionaries may not inherit English');
for(let index=0;index<locales.length;index++){
 const locale=locales[index],next=locales[index+1];
 const start=source.indexOf(`const ${locale}:SmallBusinessCopy={`);
 const end=next?source.indexOf(`const ${next}:SmallBusinessCopy={`):source.indexOf('export const SMALL_BUSINESS_COPY');
 assert.ok(start>=0&&end>start,`${locale}: dictionary missing`);
 const body=source.slice(start,end);
 for(const key of keys){
  const matches=[...body.matchAll(new RegExp(`(?:^|[,\\{])${key}:'([^']*)'`,'g'))];
  assert.equal(matches.length,1,`${locale}.${key}: must be independently defined exactly once`);
  const value=matches[0][1].trim();
  assert.ok(value.length>=2&&value.length<=500,`${locale}.${key}: invalid length`);
  assert.doesNotMatch(value,/\b(?:TODO|TBD|PLACEHOLDER|undefined|null)\b/i,`${locale}.${key}: placeholder copy`);
  assert.notEqual(value,key,`${locale}.${key}: raw key leaked`);
 }
}
console.log(`Small Business locales verified: ${locales.length}/${locales.length} x ${keys.length} independent keys`);
