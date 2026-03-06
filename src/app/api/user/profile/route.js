// User profile route — returns authenticated user's profile
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { verifyToken } from "@/lib/auth";
import { NextResponse } from "next/server";

const DB_NAME = "library_db";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(req) {
  // Verify JWT token from Authorization header
  const decoded = verifyToken(req);
  if (!decoded) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const email = decoded.email;
    const profile = await db.collection("users").findOne(
      { email },
      { projection: { password: 0 } }
    );

    if (!profile) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(profile, {
      headers: corsHeaders
    });
  }
  catch (error) {
    return NextResponse.json(
      { message: error.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}