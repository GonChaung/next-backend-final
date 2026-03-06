// Borrow request routes — GET (list requests) and POST (create request)
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireRole } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

const DB_NAME = "library_db";

export async function OPTIONS(req) {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

// GET /api/borrow — List borrowing requests
// ADMIN sees all requests, USER sees only their own
export async function GET(req) {
  const { user, error } = await requireRole(req);
  if (error) return error;

  try {
    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    // ADMIN sees all, USER sees only their own requests
    const query = user.role === "ADMIN" ? {} : { userId: user.id };
    const borrows = await db.collection("borrows").find(query).sort({ createdAt: -1 }).toArray();

    return NextResponse.json(borrows, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/borrow — Create a new borrowing request (USER only)
// If book quantity > 0 → ACCEPTED (quantity decremented)
// If book quantity = 0 → CLOSE-NO-AVAILABLE-BOOK
export async function POST(req) {
  const { user, error } = await requireRole(req, "USER");
  if (error) return error;

  try {
    const data = await req.json();
    const { bookId, targetDate } = data;

    if (!bookId || !targetDate) {
      return NextResponse.json(
        { message: "Missing required fields: bookId, targetDate" },
        { status: 400, headers: corsHeaders }
      );
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    // Find the book
    const book = await db.collection("books").findOne({
      _id: new ObjectId(bookId),
      status: "ACTIVE"
    });

    if (!book) {
      return NextResponse.json(
        { message: "Book not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Determine borrow requestStatus based on book availability
    let borrowStatus;
    if (book.quantity > 0) {
      borrowStatus = "ACCEPTED";
      // Reduce book quantity by 1
      await db.collection("books").updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { quantity: -1 } }
      );
    } else {
      borrowStatus = "CLOSE-NO-AVAILABLE-BOOK";
    }

    // Create borrow request
    const borrowRequest = {
      userId: user.id,
      userEmail: user.email,
      bookId: bookId,
      bookTitle: book.title,
      createdAt: new Date(),
      targetDate: new Date(targetDate),
      requestStatus: borrowStatus,
    };

    const result = await db.collection("borrows").insertOne(borrowRequest);

    return NextResponse.json(
      { id: result.insertedId, ...borrowRequest },
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}