import { config as dotenvConfig } from "dotenv";
import { defineConfig } from "prisma/config";

// Load from DOTENV_CONFIG_PATH (set by entrypoint.sh to /tmp/.env in production)
// or fall back to default .env in local dev
dotenvConfig({ path: process.env.DOTENV_CONFIG_PATH ?? ".env", override: false });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
