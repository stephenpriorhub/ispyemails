import "dotenv/config";
import { defineConfig } from "prisma/config";

// dotenv loads /app/.env (written by entrypoint.sh at startup) in production
// and .env.local in local dev via Next.js / start.sh
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
