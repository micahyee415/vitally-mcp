import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerAdminTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "search_admins",
    "Look up a Vitally admin (CSM or AE) by their email address.",
    {
      email: z.string(),
    },
    async ({ email }) => {
      try {
        const admin = await client.get("/admins/search", { email });
        return text(admin);
      } catch (err) {
        return toolError(`Failed to search admins: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
