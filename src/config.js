"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    env: process.env.NODE_ENV || "development",
    port: process.env.PORT ? Number(process.env.PORT) : 4000,
    internal: {
        secret: process.env.INTERNAL_GATEWAY_SECRET || ""
    },
    orchestrator: {
        webhookUrl: process.env.ORCH_WEBHOOK_URL ||
            "http://localhost:8080/api/worker/webhook",
        ledgerUrl: process.env.ORCH_LEDGER_URL ||
            "http://localhost:8080/api/worker/ledger",
        loreUrl: process.env.ORCH_LORE_URL ||
            "http://localhost:8080/api/worker/lore",
        jobRegistryUrl: process.env.ORCH_JOB_REGISTRY_URL ||
            "http://localhost:8080/api/worker/jobs"
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || "",
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ""
    },
    paypal: {
        clientId: process.env.PAYPAL_CLIENT_ID || "",
        clientSecret: process.env.PAYPAL_CLIENT_SECRET || ""
    }
};
