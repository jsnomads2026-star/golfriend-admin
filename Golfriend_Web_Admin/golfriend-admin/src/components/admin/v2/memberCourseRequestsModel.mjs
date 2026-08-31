const text=value=>typeof value==='string'?value.trim():'';
const when=value=>{
  if(typeof value==='number'&&Number.isFinite(value))return Math.abs(value)<100000000000?value*1000:value;
  if(value&&typeof value.toMillis==='function')return value.toMillis();
  if(value&&typeof value==='object'&&Number.isFinite(Number(value.seconds??value._seconds))){const seconds=Number(value.seconds??value._seconds),nanos=Number(value.nanoseconds??value._nanoseconds??0);return seconds*1000+Math.floor(nanos/1000000);}
  if(typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value)))return when(Number(value));
  const parsed=Date.parse(String(value||''));return Number.isFinite(parsed)?parsed:null;
};
const identity=row=>{const club=text(row.providerClubId),course=text(row.providerCourseId);return club&&course?`${club}:${course}`:'';};

export function requestStatus(row){
  if(row?.alreadyInFirebase===true||row?.state==='cached')return 'Already in Firebase';
  if(row?.state==='completed'||row?.state==='imported')return 'Imported';
  if(row?.state==='running'||row?.state==='importing')return 'Importing';
  if(row?.state==='failed')return 'Failed';
  if(row?.needsReview===true||row?.state==='needs_review')return 'Needs review';
  return text(row?.providerClubId)&&text(row?.providerCourseId)?'Ready to import':'Needs provider match';
}

export function projectMemberCourseRequests(rows=[]){
  const grouped=new Map();
  for(const source of rows){
    const row=source&&typeof source==='object'?source:{};
    const key=identity(row)||`unmatched:${text(row.requestName).toLocaleLowerCase()}:${text(row.location).toLocaleLowerCase()}:${text(row.country).toLocaleLowerCase()}`;
    const prior=grouped.get(key);
    const current={...row,requestCount:Number(row.requestCount||1),requestedAtMs:when(row.requestedAtMs??row.requestedAt??row.createdAt)};
    if(!prior){grouped.set(key,current);continue;}
    const newest=(current.requestedAtMs||0)>=(prior.requestedAtMs||0)?current:prior;
    grouped.set(key,{...newest,requestCount:Number(prior.requestCount||1)+Number(current.requestCount||1)});
  }
  return [...grouped.values()].map(row=>({
    id:text(row.id)||identity(row)||`${text(row.requestName)}:${text(row.location)}`,
    name:text(row.requestName)||text(row.clubhouseName)||text(row.displayName)||`Provider course ${text(row.providerCourseId)||'unmatched'}`,
    location:[text(row.location)||text(row.city),text(row.country)].filter(Boolean).join(', ')||'Location not supplied',
    requestCount:Number(row.requestCount||1), requestedAtMs:row.requestedAtMs??null,
    status:requestStatus(row), providerClubId:text(row.providerClubId)||null, providerCourseId:text(row.providerCourseId)||null,
    receiptId:text(row.receiptId)||null, error:text(row.reason)||text(row.lastError)||null,
  })).sort((a,b)=>(b.requestedAtMs||0)-(a.requestedAtMs||0));
}

export function sortMemberCourseRequests(rows, sort='most_requested'){
  const attention=value=>['Failed','Needs review','Needs provider match'].includes(value.status)?1:0;
  return [...rows].sort((left,right)=>sort==='newest'?(right.requestedAtMs||0)-(left.requestedAtMs||0):sort==='needs_attention'?attention(right)-attention(left)||(right.requestedAtMs||0)-(left.requestedAtMs||0):(right.requestCount-left.requestCount)||(right.requestedAtMs||0)-(left.requestedAtMs||0));
}
