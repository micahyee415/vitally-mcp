import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerAccountTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_accounts",
    "List Vitally accounts with pagination. Filter by status: active (default), churned, or activeOrChurned.",
    {
      status: z.enum(["active", "churned", "activeOrChurned"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ status, limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (status) params.status = status;
        if (limit) params.limit = limit;
        const accounts = await client.list("/accounts", params);
        return text({ count: accounts.length, accounts });
      } catch (err) {
        return toolError(`Failed to list accounts: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_account",
    "Get a single Vitally account by its Vitally ID or externalId.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const account = await client.get(`/accounts/${encodeURIComponent(id)}`);
        return text(account);
      } catch (err) {
        return toolError(`Failed to get account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_account_health_scores",
    "Get the health score breakdown for a Vitally account.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const scores = await client.get(`/accounts/${encodeURIComponent(id)}/healthScores`);
        return text(scores);
      } catch (err) {
        return toolError(`Failed to get health scores: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
