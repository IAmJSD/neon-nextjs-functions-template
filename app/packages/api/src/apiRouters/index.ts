import { Hono } from "hono";
import apiV1 from "./apiV1";

const api = new Hono();

api.route("/v1", apiV1);

export default api;
