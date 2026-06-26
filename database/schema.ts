import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "drizzle-orm/neon";

export const apiTokens = pgTable("api_tokens", {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    userId: uuid("user_id").notNull(),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at"),
    createdByIpAddress: text("created_by_ip_address").notNull(),
    name: text("name").notNull(),
}, (table) => [
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "fk_api_tokens_user_id",
    }).onDelete("cascade"),
    index("idx_api_tokens_user_id").on(table.userId),
    uniqueIndex("idx_api_tokens_token").on(table.token),
]);

export const mcpOAuthClients = pgTable("mcp_oauth_clients", {
    clientId: text("client_id").primaryKey(),
    clientSecret: text("client_secret"),
    clientIdIssuedAt: integer("client_id_issued_at").notNull(),
    clientSecretExpiresAt: integer("client_secret_expires_at"),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull(),
    grantTypes: jsonb("grant_types").$type<string[]>().notNull(),
    responseTypes: jsonb("response_types").$type<string[]>().notNull(),
    clientName: text("client_name"),
    scope: text("scope"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    index("idx_mcp_oauth_clients_created_at").on(table.createdAt),
]);

export const mcpOAuthAuthorizationCodes = pgTable("mcp_oauth_authorization_codes", {
    code: text("code").primaryKey(),
    clientId: text("client_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull(),
    scope: text("scope"),
    resource: text("resource"),
    userId: uuid("user_id").notNull(),
    accessToken: text("access_token").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
    foreignKey({
        columns: [table.clientId],
        foreignColumns: [mcpOAuthClients.clientId],
        name: "fk_mcp_oauth_authorization_codes_client_id",
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "fk_mcp_oauth_authorization_codes_user_id",
    }).onDelete("cascade"),
    index("idx_mcp_oauth_authorization_codes_client_id").on(table.clientId),
    index("idx_mcp_oauth_authorization_codes_expires_at").on(table.expiresAt),
]);
