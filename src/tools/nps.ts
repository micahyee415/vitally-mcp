import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerNpsTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_nps_responses",
    "List Vitally NPS responses with optional target filter and pagination.",
    {
      target: z.enum(["accounts", "organization"]).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ target, limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (target) params.target = target;
        if (limit) params.limit = limit;
        const responses = await client.list("/npsResponses", params);
        return text({ count: responses.length, responses });
      } catch (err) {
        return toolError(`Failed to list NPS responses: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_nps_for_account",
    "List all Vitally NPS responses for a specific account.",
    {
      accountId: z.string(),
    },
    async ({ accountId }) => {
      try {
        const responses = await client.list(`/accounts/${encodeURIComponent(accountId)}/npsResponses`);
        return text({ count: responses.length, responses });
      } catch (err) {
        return toolError(`Failed to list NPS responses for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
