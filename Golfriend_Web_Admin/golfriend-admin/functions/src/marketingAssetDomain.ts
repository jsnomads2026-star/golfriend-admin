import{createHash}from"node:crypto";
export const MARKETING_ASSET_SCHEMA="golfriend.admin.marketing-asset.v1",MARKETING_VERSION_SCHEMA="golfriend.admin.marketing-asset-version.v1",MARKETING_RECEIPT_SCHEMA="golfriend.admin.marketing-asset-receipt.v1";
export const MARKETING_LOCALES=["en","th","ko","ja","zh","es","fr","de"]as const;
export const MARKETING_STATES=["draft","review","approved","archived"]as const;
export const MARKETING_CATEGORIES=["app_screenshot","app_store_asset","course_letter","partner_letter","website_image","website_copy","just_golfriend_campaign","logo","advertising","oem_asset"]as const;
export const MARKETING_MAX_BYTES=8*1024*1024;
const MIME=new Set(["image/png","image/jpeg","image/webp","image/svg+xml","application/pdf","text/plain","text/markdown","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
const clean=(value:unknown,max=120)=>String(value||"").trim().slice(0,max);
export function validateCommandId(value:unknown){const id=clean(value,80);if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id))throw new Error("COMMAND_ID_INVALID");return id;}
export function validateAssetId(value:unknown){const id=clean(value,40);if(!/^mkt_[a-f0-9]{24}$/.test(id))throw new Error("ASSET_ID_INVALID");return id;}
export function validateAssetInput(input:any){const title=clean(input?.title),category=clean(input?.category),page=clean(input?.page||"general"),locales=Array.isArray(input?.locales)?[...new Set(input.locales.map((x:unknown)=>clean(x,2)))]:[];if(!title||!MARKETING_CATEGORIES.includes(category as any)||!locales.length||locales.some(locale=>!MARKETING_LOCALES.includes(locale as any)))throw new Error("ASSET_INPUT_INVALID");return{title,category,page,locales:locales.sort(),campaign:category==="just_golfriend_campaign"?"Just Golfriend it, my friend":null};}
export function validateFileInput(input:any){const name=clean(input?.fileName,180),mime=clean(input?.mimeType,100),size=Number(input?.sizeBytes),checksum=clean(input?.sha256,64).toLowerCase();if(!name||!MIME.has(mime)||!Number.isInteger(size)||size<1||size>MARKETING_MAX_BYTES||!/^[a-f0-9]{64}$/.test(checksum))throw new Error("FILE_INVALID");return{fileName:name,mimeType:mime,sizeBytes:size,sha256:checksum};}
export function assetIdFor(input:any){const value=validateAssetInput(input);return`mkt_${hash(JSON.stringify(value)).slice(0,24)}`;}
export function versionIdFor(assetId:string,file:any){const value=validateFileInput(file);return`ver_${hash(`${assetId}|${value.sha256}|${value.sizeBytes}|${value.mimeType}`).slice(0,24)}`;}
export function storagePathFor(assetId:string,versionId:string,fileName:string){const safe=fileName.replace(/[^a-zA-Z0-9._-]/g,"_").replace(/^\.+/,"_");return`admin-marketing-assets/${assetId}/${versionId}/${safe}`;}
export function canTransition(from:string,to:string,role:string){if(!MARKETING_STATES.includes(to as any)||from===to)return false;if(to==="archived")return role==="Director";if(from==="draft"&&to==="review")return true;if(from==="review"&&to==="draft")return true;if(from==="review"&&to==="approved")return role==="Director"||role==="Manager";if(from==="approved"&&to==="review")return role==="Director";return false;}
export function buildReceipt(kind:string,assetId:string,versionId:string|null,commandId:string,at:number){return{schema:MARKETING_RECEIPT_SCHEMA,id:`mkt_receipt_${hash(`${kind}|${assetId}|${versionId||""}|${commandId}`).slice(0,32)}`,kind,assetId,versionId,commandId,at};}
export interface MarketingStorageAdapter{configured:boolean;put(path:string,bytes:Buffer,metadata:{contentType:string;sha256:string}):Promise<void>;download(path:string):Promise<string>}
export function unconfiguredMarketingStorage():MarketingStorageAdapter{return{configured:false,async put(){throw new Error("PROVIDER_UNCONFIGURED")},async download(){throw new Error("PROVIDER_UNCONFIGURED")}};}
