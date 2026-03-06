// auth.js — JWT verification and role-based access control

import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "myjwtsecret";

// Verify JWT from Authorization header and return decoded payload or null
export function verifyToken(req) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

// Check authentication + role authorization
// Returns { user, error } where error is a NextResponse if auth failed
export async function requireRole(req, ...allowedRoles) {
  const { NextResponse } = await import("next/server");
  const corsHeaders = (await import("@/lib/cors")).default;

  const user = verifyToken(req);

  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { message: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      ),
    };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      user: null,
      error: NextResponse.json(
        { message: "Forbidden" },
        { status: 403, headers: corsHeaders },
      ),
    };
  }

  return { user, error: null };
}
