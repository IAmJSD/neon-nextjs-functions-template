let loadedMcpApp: Promise<typeof import("./mcpApp")> | null = null;

function loadMcpApp() {
    loadedMcpApp ??= import("./mcpApp");
    return loadedMcpApp;
}

export default {
    async fetch(request: Request, env?: unknown, executionContext?: unknown) {
        const { default: app } = await loadMcpApp();
            const fetch = app.fetch as (request: Request, env?: unknown, executionContext?: unknown) => Response | Promise<Response>;
            return await fetch(request, env, executionContext);
    },
};
