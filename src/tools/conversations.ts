import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerConversationTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_conversations",
    "List Vitally conversations with pagination.",
    {
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (limit) params.limit = limit;
        const conversations = await client.list("/conversations", params);
        return text({ count: conversations.length, conversations });
      } catch (err) {
        return toolError(`Failed to list conversations: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_conversations_for_account",
    "List all Vitally conversations for a specific account.",
    {
      accountId: z.string(),
    },
    async ({ accountId }) => {
      try {
        const conversations = await client.list(`/accounts/${encodeURIComponent(accountId)}/conversations`);
        return text({ count: conversations.length, conversations });
      } catch (err) {
        return toolError(`Failed to list conversations for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
