import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerCustomObjectTools(server: McpServer, client: VitallyClient, canWrite: boolean): void {
  server.tool(
    "list_custom_objects",
    "List all custom object definitions in Vitally.",
    {},
    async () => {
      try {
        const objects = await client.list("/customObjects");
        return text({ count: objects.length, objects });
      } catch (err) {
        return toolError(`Failed to list custom objects: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_custom_object_instances",
    "List instances of a specific custom object.",
    {
      customObjectId: z.string(),
      archived: z.boolean().optional(),
    },
    async ({ customObjectId, archived }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (archived !== undefined) params.archived = archived;
        const instances = await client.list(
          `/customObjects/${encodeURIComponent(customObjectId)}/instances`,
          params
        );
        return text({ count: instances.length, instances });
      } catch (err) {
        return toolError(`Failed to list custom object instances: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "search_custom_object_instances",
    "Search for a custom object instance by id, externalId, customerId, or organizationId. Provide at least one search parameter.",
    {
      customObjectId: z.string(),
      id: z.string().optional(),
      externalId: z.string().optional(),
      customerId: z.string().optional(),
      organizationId: z.string().optional(),
    },
    async ({ customObjectId, id, externalId, customerId, organizationId }) => {
      if (!id && !externalId && !customerId && !organizationId) {
        return toolError("At least one search parameter (id, externalId, customerId, or organizationId) is required.");
      }
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (id) params.id = id;
        if (externalId) params.externalId = externalId;
        if (customerId) params.customerId = customerId;
        if (organizationId) params.organizationId = organizationId;
        const result = await client.get(
          `/customObjects/${encodeURIComponent(customObjectId)}/instances/search`,
          params
        );
        return text(result);
      } catch (err) {
        return toolError(`Failed to search custom object instances: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  if (canWrite) {
    server.tool(
      "create_custom_object_instance",
      "Create a new instance of a custom object in Vitally.",
      {
        customObjectId: z.string(),
        name: z.string(),
        customerId: z.string().optional(),
        organizationId: z.string().optional(),
        externalId: z.string().optional(),
        ownedByVitallyUserId: z.string().optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = { name: params.name };
          if (params.customerId !== undefined) body.customerId = params.customerId;
          if (params.organizationId !== undefined) body.organizationId = params.organizationId;
          if (params.externalId !== undefined) body.externalId = params.externalId;
          if (params.ownedByVitallyUserId !== undefined) body.ownedByVitallyUserId = params.ownedByVitallyUserId;
          if (params.traits !== undefined) body.traits = params.traits;

          const result = await client.post(
            `/customObjects/${encodeURIComponent(params.customObjectId)}/instances`,
            body
          );
          return text(result);
        } catch (err) {
          return toolError(`Failed to create custom object instance: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "update_custom_object_instance",
      "Update an existing custom object instance in Vitally.",
      {
        customObjectId: z.string(),
        instanceId: z.string(),
        name: z.string().optional(),
        externalId: z.string().optional(),
        ownedByVitallyUserId: z.string().optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = {};
          if (params.name !== undefined) body.name = params.name;
          if (params.externalId !== undefined) body.externalId = params.externalId;
          if (params.ownedByVitallyUserId !== undefined) body.ownedByVitallyUserId = params.ownedByVitallyUserId;
          if (params.traits !== undefined) body.traits = params.traits;

          const result = await client.put(
            `/customObjects/${encodeURIComponent(params.customObjectId)}/instances/${encodeURIComponent(params.instanceId)}`,
            body
          );
          return text(result);
        } catch (err) {
          return toolError(`Failed to update custom object instance: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "delete_custom_object_instance",
      "Archive a custom object instance (sets archivedAt — not a hard delete).",
      {
        customObjectId: z.string(),
        instanceId: z.string(),
      },
      async ({ customObjectId, instanceId }) => {
        try {
          await client.del(
            `/customObjects/${encodeURIComponent(customObjectId)}/instances/${encodeURIComponent(instanceId)}`
          );
          return text({ archived: true, instanceId });
        } catch (err) {
          return toolError(`Failed to archive custom object instance: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
