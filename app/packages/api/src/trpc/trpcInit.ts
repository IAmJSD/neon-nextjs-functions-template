import { initTRPC } from "@trpc/server";
import type { InferSelectModel } from "drizzle-orm";
import type { users } from "drizzle-orm/neon";

const t = initTRPC.context<{
    user: InferSelectModel<typeof users>;
}>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
