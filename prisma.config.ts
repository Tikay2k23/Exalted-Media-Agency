import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const fallbackDatabaseUrl =
  process.env.DATABASE_URL
  ?? process.env.POSTGRES_URL_NON_POOLING
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL
  ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ? env("DATABASE_URL") : fallbackDatabaseUrl,
  },
});
