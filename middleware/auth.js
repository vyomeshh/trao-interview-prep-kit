import jwt from "jsonwebtoken";

function getToken(req) {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return req.cookies?.[process.env.COOKIE_NAME || "trao_session"] || null;
}

export function authenticate(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ error: "Session expired or invalid." });
  }
}

export function originGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origin = req.get("origin");
  if (!origin) return next();

  const allowed = new Set(
    (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (!allowed.has(origin)) {
    return res.status(403).json({ error: "Request origin is not allowed." });
  }
  return next();
}
