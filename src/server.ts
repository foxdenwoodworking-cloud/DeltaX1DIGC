import express from "express";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";
import rateLimit from "express-rate-limit";
import webhookRoutes from "./routes/webhooks";
import { config } from "./config";

const app = express();
const PORT = config.port;

// -----------------------------------------------------
// GLOBAL RATE LIMIT (VIP SHIELD)
// -----------------------------------------------------
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,                // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false
});

// -----------------------------------------------------
// STRIPE RAW BODY MIDDLEWARE (MUST BE FIRST)
// -----------------------------------------------------
app.use(
  "/webhooks/stripe",
  bodyParser.raw({ type: "application/json" })
);

// -----------------------------------------------------
// PAYPAL WEBHOOK (JSON OK)
// -----------------------------------------------------
app.use(
  "/webhooks/paypal",
  bodyParser.json()
);

// -----------------------------------------------------
// GLOBAL MIDDLEWARE (SAFE AFTER WEBHOOKS)
// -----------------------------------------------------
app.use(cors());
app.use(morgan("dev"));
app.use(limiter);

// -----------------------------------------------------
// HEALTH CHECK
// -----------------------------------------------------
app.get("/health", (req, res) => {
  res.json({
    status: "API Gateway Crown Online",
    env: config.env
  });
});

// -----------------------------------------------------
// WEBHOOK ROUTES (MUST COME BEFORE express.json())
// -----------------------------------------------------
app.use("/webhooks", webhookRoutes);

// -----------------------------------------------------
// NORMAL JSON PARSER FOR EVERYTHING ELSE
// -----------------------------------------------------
app.use(express.json());

// -----------------------------------------------------
// SERVER START
// -----------------------------------------------------
app.listen(PORT, () => {
  console.log(
    `API Gateway Crown running on port ${PORT} in ${config.env} mode`
  );
});
