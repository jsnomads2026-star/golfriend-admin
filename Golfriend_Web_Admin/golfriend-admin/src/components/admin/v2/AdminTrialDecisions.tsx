import {useEffect,useState} from 'react';
import {useAdminLocale} from './AdminLocaleContext';
import {adminCommandId,adminControlProvider} from './adminControlProvider';
import './AdminControlSurface.css';
const title={en:'Partner trial decisions',th:'การตัดสินใจช่วงทดลองของพาร์ตเนอร์',ko:'파트너 체험 결정',ja:'パートナートライアル決定',zh:'合作伙伴试用决策',es:'Decisiones de prueba de socios',fr:'Décisions d’essai partenaire',de:'Partner-Testentscheidungen'} as const;
export default function AdminTrialDecisions(){
 const locale=useAdminLocale(),[state,setState]=useState<any>(null),[approval,setApproval]=useState(''),[notice,setNotice]=useState('');
 const load=()=>{void adminControlProvider.load().then(setState).catch(()=>setState(false))};useEffect(load,[]);
 const run=async(x:any,action:string,durationDays?:30|90)=>{setNotice('');try{const r=await adminControlProvider.trial({action,durationDays,applicationId:x.applicationId,organizationId:x.organizationId,expectedApplicationVersion:x.applicationVersion,expectedOrganizationVersion:x.organizationVersion,writtenApprovalRef:action==='approve'?approval:undefined,commandId:adminCommandId(`trial_${action}`)});setNotice(`${r.status} · ${r.receiptId}`);load()}catch{setNotice('Trial command denied, stale or unavailable.')}};
 if(state===null)return <p role="status">Loading trial authority…</p>;if(state===false)return <p role="alert">Trial authority unavailable.</p>;
 return <section className="admin-control" aria-labelledby="trial-control-title"><h2 id="trial-control-title">{title[locale]}</h2><p>Server-authorized · version checked · explicit start · immutable receipt</p><label>Written/Admin approval reference<input value={approval} onChange={e=>setApproval(e.target.value)}/></label>{!state.trials.length?<p>No reviewable applications.</p>:state.trials.map((x:any)=><article key={x.applicationId}><strong>{x.applicationId}</strong><span>{x.organizationId} · v{x.applicationVersion} · {x.trial?.state||x.status}</span><div><button disabled={!approval} onClick={()=>run(x,'approve',30)}>Approve 30 days</button><button disabled={!approval} onClick={()=>run(x,'approve',90)}>Approve 90 days</button><button onClick={()=>run(x,'start')}>Start approved trial</button><button onClick={()=>run(x,'revoke')}>Revoke trial</button></div></article>)}{notice&&<p role="status" aria-live="polite">{notice}</p>}</section>
}
