import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerProjectTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_projects",
    "List Vitally projects with optional archived filter.",
    {
      archived: z.boolean().optional(),
    },
    async ({ archived }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (archived !== undefined) params.archived = archived;
        const projects = await client.list("/projects", params);
        return text({ count: projects.length, projects });
      } catch (err) {
        return toolError(`Failed to list projects: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_projects_for_account",
    "List all Vitally projects for a specific account.",
    {
      accountId: z.string(),
    },
    async ({ accountId }) => {
      try {
        const projects = await client.list(`/accounts/${encodeURIComponent(accountId)}/projects`);
        return text({ count: projects.length, projects });
      } catch (err) {
        return toolError(`Failed to list projects for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_project",
    "Get a single Vitally project by its ID.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const project = await client.get(`/projects/${encodeURIComponent(id)}`);
        return text(project);
      } catch (err) {
        return toolError(`Failed to get project: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
