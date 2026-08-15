import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/i18n/admin/enterpriseMemberRequests.ts',import.meta.url),'utf8');
assert.doesNotMatch(source,/\blocalized\s*\(/,'fallback factory must not be used');
assert.doesNotMatch(source,/\.\.\.\s*en\b/,'English spread fallback must not be used');

const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ENTERPRISE_MEMBER_ADMIN_COPY:copy}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const locales=['en','th','ko','ja','zh','es','fr','de'];
assert.deepEqual(Object.keys(copy),locales,'exact locale set and ordering');

const englishKeys=Object.keys(copy.en).sort();
assert.ok(englishKeys.length>=50,'complete Admin dictionary');
const placeholders=value=>value.match(/\{\{?[A-Za-z][A-Za-z0-9_.-]*\}?\}|%\d*\$?[sdif]/g)?.sort()??[];
const naturalInvariant=new Set(['de:status']);

for(const locale of locales){
 const dictionary=copy[locale];
 assert.deepEqual(Object.keys(dictionary).sort(),englishKeys,`${locale} key parity`);
 for(const key of englishKeys){
  const value=dictionary[key];
  assert.equal(typeof value,'string',`${locale}.${key} is text`);
  assert.equal(value,value.trim(),`${locale}.${key} has no edge whitespace`);
  assert.ok(value.length>0,`${locale}.${key} is nonempty`);
  assert.ok(value.length<=240,`${locale}.${key} remains usable in mounted UI`);
  assert.deepEqual(placeholders(value),placeholders(copy.en[key]),`${locale}.${key} placeholder parity`);
  if(locale!=='en'&&!naturalInvariant.has(`${locale}:${key}`)) assert.notEqual(value,copy.en[key],`${locale}.${key} is not an English fallback`);
 }
}

assert.match(Object.values(copy.th).join(''),/[\u0E00-\u0E7F]/,'Thai copy uses Thai script');
assert.match(Object.values(copy.ko).join(''),/[\uAC00-\uD7AF]/,'Korean copy uses Hangul');
assert.match(Object.values(copy.ja).join(''),/[\u3040-\u30FF]/,'Japanese copy uses kana');
assert.match(Object.values(copy.zh).join(''),/[\u3400-\u9FFF]/,'Chinese copy uses Han characters');

const destructiveTerms={
 en:{reject:/reject/i,cancelDelivery:/cancel/i},th:{reject:/ปฏิเสธ/,cancelDelivery:/ยกเลิก/},ko:{reject:/거부/,cancelDelivery:/취소/},
 ja:{reject:/却下/,cancelDelivery:/取り消/},zh:{reject:/拒绝/,cancelDelivery:/取消/},es:{reject:/rechazar/i,cancelDelivery:/cancelar/i},
 fr:{reject:/rejeter/i,cancelDelivery:/annuler/i},de:{reject:/ablehnen/i,cancelDelivery:/stornieren/i},
};
for(const locale of locales){
 assert.match(copy[locale].reject,destructiveTerms[locale].reject,`${locale} reject label is explicit`);
 assert.match(copy[locale].cancelDelivery,destructiveTerms[locale].cancelDelivery,`${locale} cancellation label is explicit`);
 assert.notEqual(copy[locale].reject,copy[locale].close,`${locale} rejection is distinct from closing detail`);
 assert.notEqual(copy[locale].cancelDelivery,copy[locale].approveDelivery,`${locale} cancellation is distinct from approval`);
}

console.log(`PASS ${locales.length} independent locales × ${englishKeys.length} keys`);
console.log('PASS key, placeholder, nonempty, no-fallback, length and destructive-label checks');
