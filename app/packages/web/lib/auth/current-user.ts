import "server-only";

import pool from "database/pool";
import { eq } from "drizzle-orm";
import { users } from "drizzle-orm/neon";
import authServer from "./server";

export async function getCurrentUser() {
  const session = await authServer.getSession();
  const sessionUser = session.data?.user;

  if (!sessionUser) {
    return null;
  }

  const [databaseUser] = await pool.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);

  if (!databaseUser) {
    return sessionUser;
  }

  return {
    ...sessionUser,
    ...databaseUser,
    image: databaseUser.image ?? null,
  };
}
