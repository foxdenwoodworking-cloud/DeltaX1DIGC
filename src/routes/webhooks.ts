import { Router, Request, Response } from "express";
import axios from "axios";
import Stripe from "stripe";
import { config } from "../config";

const router = Router();

// --- In-memory idempotency cache (replay protection) ---
const processedEvents = new Set<string>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let lastCleanup = Date.now();

function markProcessed(id: string | undefined) {
  if (!id) return;
  processedEvents.add(id);
  const now = Date.now();
  if (now - lastCleanup > CACHE_TTL_MS) {
    processedEvents.clear();
    lastCleanup = now;
  }
}

function isProcessed(id: string | undefined): boolean {
  if (!id) return false;
  return processedEvents.has(id);
}

// --- Orchestrator helpers ---
async function forwardToOrchestrator(body: any) {
  await axios.post(config.orchestrator.webhookUrl, body);
}

async function sendToLedger(event: {
  provider: string;
  eventType: string;
  amount?: number;
  currency?: string;
  raw: any;
}) {
  try {
    await axios.post(config.orchestrator.ledgerUrl, event);
  } catch (err) {
    console.error("Ledger forwarding failed:", (err as any).message);
  }
}

async function sendLoreEvent(event: {
  provider: string;
  eventType: string;
  narrative: string;
  raw: any;
}) {
  try {
    await axios.post(config.orchestrator.loreUrl, event);
  } catch (err) {
    console.error("Lore forwarding failed:", (err as any).message);
  }
}

async function enqueueJob(job: {
  queue: string;
  type: string;
  payload: any;
}) {
  try {
    await axios.post(config.orchestrator.jobRegistryUrl, job);
  } catch (err) {
    console.error("Job enqueue failed:", (err as any).message);
  }
}

// --- Stripe crown ---
const stripe = new Stripe(config.stripe.secret || "", {
});

// -----------------------------
// STRIPE WEBHOOK
// -----------------------------
router.post("/stripe", async (req: Request, res: Response) => {
  const sig = req.headers["stripe-signature"];
  const rawBody = req.body as Buffer;

  if (!sig) {
    return res.status(400).send("Missing Stripe signature header");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig as string,
      config.stripe.webhookSecret as string
    );
  } catch (err: any) {
    console.error("Stripe signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const eventId = event.id;

  if (isProcessed(eventId)) {
    return res.status(200).json({ received: true, replay: true });
  }

  markProcessed(eventId);

  const object: any = event.data.object;
  const amount = object.amount_received || object.amount || undefined;
  const currency = object.currency || undefined;

  // Forward to orchestrator worker webhook
  await forwardToOrchestrator({
    provider: "stripe",
    eventType: event.type,
    eventId,
    payload: object,
  });

  // Send to ledger
  await sendToLedger({
    provider: "stripe",
    eventType: event.type,
    amount,
    currency,
    raw: object,
  });

  // Lore event
  await sendLoreEvent({
    provider: "stripe",
    eventType: event.type,
    narrative: `Stripe event ${event.type} received for customer ${
      object.customer || "unknown"
    }`,
    raw: object,
  });

  // Job registry (e.g. post-payment processing)
  await enqueueJob({
    queue: "payments",
    type: "stripe_event",
    payload: {
      eventType: event.type,
      eventId,
      object,
    },
  });

  return res.json({ received: true });
});

export default router;
