import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerUserTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_users",
    "List Vitally users with pagination.",
    {
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (limit) params.limit = limit;
        const users = await client.list("/users", params);
        return text({ count: users.length, users });
      } catch (err) {
        return toolError(`Failed to list users: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_user",
    "Get a single Vitally user by its Vitally ID or externalId.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const user = await client.get(`/users/${encodeURIComponent(id)}`);
        return text(user);
      } catch (err) {
        return toolError(`Failed to get user: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "search_users",
    "Search for Vitally users by email, externalId, or emailSubdomain. Provide at least one search parameter.",
    {
      email: z.string().optional(),
      externalId: z.string().optional(),
      emailSubdomain: z.string().optional(),
    },
    async ({ email, externalId, emailSubdomain }) => {
      if (!email && !externalId && !emailSubdomain) {
        return toolError("At least one search parameter (email, externalId, or emailSubdomain) is required.");
      }
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (email) params.email = email;
        if (externalId) params.externalId = externalId;
        if (emailSubdomain) params.emailSubdomain = emailSubdomain;
        const result = await client.get("/users/search", params);
        return text(result);
      } catch (err) {
        return toolError(`Failed to search users: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_users_for_account",
    "List all Vitally users for a specific account.",
    {
      accountId: z.string(),
    },
    async ({ accountId }) => {
      try {
        const users = await client.list(`/accounts/${encodeURIComponent(accountId)}/users`);
        return text({ count: users.length, users });
      } catch (err) {
        return toolError(`Failed to list users for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
