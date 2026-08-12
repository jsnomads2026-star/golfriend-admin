import { readFileSync } from 'node:fs';
const file = new URL('../src/components/public/B2BStorefront.tsx', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const raw = readFileSync(file, 'utf8');
const code = raw.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' ')).replace(/([^:])\/\/[^\n]*/g, '$1');
const active = code.replace(/function\s+_preserved[\s\S]*?^}/m, '');
const checks = [
  ['preserved Stripe architecture retained as dead code', /function\s+_preservedRouteToStripe_doNotCall/.test(raw)],
  ['preserved Stripe router is not called', !/\b_preservedRouteToStripe_doNotCall\s*\(/.test(active)],
  ['no active Stripe URL', !/buy\.stripe\.com/.test(active)],
  ['subscription is explicitly unavailable', /data-policy-unavailable="non-financial-precommission"/.test(raw)],
  ['existing partner login remains', /signInWithEmailAndPassword/.test(raw)],
  ['partner sign-up remains absent', !/createUserWithEmailAndPassword/.test(code)],
  ['active subscription handler remains absent', !/handleSubscribe/.test(code)],
];
for (const [label, ok] of checks) console.log(`${ok ? '✓' : '✗'} ${label}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log(`Storefront non-financial gate: ${checks.length}/${checks.length} passed`);
