// app.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config.js";
import { attachRequestContext } from "./Middleware/requestContextMiddleware.js";

// Routes
import authRouter from "./Routes/AuthRoute.js";
import instrumentStockNameRoute from "./Routes/instrumentStockNameRoute.js";
import optionChainRoute from "./Routes/optionChainRoute.js";
import chartRoute from "./Routes/ChartRoute.js";
import quotesRoute from "./Routes/quotes.js";
import instrumentsRoute from "./Routes/instruments.js";
import debugRoute from "./Routes/debug.js";
import orderRoute from "./Routes/orderRoute.js";
import kiteAuthRoute from "./Routes/kiteAuthRoute.js"

// New modular routes
import adminRoute from "./Routes/admin/index.js";
import brokerRoute from "./Routes/broker/index.js";
import customerRoute from "./Routes/customer/index.js";

export function createApp() {
  const app = express();

  // ----- CORS SETUP -----
  const isProduction = process.env.NODE_ENV === "production";
  const devOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
  ];
  const envOrigins = (config.origin || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const allowedOriginSet = new Set([
    ...(isProduction ? [] : devOrigins),
    ...envOrigins,
  ]);

  const corsOpts = {
    origin: (origin, callback) => {
      // Allow server-to-server / health checks with no Origin header.
      if (!origin) return callback(null, true);
      if (allowedOriginSet.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOpts));
  // ---------------------

  // Security headers
  app.use(helmet());

  // GZIP compression - reduces payload size by ~70% (improves load time)
  app.use(compression({ threshold: 1024 })); // Only compress responses > 1KB

  app.set("trust proxy", 1); // Essential for Cloudflare Tunnel to pass correct IPs
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(attachRequestContext);

  // ----- Auth helpers -----
  const REQUIRE_AUTH = process.env.NODE_ENV === "production";
  const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

  function authStrict(req, res, next) {
    if (!REQUIRE_AUTH) return next();
    const bearer = req.headers.authorization || "";
    const m = bearer.match(/^Bearer\s+(.+)$/i);
    const token = m?.[1] || req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // Quotes auth: verify bearer/cookie token signature
  function authQuotes(req, res, next) {
    if (!REQUIRE_AUTH) return next();
    const bearer = req.headers.authorization || "";
    const m = bearer.match(/^Bearer\s+(.+)$/i);
    const token = m?.[1] || req.cookies?.accessToken;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  // ----- Routes -----
  app.use("/api/debug", authStrict, debugRoute);
  app.use("/api/kite", kiteAuthRoute);  // Kite login/token routes
  app.use("/api/auth", authRouter);  // Auth routes are public (login, logout, etc.)
  app.use("/api", instrumentStockNameRoute);
  app.use("/api", optionChainRoute);
  app.use("/api/chart", chartRoute);
  app.use("/api/instruments", instrumentsRoute);
  app.use("/api/quotes", authQuotes, quotesRoute);
  app.use("/api/orders", orderRoute);
  
  // Admin routes
  app.use("/api/admin", adminRoute);

  // Broker routes
  app.use("/api/broker", brokerRoute);

  // Customer routes
  app.use("/api/customer", customerRoute);

  // Version endpoint for cache busting - INCREMENT VERSION ON EVERY DEPLOYMENT
  const APP_VERSION = '1.8.9';
  app.get("/api/version", (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      version: APP_VERSION,
      serverTime: new Date().toISOString()
    });
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Legacy Kite callback handler - redirect /api/ to /api/kite/callback for backward compatibility
  // This handles the case when Kite redirect URL is configured as /api/ instead of /api/kite/callback
  app.get("/api/", (req, res, next) => {
    if (req.query.request_token || req.query.action === 'login') {
      // Forward the entire query string to the kite callback
      const queryString = new URLSearchParams(req.query).toString();
      return res.redirect(`/api/kite/callback?${queryString}`);
    }
    next();
  });

  app.use((req, res) => res.status(404).json({ error: "Not Found" }));
  app.use((err, _req, res, _next) => {
    console.error("API Error:", err);
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Internal Server Error";
    res.status(statusCode).json({
      error: message,
      message,
      success: false,
    });
  });

  return app;
}
