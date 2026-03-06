// Borrow request routes — GET (list), POST (create), PATCH (update status)
import corsHeaders from "@/lib/cors";
import { getClientPromise } from "@/lib/mongodb";
import { requireRole } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

const DB_NAME = "library_db";

// Valid requestStatus values per exam specification
const VALID_STATUSES = ["INIT", "CLOSE-NO-AVAILABLE-BOOK", "ACCEPTED", "CANCEL-ADMIN", "CANCEL-USER"];

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
// Status transition: INIT → ACCEPTED (if qty > 0) or INIT → CLOSE-NO-AVAILABLE-BOOK (if qty == 0)
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

    // Step 1: Create borrow request with INIT status
    const borrowRequest = {
      userId: user.id,
      userEmail: user.email,
      bookId: bookId,
      bookTitle: book.title,
      createdAt: new Date(),
      targetDate: new Date(targetDate),
      requestStatus: "INIT",
    };

    const result = await db.collection("borrows").insertOne(borrowRequest);
    const borrowId = result.insertedId;

    // Step 2: Transition from INIT based on book availability
    let finalStatus;
    if (book.quantity > 0) {
      finalStatus = "ACCEPTED";
      // Reduce book quantity by 1
      await db.collection("books").updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { quantity: -1 } }
      );
    } else {
      finalStatus = "CLOSE-NO-AVAILABLE-BOOK";
    }

    // Step 3: Update requestStatus from INIT to final status
    await db.collection("borrows").updateOne(
      { _id: borrowId },
      { $set: { requestStatus: finalStatus } }
    );

    borrowRequest._id = borrowId;
    borrowRequest.requestStatus = finalStatus;

    return NextResponse.json(
      borrowRequest,
      { status: 201, headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH /api/borrow — Update borrow request status (cancel)
// ADMIN can set CANCEL-ADMIN, USER can set CANCEL-USER on their own requests
export async function PATCH(req) {
  const { user, error } = await requireRole(req);
  if (error) return error;

  try {
    const data = await req.json();
    const { borrowId, requestStatus } = data;

    if (!borrowId || !requestStatus) {
      return NextResponse.json(
        { message: "Missing required fields: borrowId, requestStatus" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate the requested status
    if (!VALID_STATUSES.includes(requestStatus)) {
      return NextResponse.json(
        { message: "Invalid requestStatus value" },
        { status: 400, headers: corsHeaders }
      );
    }

    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    // Find the borrow request
    const borrow = await db.collection("borrows").findOne({ _id: new ObjectId(borrowId) });

    if (!borrow) {
      return NextResponse.json(
        { message: "Borrow request not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Authorization: USER can only cancel their own requests
    if (user.role === "USER") {
      if (borrow.userId !== user.id) {
        return NextResponse.json(
          { message: "Forbidden" },
          { status: 403, headers: corsHeaders }
        );
      }
      // USER can only set CANCEL-USER
      if (requestStatus !== "CANCEL-USER") {
        return NextResponse.json(
          { message: "Forbidden: Users can only cancel their own requests" },
          { status: 403, headers: corsHeaders }
        );
      }
    }

    // ADMIN can only set CANCEL-ADMIN
    if (user.role === "ADMIN" && requestStatus !== "CANCEL-ADMIN") {
      return NextResponse.json(
        { message: "Forbidden: Admins can only use CANCEL-ADMIN status" },
        { status: 403, headers: corsHeaders }
      );
    }

    // Only ACCEPTED requests can be cancelled (restore quantity)
    if (borrow.requestStatus === "ACCEPTED" && (requestStatus === "CANCEL-ADMIN" || requestStatus === "CANCEL-USER")) {
      // Restore book quantity when cancelling an accepted request
      await db.collection("books").updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { quantity: 1 } }
      );
    }

    // Update the request status
    await db.collection("borrows").updateOne(
      { _id: new ObjectId(borrowId) },
      { $set: { requestStatus: requestStatus, updatedAt: new Date() } }
    );

    return NextResponse.json(
      { message: "Borrow request updated", requestStatus: requestStatus },
      { headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}