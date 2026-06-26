import { Hono } from "hono";
import oauthRouter from "./oauth";

const app = new Hono();

app.route("/mcp", oauthRouter);

export default app;
