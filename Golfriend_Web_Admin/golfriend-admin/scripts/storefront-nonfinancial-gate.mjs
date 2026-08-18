import { readFileSync } from 'node:fs';
const file = new URL('../src/components/public/B2BStorefront.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const raw = readFileSync(file, 'utf8');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' ')).replace(/([^:])\/\/[^\n]*/g, '$1');
const checks = [
  ['obsolete Stripe test-link architecture removed', !/_preservedRouteToStripe_doNotCall|buy\.stripe\.com/.test(code)],
  ['subscription is explicitly unavailable', /data-policy-unavailable="non-financial-precommission"/.test(raw)],
  ['existing partner login remains', /signInWithEmailAndPassword/.test(raw)],
  ['partner sign-up remains absent', !/createUserWithEmailAndPassword/.test(code)],
  ['public storefront subscription handler remains absent', !/handleSubscribe/.test(code)],
];
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`Storefront non-financial gate: ${checks.length}/${checks.length} passed`);
