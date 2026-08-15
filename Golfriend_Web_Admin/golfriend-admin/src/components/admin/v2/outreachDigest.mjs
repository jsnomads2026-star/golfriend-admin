// Canonical SHA-256 content digest for outreach approvals — pure, synchronous, no dependency.
//
// This replaces a 128-bit FNV-1a-lite integrity check. FNV is not collision-resistant against a
// chosen-content attacker, and an approval digest is exactly the thing an attacker would want to
// collide: find a second draft with the same digest and an existing approval covers it.
//
// SHA-256 is implemented here rather than via `crypto.subtle` because that API is async, and the
// digest is computed inside synchronous domain functions (build, revalidate, send-eligibility).
// An async digest would force every one of those to become async, which is a far larger and
// riskier change than a well-tested 60-line hash. It is verified against the NIST vectors.
//
// CANONICALIZATION IS LENGTH-PREFIXED, not delimiter-joined. A delimiter scheme is ambiguous:
// two different field sets can serialize to the same string when a value contains the delimiter.
// Length prefixes make the encoding injective, so distinct inputs cannot share a digest by
// construction rather than by hoping values never contain the separator.

const K=new Uint32Array([
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);

const rotr=(x,n)=>(x>>>n)|(x<<(32-n));

/** SHA-256 over bytes, returning lower-case hex. */
export function sha256Bytes(bytes){
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const bitLength=bytes.length*8;
  const padded=new Uint8Array(((bytes.length+9+63)>>6)<<6);
  padded.set(bytes);
  padded[bytes.length]=0x80;
  const view=new DataView(padded.buffer);
  // 64-bit length, high word first. Lengths beyond 2^32 bits are not reachable here.
  view.setUint32(padded.length-8,Math.floor(bitLength/0x100000000));
  view.setUint32(padded.length-4,bitLength>>>0);
  const w=new Uint32Array(64);
  for(let offset=0;offset<padded.length;offset+=64){
    for(let i=0;i<16;i+=1)w[i]=view.getUint32(offset+i*4);
    for(let i=16;i<64;i+=1){
      const s0=rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3);
      const s1=rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i+=1){
      const S1=rotr(e,6)^rotr(e,11)^rotr(e,25);
      const ch=(e&f)^(~e&g);
      const t1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=rotr(a,2)^rotr(a,13)^rotr(a,22);
      const maj=(a&b)^(a&c)^(b&c);
      const t2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  let hex='';
  for(let i=0;i<8;i+=1)hex+=H[i].toString(16).padStart(8,'0');
  return hex;
}

const encoder=new TextEncoder();
export function sha256Hex(text){return sha256Bytes(encoder.encode(text));}

export const DIGEST_ALGORITHM='sha-256';
export const CANONICAL_FORM='golfriend.outreach.canonical.v1';

/**
 * The EXACT field order of the canonical form. Order is explicit and declared, not derived by
 * sorting: a sort order can change with the locale of the runtime, and a field added in the
 * middle would silently re-order every historic digest.
 */
export const CANONICAL_FIELDS=Object.freeze([
  'draftType','locale','templateVersion','jurisdiction','jurisdictionApprovalVersion',
  'prospectRef','contactRef','recipientRole','recipientRef','contactPreferenceVersion',
  'consentVersion','doNotContactVersion','purpose','evidenceVersion',
  'subject','body',
]);
/** Fields whose value must be a string. Everything in the canonical form is a string or null. */
const NULLABLE_FIELDS=Object.freeze(['recipientRole','recipientRef','evidenceVersion','jurisdictionApprovalVersion']);

export const CANONICALIZATION_ERRORS=Object.freeze(['unknown_field','missing_field','duplicate_key','unsupported_value','non_normalized_text','control_character','value_too_long']);
const MAX_FIELD_LENGTH=8192;
/** C0/C1 controls (newline and tab permitted in a body), zero-width marks and bidi controls. */
const CONTROL_AND_INVISIBLE=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;

/**
 * Validate and canonicalize. Returns either a refusal naming the exact problem, or the canonical
 * string. Non-NFC text is REJECTED rather than silently normalized: silently normalizing means
 * two visually identical drafts can be approved under one digest and stored under another.
 */
export function canonicalizeOutreachContent(input){
  if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,error:'unsupported_value',field:null};
  // Own enumerable keys only, so an inherited property cannot smuggle a field in or out.
  const keys=Object.keys(input);
  const seen=new Set();
  for(const key of keys){
    if(seen.has(key))return{ok:false,error:'duplicate_key',field:key};
    seen.add(key);
    if(!CANONICAL_FIELDS.includes(key))return{ok:false,error:'unknown_field',field:key};
  }
  const segments=[];
  for(const field of CANONICAL_FIELDS){
    if(!Object.hasOwn(input,field))return{ok:false,error:'missing_field',field};
    const raw=input[field];
    if(raw===null){
      if(!NULLABLE_FIELDS.includes(field))return{ok:false,error:'unsupported_value',field};
      segments.push(`${field}:null:`);
      continue;
    }
    if(typeof raw!=='string')return{ok:false,error:'unsupported_value',field};
    if(raw.length>MAX_FIELD_LENGTH)return{ok:false,error:'value_too_long',field};
    // Control characters other than newline and tab make a rendered body ambiguous and are a
    // classic way to hide content from a reviewer while changing what is delivered.
    if(CONTROL_AND_INVISIBLE.test(raw))return{ok:false,error:'control_character',field};
    if(raw.normalize('NFC')!==raw)return{ok:false,error:'non_normalized_text',field};
    // Length-prefixed: `field:byteLength:value`. Injective regardless of value content.
    segments.push(`${field}:${encoder.encode(raw).length}:${raw}`);
  }
  return{ok:true,canonical:`${CANONICAL_FORM}\n${segments.join('\n')}`};
}

/** Canonicalize then hash. A refusal never yields a digest. */
export function outreachContentDigest(input){
  const canonical=canonicalizeOutreachContent(input);
  if(!canonical.ok)return{ok:false,error:canonical.error,field:canonical.field,digest:null};
  return{ok:true,error:null,field:null,digest:`${DIGEST_ALGORITHM}:${sha256Hex(canonical.canonical)}`,canonicalLength:canonical.canonical.length};
}

/** Constant-time-ish comparison so a digest check does not leak position by timing. */
export function digestsEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;
  for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
