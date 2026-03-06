// Book collection routes — GET (list/search) and POST (create)
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { verifyToken, requireRole } from "@/lib/auth";
import { NextResponse } from "next/server";

const DB_NAME = "library_db";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

// GET /api/book — List all books with optional search filters
// Query params: ?title=xxx&author=xxx (case-insensitive)
// ADMIN sees ACTIVE + DELETED books, USER sees only ACTIVE
export async function GET(req) {
  const { user, error } = await requireRole(req);
  if (error) return error;

  try {
    const { searchParams } = new URL(req.url);
    const titleFilter = searchParams.get("title");
    const authorFilter = searchParams.get("author");

    // Build query filter
    const query = {};

    // Role-based visibility: USER can only see ACTIVE books
    if (user.role !== "ADMIN") {
      query.status = "ACTIVE";
    }

    // Case-insensitive search filters
    if (titleFilter) {
      query.title = { $regex: titleFilter, $options: "i" };
    }
    if (authorFilter) {
      query.author = { $regex: authorFilter, $options: "i" };
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const books = await db.collection("books").find(query).toArray();

    return NextResponse.json(books, {
      headers: corsHeaders
    });
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/book — Create a new book (ADMIN only)
export async function POST(req) {
  const { user, error } = await requireRole(req, "ADMIN");
  if (error) return error;

  try {
    const data = await req.json();
    const { title, author, quantity, location } = data;

    // Validate required fields
    if (!title || !author || quantity === undefined || !location) {
      return NextResponse.json(
        { message: "Missing required fields: title, author, quantity, location" },
        { status: 400, headers: corsHeaders }
      );
    }

    const newBook = {
      title,
      author,
      quantity: parseInt(quantity),
      location,
      status: "ACTIVE",
      createdAt: new Date(),
      createdBy: user.email,
    };

    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const result = await db.collection("books").insertOne(newBook);

    return NextResponse.json(
      { id: result.insertedId, ...newBook },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}
