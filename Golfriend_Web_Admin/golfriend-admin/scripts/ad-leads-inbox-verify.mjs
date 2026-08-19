import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ui = read('../src/components/B2B/AdLeadsInbox.tsx');

let checks = 0;
const check = (name, cb) => {
  cb();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
};

check('no forbidden placeholder sender image/avatars in rendered payload URLs', () =>
  assert.doesNotMatch(ui, /src=\{[^}]*via\.placeholder\.com|photo_url:\s*['"`]https:\/\/via\.placeholder\.com|https?:\/\/via\.placeholder\.com/),
);
check('lead rows are keyboard accessible', () => {
  assert.match(ui, /role=\"button\"/);
  assert.match(ui, /tabIndex=\{0\}/);
  assert.match(ui, /onKeyDown=\{\(event\)=>|onKeyDown=\{\(event\)/);
});
check('attach action has semantic accessible label', () =>
  assert.match(ui, /Attach file to message/),
);
check('send action has accessible label', () =>
  assert.match(ui, /Send message to/),
);
check('icon-only action uses focus-visible styling', () =>
  assert.match(ui, /adleads-action-btn:focus-visible/),
);
check('row focus-visible style exists', () =>
  assert.match(ui, /adleads-row:focus-visible/),
);
check('local fallback avatar renderer remains explicit and non-external', () =>
  assert.match(ui, /renderAvatar\(|deterministicAvatarColor|sanitizeAvatar/),
);

console.log(`AdLeadsInbox accessibility/placeholder verifier: ${checks} checks passed.`);
