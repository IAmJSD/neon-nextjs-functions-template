import { defineConfig } from "drizzle-kit";
import { join, sep } from "path";
import dotenv from "dotenv";

const root = join(__dirname, "..");

dotenv.config({
    path: [
        `${root}${sep}.env`,
        `${root}${sep}.env.local`,
        `${root}${sep}.env.development`,
    ],
});

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
    out: "./migrations",
    dialect: "postgresql",
    schema: "./schema.ts",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});
