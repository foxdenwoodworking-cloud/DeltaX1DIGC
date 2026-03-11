"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const stripe_1 = __importDefault(require("stripe"));
const config_1 = require("../config");
await axios_1.default.post(config_1.config.orchestrator.webhookUrl, body, {
    headers: { "X-Internal-Secret": config_1.config.internal.secret }
});
const router = (0, express_1.Router)();
// --- In-memory idempotency cache (replay protection) ---
const processedEvents = new Set();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastCleanup = Date.now();
function markProcessed(id) {
    if (!id)
        return;
    processedEvents.add(id);
    const now = Date.now();
    if (now - lastCleanup > CACHE_TTL_MS) {
        processedEvents.clear();
        lastCleanup = now;
    }
}
function isProcessed(id) {
    if (!id)
        return false;
    return processedEvents.has(id);
}
// --- Orchestrator helpers ---
async function forwardToOrchestrator(body) {
    await axios_1.default.post(config_1.config.orchestrator.webhookUrl, body);
}
async function sendToLedger(event) {
    try {
        await axios_1.default.post(config_1.config.orchestrator.ledgerUrl, event);
    }
    catch (err) {
        console.error("Ledger forwarding failed:", err.message);
    }
}
async function sendLoreEvent(event) {
    try {
        await axios_1.default.post(config_1.config.orchestrator.loreUrl, event);
    }
    catch (err) {
        console.error("Lore forwarding failed:", err.message);
    }
}
async function enqueueJob(job) {
    try {
        await axios_1.default.post(config_1.config.orchestrator.jobRegistryUrl, job);
    }
    catch (err) {
        console.error("Job enqueue failed:", err.message);
    }
}
// --- Stripe crown ---
const stripe = new stripe_1.default(config_1.config.stripe.secret || "", {
    apiVersion: "2023-10-16"
});
// -----------------------------
// STRIPE WEBHOOK
// -----------------------------
router.post("/stripe", async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const rawBody = req.body;
    if (!sig) {
        return res.status(400).send("Missing Stripe signature header");
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, config_1.config.stripe.webhookSecret);
    }
    catch (err) {
        console.error("Stripe signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    const eventId = event.id;
    if (isProcessed(eventId)) {
        return res.status(200).json({ received: true, replay: true });
    }
    markProcessed(eventId);
    const object = event.data.object;
    const amount = object.amount_received || object.amount || undefined;
    const currency = object.currency || undefined;
    // Forward to orchestrator worker webhook
    await forwardToOrchestrator({
        provider: "stripe",
        eventType: event.type,
        eventId,
        payload: object
    });
    // Send to ledger
    await sendToLedger({
        provider: "stripe",
        eventType: event.type,
        amount,
        currency,
        raw: object
    });
    // Lore event
    await sendLoreEvent({
        provider: "stripe",
        eventType: event.type,
        narrative: `Stripe event ${event.type} received for customer ${object.customer || "unknown"}`,
        raw: object
    });
    // Job registry (e.g. post-payment processing)
    await enqueueJob({
        queue: "payments",
        type: "stripe_event",
        payload: {
            eventType: event.type,
            eventId,
            object
        }
    });
    return res.json({ received: true });
});
// -----------------------------
// PAYPAL WEBHOOK
// -----------------------------
router.post("/paypal", async (req, res) => {
    const event = req.body;
    if (!event || !event.id || !event.event_type) {
        return res.status(400).json({ error: "Invalid PayPal webhook payload" });
    }
    if (isProcessed(event.id)) {
        return res.status(200).json({ received: true, replay: true });
    }
    markProcessed(event.id);
    const resource = event.resource || {};
    const amount = resource.amount?.value ||
        resource.amount_total ||
        undefined;
    const currency = resource.amount?.currency_code ||
        resource.currency ||
        undefined;
    // Forward to orchestrator worker webhook
    await forwardToOrchestrator({
        provider: "paypal",
        eventType: event.event_type,
        eventId: event.id,
        payload: resource
    });
    // Send to ledger
    await sendToLedger({
        provider: "paypal",
        eventType: event.event_type,
        amount,
        currency,
        raw: resource
    });
    // Lore event
    await sendLoreEvent({
        provider: "paypal",
        eventType: event.event_type,
        narrative: `PayPal event ${event.event_type} received for payer ${resource.payer?.email_address || "unknown"}`,
        raw: resource
    });
    // Job registry (e.g. fulfillment)
    await enqueueJob({
        queue: "payments",
        type: "paypal_event",
        payload: {
            eventType: event.event_type,
            eventId: event.id,
            resource
        }
    });
    return res.json({ received: true });
});
exports.default = router;
