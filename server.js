import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.js";
import kitRoutes from "./routes/kits.js";

const app = express();
const PORT = Number(process.env.PORT || 5000);
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error("CORS_ORIGIN_NOT_ALLOWED"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "trao-backend",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/kits", kitRoutes);

app.use((err, _req, res, _next) => {
  if (err?.message === "CORS_ORIGIN_NOT_ALLOWED") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  console.error(err);
  return res.status(500).json({ error: "Unexpected server error." });
});

const start = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is required.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  app.listen(PORT, () => console.log(`Trao backend listening on http://localhost:${PORT}`));
};

start().catch((error) => {
  console.error("Failed to start:", error.message);
  process.exit(1);
});
