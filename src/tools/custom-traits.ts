import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerCustomTraitTools(server: McpServer, client: VitallyClient, canWrite: boolean): void {
  server.tool(
    "list_custom_traits",
    "List custom trait definitions (custom fields) in Vitally. Optionally filter by model or customObjectId.",
    {
      model: z.enum([
        "users", "accounts", "organizations", "customObjects",
        "tasks", "notes", "projects", "conversations", "team",
      ]).optional(),
      customObjectId: z.string().optional(),
    },
    async ({ model, customObjectId }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (model) params.model = model;
        if (customObjectId) params.customObjectId = customObjectId;
        const traits = await client.get("/customFields", params);
        return text(traits);
      } catch (err) {
        return toolError(`Failed to list custom traits: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  if (canWrite) {
    server.tool(
      "update_traits",
      "Update custom traits on a Vitally object (account, organization, user, task, note, or project).",
      {
        objectType: z.enum(["accounts", "organizations", "users", "tasks", "notes", "projects"]),
        id: z.string(),
        traits: z.record(z.string(), z.unknown()),
      },
      async ({ objectType, id, traits }) => {
        try {
          const result = await client.put(
            `/${objectType}/${encodeURIComponent(id)}`,
            { traits }
          );
          return text(result);
        } catch (err) {
          return toolError(`Failed to update traits: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
