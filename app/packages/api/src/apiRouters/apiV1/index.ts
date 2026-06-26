import { Hono } from "hono";
import authenticate from "../../utils/authenticate";
import { getRoute } from "../../utils/defineOpenapiRoute";
import type { InferSelectModel } from "drizzle-orm";
import type { users } from "drizzle-orm/neon/neon-auth";
import { object, string } from "valibot";

const apiV1 = new Hono<{
    Variables: {
        user: InferSelectModel<typeof users>;
    };
}>();

apiV1.use("*", async (c, next) => {
    const auth = await authenticate(c.req.raw);
    if (!auth.success) {
        return c.json({ code: "UNAUTHORIZED", message: auth.error }, 401);
    }
    c.set("user", auth.user);
    await next();
});

getRoute(apiV1, {
    errorTypes: [],
    outputSchema: object({
        message: string(),
    }),
    async handler() {
        return {
            success: true,
            data: {
                message: "Hello World",
            },
        };
    },
    path: "/hello",
    summary: "A path to test the openapi router",
});

export default apiV1;
