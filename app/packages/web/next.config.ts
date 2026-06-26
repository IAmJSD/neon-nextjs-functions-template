import type { NextConfig } from "next";
import { join, sep } from "path";
import dotenv from "dotenv";

const root = join(__dirname, "..", "..", "..");

if (process.env.NODE_ENV === "development") {
    dotenv.config({
        path: [
            `${root}${sep}.env`,
            `${root}${sep}.env.local`,
            `${root}${sep}.env.development`,
        ],
    });
}

const nextConfig: NextConfig = {
    reactStrictMode: true,
    turbopack: {
        root,
    },
};

export default nextConfig;
