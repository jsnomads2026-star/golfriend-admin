'use strict';
const fs=require('node:fs'),source=fs.readFileSync(require.resolve('./index'),'utf8');
const expected=['getGolfApiCatalogueStatus','reconcileGolfApiPendingSettlements','scheduledGolfApiCatalogueCanary','scheduledGolfApiCatalogueCountReceipt','scheduledGolfApiCatalogueIncremental','scheduledGolfApiCatalogueRetries','searchGolfApiCatalogue'];
const found=[...source.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)].map(match=>match[1]).sort();
if(JSON.stringify(found)!==JSON.stringify([...expected].sort()))throw Error(`EXPORT_SELECTION_INVALID:${found.join(',')}`);
for(const required of ['enforceAppCheck:true','REFRESH_SLO','verifyActivation','golf_api_quota_reservations','pageCacheId','clubOffset','courseOffset','withPageSize','cleanupExpiredPageCaches','DETAIL_BUDGET_DEFERRED','verifyCanaryActivation','golf_api_canary_receipts','golf_api_pending_settlements','reconcileGolfApiPendingSettlements'])if(!source.includes(required))throw Error(`CONTROL_MISSING:${required}`);
for(const forbidden of [/versions\/[^'"`]+:access/,/console\.log\([^)]*GOLF_API_KEY/,/EXPO_PUBLIC_GOLF_API/])if(forbidden.test(source))throw Error(`FORBIDDEN_PATTERN:${forbidden}`);
console.log('course catalogue exact-export and authority boundary verified');
