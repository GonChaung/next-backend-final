// ensureIndexes.js — Create database indexes and seed test users

import { getClientPromise } from "@/lib/mongodb";
import bcrypt from "bcrypt";

const DB_NAME = "library_db";

// Create unique indexes for users and books collections
export async function ensureIndexes() {
  const client = await getClientPromise();
  const db = client.db(DB_NAME);

  const userCollection = db.collection("users");
  await userCollection.createIndex({ username: 1 }, { unique: true });
  await userCollection.createIndex({ email: 1 }, { unique: true });

  const bookCollection = db.collection("books");
  await bookCollection.createIndex({ title: 1 });
}

// Seed test users (admin and regular user) if they don't already exist
export async function seedUsers() {
  const client = await getClientPromise();
  const db = client.db(DB_NAME);
  const userCollection = db.collection("users");

  const testUsers = [
    {
      username: "admin",
      email: "admin@test.com",
      password: await bcrypt.hash("admin123", 10),
      firstname: "Admin",
      lastname: "User",
      role: "ADMIN",
      status: "ACTIVE",
    },
    {
      username: "user",
      email: "user@test.com",
      password: await bcrypt.hash("user123", 10),
      firstname: "Regular",
      lastname: "User",
      role: "USER",
      status: "ACTIVE",
    },
  ];

  for (const testUser of testUsers) {
    const existing = await userCollection.findOne({ email: testUser.email });
    if (!existing) {
      await userCollection.insertOne(testUser);
    }
  }
}