import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LOCALE_CODES } from '../src/i18n/locales.ts';
import { PLAY_BOOKING_DESK } from '../src/i18n/partner/playBookingDesk.ts';

const canonical = ['en', 'th', 'ko', 'ja', 'zh', 'es', 'fr', 'de'];
const replacementCharacter = /\uFFFD/;
const unsafeCommercialClaim = /(?:[$€£¥฿₩]|\b(?:pay now|fee due|payment confirmed|payment received|charged successfully|invoice issued|refund issued|settlement completed|wallet balance)\b)/iu;

test('booking desk uses the exact canonical eight locales in order', () => {
  assert.deepEqual([...LOCALE_CODES], canonical);
  assert.deepEqual(Object.keys(PLAY_BOOKING_DESK), canonical);
});

test('every booking desk locale has exact key parity and nonblank copy', () => {
  const keys = Object.keys(PLAY_BOOKING_DESK.en);
  assert.ok(keys.length >= 50, 'booking desk copy must cover the complete operational surface');
  for (const locale of canonical) {
    assert.deepEqual(Object.keys(PLAY_BOOKING_DESK[locale]), keys, `${locale} key mismatch`);
    for (const key of keys) {
      const value = PLAY_BOOKING_DESK[locale][key];
      assert.equal(typeof value, 'string', `${locale}.${key} must be a string`);
      assert.ok(value.trim().length > 0, `${locale}.${key} must not be blank`);
      assert.doesNotMatch(value, replacementCharacter, `${locale}.${key} contains a replacement character`);
    }
  }
});

test('translated locales contain substantive copy and no English spread placeholders', () => {
  const keys = Object.keys(PLAY_BOOKING_DESK.en);
  const source = readFileSync(fileURLToPath(new URL('../src/i18n/partner/playBookingDesk.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(source, /\.\.\.(?:EN|PLAY_BOOKING_DESK\.en)|Object\.assign\([^)]*\.en/u);
  for (const locale of canonical.slice(1)) {
    const translated = keys.filter((key) => PLAY_BOOKING_DESK[locale][key] !== PLAY_BOOKING_DESK.en[key]);
    assert.ok(translated.length / keys.length >= 0.9, `${locale} must translate at least 90% of booking desk copy`);
  }
});

test('copy is privacy-honest and makes no forbidden financial claims', () => {
  for (const locale of canonical) {
    const copy = Object.values(PLAY_BOOKING_DESK[locale]).join(' ');
    assert.doesNotMatch(copy, unsafeCommercialClaim, `${locale} contains a financial authority claim`);
  }
  assert.match(PLAY_BOOKING_DESK.en.privacyBoundary, /minimum booking details/i);
  assert.match(PLAY_BOOKING_DESK.en.providerBoundary, /does not process payment or settlement/i);
  assert.match(PLAY_BOOKING_DESK.en.operationError, /No success is claimed/i);
});

test('operational copy covers statuses, actions, accessibility, recovery and acknowledgement', () => {
  for (const key of [
    'statusPending', 'statusAlternative', 'statusConfirmed', 'statusCancelled', 'statusCompleted', 'statusUnknown',
    'confirm', 'proposeAlternative', 'cancel', 'complete', 'messageMember', 'reload', 'retry',
    'sectionLabel', 'actionsLabel', 'outcomeLabel', 'dialogCloseLabel',
    'loadError', 'operationError', 'staleError', 'invalidDataError', 'notificationUnavailable',
    'privacyBoundary', 'providerBoundary', 'referenceLabel', 'acknowledged', 'noChange',
  ]) assert.ok(PLAY_BOOKING_DESK.en[key], `missing required operational key ${key}`);
});

test('projection freshness and reconciliation copy is complete in every locale',()=>{
  for(const key of ['projectionVersionLabel','projectionGeneratedAtLabel','projectionExpiresAtLabel','projectionFresh','projectionStale','statusSubmitted','statusUnderReview','statusCancellationRequested','statusCancellationAccepted','statusCancellationDeclined','operationPending','operationAmbiguous','manualReconciliationRequired','previewConfirmationTitle','previewConfirmationBody','recoveryStableReference','retrySameCommand']){
    for(const locale of canonical)assert.ok(PLAY_BOOKING_DESK[locale][key]?.trim(),`missing ${locale}.${key}`);
  }
  assert.match(PLAY_BOOKING_DESK.en.operationPending,/Do not submit another command/i);
  assert.match(PLAY_BOOKING_DESK.en.operationAmbiguous,/Do not claim success/i);
  assert.match(PLAY_BOOKING_DESK.en.retrySameCommand,/same verified command reference/i);
});

test('draft communication labels cover exact types privacy and transmitter boundary',()=>{
  for(const key of ['draftRequestReceived','draftInformationNeeded','draftAlternativeProposed','draftConfirmed','draftDeclined','draftCancellationReceived','draftCancellationAccepted','draftCancellationDeclined','draftManualSupportRequired','messageDraftOnly','messagePrivacyBoundary','messageAwaitingTransmitter']){
    for(const locale of canonical)assert.ok(PLAY_BOOKING_DESK[locale][key]?.trim(),`missing ${locale}.${key}`);
  }
  assert.match(PLAY_BOOKING_DESK.en.messageDraftOnly,/Nothing has been sent/i);
  assert.match(PLAY_BOOKING_DESK.en.messagePrivacyBoundary,/minimum booking details/i);
  assert.match(PLAY_BOOKING_DESK.en.messageAwaitingTransmitter,/approved transmitter/i);
  for(const locale of canonical)assert.doesNotMatch(Object.values(PLAY_BOOKING_DESK[locale]).join(' '),/(?:message was sent|successfully delivered|delivery confirmed|payment complete|invoice issued)/iu);
});
