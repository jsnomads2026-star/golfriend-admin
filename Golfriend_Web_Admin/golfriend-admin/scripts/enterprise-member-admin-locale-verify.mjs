import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/i18n/admin/enterpriseMemberCommissioning.ts',import.meta.url),'utf8');
const locales=['en','th','ko','ja','zh','es','fr','de'];
const block=(locale)=>{const start=source.indexOf(`const ${locale}${locale==='en'?'=':':EnterpriseMemberCommissioningCopy='}`);const end=source.indexOf('\n};',start);assert.ok(start>=0&&end>start,`${locale} copy block missing`);return source.slice(start,end)};
const keys=(value)=>new Set([...value.matchAll(/(?:^|[,{])\s*([A-Za-z][A-Za-z0-9_]*):/g)].map(match=>match[1]));
const english=keys(block('en'));assert.equal(english.size,95,'canonical English operational key count');
for(const locale of locales){const actual=keys(block(locale));assert.deepEqual([...actual].sort(),[...english].sort(),`${locale} operational copy keys`);console.log(`PASS ${locale}: ${actual.size} keys`)}
assert.deepEqual(locales,['en','th','ko','ja','zh','es','fr','de']);
console.log(`8/8 locales with ${english.size} operational keys`);
