import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ui = read('src/components/public/BookingHandoff.tsx');
let count = 0;
const check = (name, value) => {
  assert(value, name);
  count++;
  console.log(`PASS ${name}`);
};

check('localized retry request label', /retryRequest/.test(ui));
check('localized retry cancel label', /retryCancel/.test(ui));
check('localized retry send label', /retrySend/.test(ui));
check('request retry invokes request mechanism', ui.includes('onClick={handleRequest}') && ui.includes('requestAriaRetryLabel'));
check('request error branch renders retry button', ui.includes("failureAction === 'request'") && ui.includes('retryRequest'));
check('cancel error retry invokes cancel mechanism', ui.includes("failureAction === 'cancel'") && ui.includes('onClick={handleCancel}'));
check('send error retry invokes send mechanism', ui.includes("failureAction === 'send'") && ui.includes('onClick={handleSend}'));
check('status role for loading/pending success states', ui.includes('role="status" aria-live="polite"'));
check('alert role for errors', ui.includes('role="alert" aria-live="assertive"'));
check('loading status text rendered', ui.includes("setStatusMsg(t('requesting'))") || ui.includes("setStatusMsg(t('sending'))") || ui.includes("setStatusMsg(t('cancelling'))"));
check('retry controls clearly labeled', ui.includes('aria-label={requestAriaRetryLabel}') && (ui.includes("aria-label={t('retryCancel')}") || ui.includes("aria-label={t('retrySend')}")));
check('retry button rendered in failure branch', ui.includes('styles.retryBtn'));

console.log(`${count}/${count} booking handoff verification PASS`);
