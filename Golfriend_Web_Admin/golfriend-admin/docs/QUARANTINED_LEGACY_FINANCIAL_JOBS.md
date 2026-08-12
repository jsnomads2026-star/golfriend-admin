# Quarantined Legacy Financial Cloud Jobs (reference only — NOT active V2)

**Directive:** issue #19 — quarantine `hourlyTreasurySweep` and `stripeB2BWebhook` from the Lane C clean-V2 Function export/deployment surface.

**Status:** REMOVED from `functions/src/index.ts` (the deploy entry `main: lib/index.js`), so they **cannot enter the clean-V2 Function bundle**. They are preserved here and in git history as historical reference. They are **not** active V2 and must **not** be re-added to `index.ts`. V2 economy/payment authority belongs to the canonical backend and requires separate commissioning — do **not** replace these with invented V2 payment logic.

- `hourlyTreasurySweep` — reads legacy `transactions` and writes legacy `platform/treasury` authority not owned by the approved clean-V2 backend (prohibited-financial reconciliation).
- `stripeB2BWebhook` — performs fiat payment processing (Stripe) plus legacy 10k Chip minting (prohibited-financial).

Enforcement that they stay out of the bundle: `scripts/functions-export-gate.mjs` (`npm run gate:fnexport`).

---

## hourlyTreasurySweep (removed)

```ts
// ==========================================
// 🏦 CENTRAL BANK: Hourly Treasury Reconciliation Sweep
// ==========================================
export const hourlyTreasurySweep = onSchedule({
  schedule: "0 * * * *", // Runs at minute 0 of every hour
  timeZone: "Asia/Bangkok",
  memory: "512MiB"
}, async (event) => {
  logger.info("🏦 CENTRAL BANK: Starting hourly reconciliation sweep...");

  try {
    // 1. Sweep the entire transaction vault
    const snap = await db.collection('transactions').get();

    let totalFiat = 0;
    let totalEscrow = 0;
    let totalVelocity = 0;

    // 2. Mathematically rebuild the global economy from scratch
    snap.docs.forEach(doc => {
      const data = doc.data();

      if (data.type === 'PHYSICAL_GOODS_PURCHASE' && data.product?.fiatPriceUsd) {
        totalFiat += data.product.fiatPriceUsd;
      }
      if (data.status === 'escrow_locked' && data.amount) {
        totalEscrow += Math.abs(data.amount);
      }
      if (data.status === 'completed' && data.amount) {
        totalVelocity += data.amount;
      }
    });

    // 3. Lock the audited numbers into the Master Treasury HUD
    await db.collection('platform').doc('treasury').set({
      totalFiatVolumeUsd: totalFiat,
      totalEscrowLocked: totalEscrow,
      netChipVelocity: totalVelocity,
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      reconciliationCount: snap.size
    }, { merge: true });

    logger.info(`✅ TREASURY RECONCILED: Fiat($${totalFiat}) Escrow(${totalEscrow}) Velocity(${totalVelocity}) from ${snap.size} records.`);
  } catch (error) {
    logger.error("❌ TREASURY SWEEP FAILED:", error);
  }
});
```

## stripeB2BWebhook (removed)

```ts
// ==========================================
// 💳 STRIPE B2B PAYMENT WEBHOOK
// ==========================================

export const stripeB2BWebhook = onRequest({
  cors: true,
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
}, async (req, res) => {
  const stripe = new Stripe(STRIPE_SECRET_KEY.value(), {
    apiVersion: "2026-06-24.dahlia" as any,
  });
  const endpointSecret = STRIPE_WEBHOOK_SECRET.value();

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig as string, endpointSecret);
  } catch (err: any) {
    logger.error("🚨 Webhook signature verification failed.", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // 🔥 1. Pull the EXACT partner ID we injected into the frontend URL (Fallback to email just in case)
    const partnerId = session.client_reference_id || session.customer_details?.email;
    
    // 🔥 2. Extract Metadata from the Payment Link
    const metadata = session.metadata || {};
    const tier = metadata.tier || "small_business";
    const duration = metadata.duration || "monthly";

    if (partnerId) {
      try {
        const now = new Date();
        const contractStartDate = now.toISOString();
        
        // 🔥 3. DATE ENGINE: Mathematically calculating the exact expiration
        const expDate = new Date(now);
        if (duration === "6_months") expDate.setMonth(expDate.getMonth() + 6);
        else if (duration === "1_year") expDate.setFullYear(expDate.getFullYear() + 1);
        else expDate.setMonth(expDate.getMonth() + 1); // Default to Monthly
        
        const contractEndDate = expDate.toISOString();

        // 🔥 4. BADGE ENGINE
        const badge = tier === "enterprise" ? "verified_enterprise" : null;

        // 🔥 5. Execute the Multi-Schema Auto-Onboarding via Batch Write
        const batch = db.batch();

        // A. Create/Update the Corporate Contract in b2b_partners
        const partnerRef = db.collection("b2b_partners").doc(partnerId);
        batch.set(partnerRef, {
          tier: tier,
          status: "active_partner",
          partnerBadge: badge,
          contractDuration: duration,
          contractStartDate: contractStartDate,
          contractEndDate: contractEndDate,
          payment_date: admin.firestore.FieldValue.serverTimestamp(),
          stripe_session_id: session.id,
        }, { merge: true });

        // B. Upgrade the Player Profile & Mint 10k Initial Chips in users
        const userRef = db.collection("users").doc(partnerId);
        batch.set(userRef, {
          tier: "commercial",
          chips: admin.firestore.FieldValue.increment(10000)
        }, { merge: true });

        // C. Stamp the Immutable Ledger in transactions
        const txRef = db.collection("transactions").doc();
        batch.set(txRef, {
          userId: partnerId,
          title: `Stripe Auto-Onboarding: ${tier.toUpperCase()} Tier + 10k Chips`,
          amount: 10000,
          type: "STRIPE_AUTO_ONBOARD",
          status: "completed",
          enforcedBy: "SYSTEM",
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        await batch.commit();

        logger.info(`✅ Successfully auto-onboarded B2B contract & minted chips for ${partnerId}`);
      } catch (error) {
        logger.error("🚨 Error saving partner to Firestore", error);
      }
    }
  }

  res.status(200).send({ received: true });
});
```

---

## Lane B reconciliation (read-only — no Lane B files edited)

Reconciled Lane C's clean-V2 admin Function bundle (`golfriend-admin/functions/src/index.ts`, 25 exports) against Lane B's checkout. Lane B's **own** mobile backend (`golfriend-app/backend/index.js` at pinned `db478ba`) still contains `hourlyTreasurySweep` / `stripeB2BWebhook` names — that is a **Lane B-owned** inventory in a separate repo and is **not** edited here. Flag for Lane B: the same two legacy financial jobs should be reconciled out of the clean-V2 backend on their side. The Lane C↔Lane B **Firestore rules contract** is unaffected (these jobs write `transactions`/`platform`/`users` via Admin SDK, not the booking collections governed by `docs/LANEB_RULES_HANDOFF.md`); `npm run check:laneb` remains 13/13.
