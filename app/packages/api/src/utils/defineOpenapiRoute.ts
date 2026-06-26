import { describeRoute, resolver } from "hono-openapi";
import type { Hono } from "hono";
import type { ParamKeyToRecord, ParamKeys } from "hono/types";
import { safeParse, type BaseSchema, type InferInput, type InferOutput } from "valibot";
import { toJsonSchema } from "@valibot/to-json-schema";
import type { InferSelectModel } from "drizzle-orm";
import type { users } from "drizzle-orm/neon";
import type { OpenAPIV3_1 } from "openapi-types";

const errorResponse = {
    "BAD_REQUEST": 400,
} as const;

type User = InferSelectModel<typeof users>;

type Env = {
    Variables: {
        user: User;
    };
};

type UnionToIntersection<T> = (
    T extends any ? (x: T) => unknown : never
) extends (x: infer R) => unknown ? R : never;

type PathParams<Path extends string> = UnionToIntersection<ParamKeyToRecord<ParamKeys<Path>>>;

type RoutePartial<
    Path extends string,
    ErrorTypes extends (keyof typeof errorResponse)[],
> = {
    path: Path,
    summary: string,
    errorTypes: ErrorTypes,
};

type HnResult<
    OutputSchema extends BaseSchema<any, any, any>,
    ErrorTypes extends (keyof typeof errorResponse)[],
> = Promise<{
    success: true;
    data: InferOutput<OutputSchema>;
} | {
    success: false;
    code: ErrorTypes[number];
    message: string;
}>;

type GetRoute<
    Path extends string,
    OutputSchema extends BaseSchema<any, any, any>,
    ErrorTypes extends (keyof typeof errorResponse)[],
> = RoutePartial<Path, ErrorTypes> & {
    outputSchema: OutputSchema,
    handler: (user: User, params: PathParams<Path>) => HnResult<OutputSchema, ErrorTypes>,
};

type ThingOrNot<K extends string, V> = {
    [_ in K]: V;
} | {
    [_ in K]?: never;
};

type MutationRouteSchemaOutput<S extends BaseSchema<any, any, any> | undefined> = S extends BaseSchema<any, any, any> ? {
    success: true;
    data: InferOutput<S>;
} : {
    success: true;
};

type MutationRouteOutput<
    OutputSchema extends BaseSchema<any, any, any> | undefined,
    ErrorTypes extends (keyof typeof errorResponse)[],
> = MutationRouteSchemaOutput<OutputSchema> | {
    success: false;
    code: ErrorTypes[number];
    message: string;
};

type MutationRouteHn<
    Path extends string,
    InputSchema extends BaseSchema<any, any, any> | undefined,
    OutputSchema extends BaseSchema<any, any, any> | undefined,
    ErrorTypes extends (keyof typeof errorResponse)[],
> = InputSchema extends BaseSchema<any, any, any> ?
    (user: User, params: PathParams<Path>, input: InferInput<InputSchema>) => Promise<MutationRouteOutput<OutputSchema, ErrorTypes>> :
    (user: User, params: PathParams<Path>) => Promise<MutationRouteOutput<OutputSchema, ErrorTypes>>;

type MutationRoute<
    Method extends "POST" | "PUT" | "DELETE" | "PATCH",
    Path extends string,
    InputSchema extends BaseSchema<any, any, any> | undefined,
    OutputSchema extends BaseSchema<any, any, any> | undefined,
    ErrorTypes extends (keyof typeof errorResponse)[],
> =
    RoutePartial<Path, ErrorTypes> &
    ThingOrNot<"inputSchema", InputSchema> &
    ThingOrNot<"outputSchema", OutputSchema> &
    { method: Method; handler: MutationRouteHn<Path, InputSchema, OutputSchema, ErrorTypes> };

const errObj = {
    type: "object" as const,
    properties: {
        code: {
            type: "string" as const,
            description: "The error code",
        },
        message: {
            type: "string" as const,
            description: "The error message",
        },
    },
    required: ["code", "message"],
};

export function getRoute<
    Path extends string,
    OutputSchema extends BaseSchema<any, any, any>,
    ErrorTypes extends (keyof typeof errorResponse)[],
>(
    router: Hono<Env>,
    route: GetRoute<Path, OutputSchema, ErrorTypes>,
) {
    const codes = {
        200: {
            description: "SUCCESS",
            content: {
                "application/json": {
                    schema: resolver(route.outputSchema),
                },
            },
        },
        401: {
            description: "UNAUTHORIZED",
            content: {
                "application/json": {
                    schema: errObj,
                },
            },
        },
    };
    for (const errorType of route.errorTypes) {
        (codes as any)[errorResponse[errorType]] = {
            description: errorType,
            content: {
                "application/json": {
                    schema: errObj,
                },
            },
        };
    }

    router.get(route.path, describeRoute({
        summary: route.summary,
        responses: codes,
    }), async (c) => {
        const user = c.get("user") as User;
        const params = c.req.param();
        const output = await route.handler(user, params as PathParams<Path>);
        if (output.success) {
            const d = safeParse(route.outputSchema, output.data);
            if (!d.success) {
                throw new Error(d.issues.join("\n"));
            }
            return c.json(d.output);
        }
        return c.json({ code: output.code, message: output.message }, errorResponse[output.code]);
    });
}

export function mutationRoute<
    Method extends "POST" | "PUT" | "DELETE" | "PATCH",
    Path extends string,
    InputSchema extends BaseSchema<any, any, any> | undefined,
    OutputSchema extends BaseSchema<any, any, any> | undefined,
    ErrorTypes extends (keyof typeof errorResponse)[],
>(
    router: Hono<Env>,
    route: MutationRoute<Method, Path, InputSchema, OutputSchema, ErrorTypes>,
) {
    const codes = {
        401: {
            description: "UNAUTHORIZED",
            content: {
                "application/json": {
                    schema: errObj,
                },
            },
        },
    };

    if (route.outputSchema) {
        (codes as any)[200] = {
            description: "SUCCESS",
            content: {
                "application/json": {
                    schema: resolver(route.outputSchema),
                },
            },
        };
    } else {
        (codes as any)[204] = {
            description: "NO CONTENT",
        };
    }
    for (const errorType of route.errorTypes) {
        (codes as any)[errorResponse[errorType]] = {
            description: errorType,
            content: {
                "application/json": {
                    schema: errObj,
                },
            },
        };
    }

    const requestBody = (() => {
        if (!route.inputSchema) return undefined;
        return {
            required: true,
            content: {
                "application/json": {
                    schema: toJsonSchema(route.inputSchema, { target: "openapi-3.0" }) as OpenAPIV3_1.SchemaObject,
                },
            },
        };
    })();

    const routerDesc = describeRoute({
        summary: route.summary,
        responses: codes,
        requestBody,
    });

    router[route.method.toLowerCase() as Lowercase<Method>](route.path, routerDesc, async (c) => {
        const user = c.get("user") as User;
        const params = c.req.param() as PathParams<Path>;

        const output = await (async (): Promise<MutationRouteOutput<OutputSchema, ErrorTypes> | Response> => {
            if (route.inputSchema) {
                const rawInput = await c.req.json();
                const parsedInput = safeParse(route.inputSchema, rawInput);
                if (!parsedInput.success) {
                    return c.json({ code: "BAD_REQUEST", message: parsedInput.issues.join(", ") }, 400);
                }
                return route.handler(user, params, parsedInput.output);
            }
            return route.handler(user, params, undefined);
        })();

        if (output instanceof Response) {
            return output;
        }

        if (output.success) {
            if (!route.outputSchema) {
                return c.body(null, 204);
            }
            if (!("data" in output)) {
                throw new Error("Route declared an output schema but handler returned no data");
            }
            const parsedOutput = safeParse(route.outputSchema, output.data);
            if (!parsedOutput.success) {
                throw new Error(parsedOutput.issues.join("\n"));
            }
            return c.json(parsedOutput.output);
        }

        return c.json({ code: output.code, message: output.message }, errorResponse[output.code]);
    });
}
