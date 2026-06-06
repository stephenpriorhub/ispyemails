import { defineConfig } from "prisma/config";

// In production, DATABASE_URL is injected by Railway.
// In local dev, it's loaded by Next.js from .env.local.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
