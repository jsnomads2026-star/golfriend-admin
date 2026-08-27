'use strict';

const DEFAULT_BATCH_SIZE=3;

function begin({uid,requestId,marketWeights={},now=Date.now(),enrollmentId}){
  return Object.freeze({
    enabled:false,
    enrollmentComplete:false,
    enrollmentState:'pending',
    enrollmentId,
    enrollmentCursor:null,
    enrollmentRequestedAtMs:now,
    enrollmentRequestedBy:uid,
    enrollmentRequestId:requestId,
    enrollmentAction:'ENABLE_AUTOMATIC_REFRESH',
    marketWeights,
  });
}

function batch(countries,cursor,size=DEFAULT_BATCH_SIZE){
  const ordered=[...new Set(countries)].filter(country=>country!=='UNKNOWN').sort();
  const start=cursor===null||cursor===undefined?0:ordered.findIndex(country=>country===cursor)+1;
  const items=ordered.slice(Math.max(0,start),Math.max(0,start)+Math.max(1,size));
  return Object.freeze({items,nextCursor:items.length?items[items.length-1]:cursor??null,complete:start>=ordered.length||start+items.length>=ordered.length});
}

function complete(enrollmentId,now=Date.now()){
  return Object.freeze({enabled:true,enrollmentComplete:true,enrollmentState:'complete',enrollmentId,enrollmentCompletedAtMs:now});
}

module.exports=Object.freeze({DEFAULT_BATCH_SIZE,begin,batch,complete});
