export const PREVIEW_SCENARIOS:readonly string[];
export const STALE_AUTHORIZATION:{approved:true;contractRef:string;effectiveFrom:string;effectiveUntil:string;scope:string};
export const PRODUCTION_ACQUISITION_ADAPTERS:Readonly<Record<string,null>>;
export function createPreviewAdapters(scenario?:string):Readonly<Record<string,unknown>>;
