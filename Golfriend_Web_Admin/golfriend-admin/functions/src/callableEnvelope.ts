export function assertExactCallableEnvelope(value:unknown,required:readonly string[],optional:readonly string[]=[]):void{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("ENVELOPE_INVALID");
  const keys=Object.keys(value as Record<string,unknown>),allowed=new Set([...required,...optional]);
  if(required.some(key=>!Object.prototype.hasOwnProperty.call(value,key))||keys.some(key=>!allowed.has(key)))throw new Error("ENVELOPE_INVALID");
}
