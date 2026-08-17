import{httpsCallable}from'firebase/functions';import{functions}from'../../../firebaseConfig';
const call=async<T>(name:string,data:unknown={})=>(await httpsCallable(functions,name)(data)).data as T;
export const adminControlProvider={load:()=>call<any>('getAdminControlProjectionV1'),trial:(data:any)=>call<any>('decidePartnerTrialAdminV1',data),preview:(values:any)=>call<any>('previewEconomyConfigAdminV1',{values}),activate:(data:any)=>call<any>('activateEconomyConfigAdminV1',data),rollback:(data:any)=>call<any>('rollbackEconomyConfigAdminV1',data)};
export const adminCommandId=(kind:string)=>`${kind}_${crypto.randomUUID().replaceAll('-','')}`;
