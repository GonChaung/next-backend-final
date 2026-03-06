// Book detail routes — GET (by id), PATCH (update), DELETE (soft delete)
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

// GET /api/book/[id] — Get a single book by ID
// USER can only see ACTIVE books
export async function GET(req, { params }) {
  const { user, error } = await requireRole(req);
  if (error) return error;

  try {
    const { id } = await params;
    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const book = await db.collection("books").findOne({ _id: new ObjectId(id) });

    if (!book) {
      return NextResponse.json(
        { message: "Book not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // USER cannot see DELETED books
    if (user.role !== "ADMIN" && book.status === "DELETED") {
      return NextResponse.json(
        { message: "Book not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(book, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}

// PATCH /api/book/[id] — Update a book (ADMIN only)
export async function PATCH(req, { params }) {
  const { user, error } = await requireRole(req, "ADMIN");
  if (error) return error;

  try {
    const { id } = await params;
    const data = await req.json();

    // Only allow updating specific fields
    const updateFields = {};
    if (data.title !== undefined) updateFields.title = data.title;
    if (data.author !== undefined) updateFields.author = data.author;
    if (data.quantity !== undefined) updateFields.quantity = parseInt(data.quantity);
    if (data.location !== undefined) updateFields.location = data.location;
    if (data.status !== undefined) updateFields.status = data.status;

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { message: "No fields to update" },
        { status: 400, headers: corsHeaders }
      );
    }

    updateFields.updatedAt = new Date();

    const client = await getClientPromise();
    const db = client.db(DB_NAME);
    const result = await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: "Book not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { message: "Book updated successfully" },
      { headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}

// DELETE /api/book/[id] — Soft delete a book (ADMIN only)
// Sets status = "DELETED" instead of removing the record
export async function DELETE(req, { params }) {
  const { user, error } = await requireRole(req, "ADMIN");
  if (error) return error;

  try {
    const { id } = await params;
    const client = await getClientPromise();
    const db = client.db(DB_NAME);

    const result = await db.collection("books").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "DELETED", deletedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { message: "Book not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { message: "Book deleted successfully" },
      { headers: corsHeaders }
    );
  } catch (err) {
    return NextResponse.json(
      { message: err.toString() },
      { status: 500, headers: corsHeaders }
    );
  }
}
