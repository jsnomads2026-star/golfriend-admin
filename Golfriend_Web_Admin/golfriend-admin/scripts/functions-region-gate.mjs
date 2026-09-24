import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/firebaseConfig.ts', import.meta.url), 'utf8');
if (!source.includes("getFunctions(app, 'asia-southeast1')")) {
  throw new Error('V2 Functions client must explicitly target asia-southeast1.');
}

console.log('Functions region gate passed: asia-southeast1 is pinned.');
