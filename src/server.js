"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const body_parser_1 = __importDefault(require("body-parser"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const config_1 = require("./config");
const app = (0, express_1.default)();
const PORT = config_1.config.port;
// --- Global rate limit (simple VIP shield) ---
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false
});
// Stripe requires raw body for signature verification
app.use("/webhooks/stripe", body_parser_1.default.raw({ type: "application/json" }));
// PayPal can use JSON
app.use("/webhooks/paypal", body_parser_1.default.json());
app.use((0, cors_1.default)());
app.use((0, morgan_1.default)("dev"));
app.use(limiter);
app.use(express_1.default.json());
// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "API Gateway Crown Online",
        env: config_1.config.env
    });
});
// Mount webhook routes
app.use("/webhooks", webhooks_1.default);
app.listen(PORT, () => {
    console.log(`API Gateway Crown running on port ${PORT} in ${config_1.config.env} mode`);
});
