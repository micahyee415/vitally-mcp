import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerOrganizationTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_organizations",
    "List Vitally organizations with pagination.",
    {
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (limit) params.limit = limit;
        const organizations = await client.list("/organizations", params);
        return text({ count: organizations.length, organizations });
      } catch (err) {
        return toolError(`Failed to list organizations: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_organization",
    "Get a single Vitally organization by its Vitally ID or externalId.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const organization = await client.get(`/organizations/${encodeURIComponent(id)}`);
        return text(organization);
      } catch (err) {
        return toolError(`Failed to get organization: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
