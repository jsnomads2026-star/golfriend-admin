'use strict';
const LAUNCH_MARKETS=Object.freeze(['THAILAND','KOREA','JAPAN','SINGAPORE','MALAYSIA']);
const disabledLaunchJobs=Object.freeze(LAUNCH_MARKETS.map(country=>Object.freeze({country,state:'disabled',providerCalls:0,courseWrites:0,requiresImmutableActivationReceipt:true})));
module.exports=Object.freeze({LAUNCH_MARKETS,disabledLaunchJobs});
