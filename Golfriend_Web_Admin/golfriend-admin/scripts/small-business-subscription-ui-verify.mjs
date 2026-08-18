import assert from'node:assert/strict';import{readFileSync}from'node:fs';
const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8'),component=read('src/components/smallBusiness/SmallBusinessSubscription.tsx'),provider=read('src/components/smallBusiness/smallBusinessProvider.ts'),storefront=read('src/components/public/B2BStorefront.tsx'),wallet=read('src/components/B2B/WalletSettings.tsx'),runtime=read('functions/src/smallBusinessSubscriptionRuntime.ts');
for(const state of['trial_active','checkout_pending','paid','payment_failed','cancelled','provider_unavailable'])assert.match(component,new RegExp(state));
for(const locale of['en','th','ko','ja','zh','es','fr','de'])assert.match(component,new RegExp(`\\b${locale}:\\{`));
assert.match(provider,/createSmallBusinessSubscriptionCheckoutV1/);assert.match(provider,/getSmallBusinessSubscriptionStateV1/);assert.match(runtime,/enforceAppCheck:true/);assert.match(runtime,/amountMinor.*currency.*price.*priceId.*tier.*entitlement.*paymentStatus.*organizationId/);
for(const source of[component,provider,storefront,wallet])assert.doesNotMatch(source,/buy\.stripe\.com\/test|sk_(?:live|test)_|whsec_/);
assert.doesNotMatch(component,/\$29|2900/);console.log('small-business subscription UI verification passed');
