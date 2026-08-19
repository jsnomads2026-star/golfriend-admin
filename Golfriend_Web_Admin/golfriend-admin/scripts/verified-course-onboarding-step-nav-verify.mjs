import assert from"node:assert/strict";
import{readFileSync}from"node:fs";

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const ui=read("src/components/B2B/VerifiedCourseOnboarding.tsx");
let checks=0;
const test=(name,fn)=>{fn();console.log(`ok ${++checks} - ${name}`);};

test("step navigator derives aria-current from onboarding state",()=>{
  assert.match(ui,/const currentStep=/);
  assert.match(ui,/const boundedStep=/);
  assert.match(ui,/aria-current=\{i===boundedStep\?"step":undefined\}/);
  assert.doesNotMatch(ui,/i===0\?"step":undefined/);
});

test("mapping includes initial, middle, and final states",()=>{
  assert.match(ui,/if\(status==="draft"\).*return 0/);
  assert.match(ui,/if\(status==="submitted"\).*return 3/);
  assert.match(ui,/if\(status==="under_review"\).*return 4/);
  assert.match(ui,/if\(\["approved_for_trial","trial_active","trial_expiring","trial_expired","conversion_review","active_partner","declined","suspended","withdrawn","unavailable"\]\.includes\(status\)\) return 4/);
});

test("only one computed step is announced",()=>{
  assert.match(ui,/map\(\(x,i\)=>?<li/);
  assert.match(ui,/key=\{x\}\s*aria-current=\{i===boundedStep\?"step":undefined\}/);
  assert.match(ui,/Math\.min\(currentStep,t\.stepLabels\.length-1\)/);
});

test("aria-current only in steps list",()=>{
  const ariaCurrentMatches=[...ui.matchAll(/aria-current=/g)];
  assert.equal(ariaCurrentMatches.length,1);
});

console.log(`verified course onboarding step-nav verifier: ${checks} checks passed.`);
