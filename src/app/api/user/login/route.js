
// User login route — authenticates user and returns JWT token
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { ensureIndexes, seedUsers } from "@/lib/ensureIndexes";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "myjwtsecret";
const DB_NAME = "library_db";

// Track if seeding has been done this session
let hasSeeded = false;

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req) {
  const data = await req.json();
  const { email, password } = data;

  if (!email || !password) {
    return NextResponse.json({
      message: "Missing email or password"
    }, {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    // Auto-seed test users on first login attempt
    if (!hasSeeded) {
      await ensureIndexes();
      await seedUsers();
      hasSeeded = true;
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return NextResponse.json({
        message: "Invalid email or password"
      }, {
        status: 401,
        headers: corsHeaders
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json({
        message: "Invalid email or password"
      }, {
        status: 401,
        headers: corsHeaders
      });
    }

    // Generate JWT with user info including role
    const token = jwt.sign({
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role || "USER"
    }, JWT_SECRET, { expiresIn: "7d" });

    // Return token in response body for frontend localStorage storage
    const response = NextResponse.json({
      message: "Login successful",
      token: token,
      user: {
        email: user.email,
        username: user.username,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role || "USER"
      }
    }, {
      status: 200,
      headers: corsHeaders
    });

    // Also set JWT as HTTP-only cookie (backup auth method)
    response.cookies.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      secure: process.env.NODE_ENV === "production"
    });

    return response;
  } catch (exception) {
    return NextResponse.json({
      message: "Internal server error"
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
