import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

const COOKIE_NAME = process.env.COOKIE_NAME || "trao_session";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateCredentials(email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return null;
}

function setSessionCookie(res, userId) {
  const token = jwt.sign(
    { sub: String(userId) },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const validationError = validateCredentials(email, password);
    if (validationError) return res.status(400).json({ error: validationError });

    const existing = await User.findOne({ email }).lean();
    if (existing) return res.status(409).json({ error: "Email already registered." });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, password: hash });
    setSessionCookie(res, user._id);

    return res.status(201).json({ user: { id: user._id, email: user.email } });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    const validationError = validateCredentials(email, password);
    if (validationError) return res.status(400).json({ error: validationError });

    const user = await User.findOne({ email }).select("+password");
    const isMatch = user ? await bcrypt.compare(password, user.password) : false;

    if (!isMatch) return res.status(401).json({ error: "Invalid credentials." });

    setSessionCookie(res, user._id);
    return res.json({ user: { id: user._id, email: user.email } });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/"
  });
  return res.json({ ok: true });
});

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select("email").lean();
    if (!user) return res.status(401).json({ error: "Session is no longer valid." });
    return res.json({ user: { id: user._id, email: user.email } });
  })
);

export default router;
