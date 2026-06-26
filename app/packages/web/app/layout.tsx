import type { Metadata } from "next";
import Navbar from "./navbar";
import "./globals.css";

// TODO: edit this
export const metadata: Metadata = {
  title: "Neon Next.js Serverless Template",
  description: "A Next.js app router template backed by Neon serverless Postgres.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="min-h-full bg-slate-50 [color-scheme:light] dark:bg-slate-950 dark:[color-scheme:dark]">
      <body className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-200 text-slate-900 antialiased dark:from-slate-950 dark:to-slate-900 dark:text-slate-100">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
