import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerTaskTools(server: McpServer, client: VitallyClient, canWrite: boolean): void {
  server.tool(
    "list_tasks",
    "List Vitally tasks with optional source and archived filters.",
    {
      source: z.string().optional(),
      archived: z.boolean().optional(),
    },
    async ({ source, archived }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (source) params.source = source;
        if (archived !== undefined) params.archived = archived;
        const tasks = await client.list("/tasks", params);
        return text({ count: tasks.length, tasks });
      } catch (err) {
        return toolError(`Failed to list tasks: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_tasks_for_account",
    "List all Vitally tasks for a specific account.",
    {
      accountId: z.string(),
      source: z.string().optional(),
    },
    async ({ accountId, source }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (source) params.source = source;
        const tasks = await client.list(`/accounts/${encodeURIComponent(accountId)}/tasks`, params);
        return text({ count: tasks.length, tasks });
      } catch (err) {
        return toolError(`Failed to list tasks for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_task",
    "Get a single Vitally task by its ID.",
    {
      id: z.string(),
      source: z.string().optional(),
    },
    async ({ id, source }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (source) params.source = source;
        const task = await client.get(`/tasks/${encodeURIComponent(id)}`, params);
        return text(task);
      } catch (err) {
        return toolError(`Failed to get task: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  if (canWrite) {
    server.tool(
      "create_task",
      "Create a new Vitally task for an account.",
      {
        accountId: z.string(),
        name: z.string(),
        description: z.string().optional(),
        assignedToId: z.string().optional(),
        dueDate: z.string().optional(),
        categoryId: z.string().optional(),
        externalId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = {
            accountId: params.accountId,
            name: params.name,
          };
          if (params.description !== undefined) body.description = params.description;
          if (params.assignedToId !== undefined) body.assignedToId = params.assignedToId;
          if (params.dueDate !== undefined) body.dueDate = params.dueDate;
          if (params.categoryId !== undefined) body.categoryId = params.categoryId;
          if (params.externalId !== undefined) body.externalId = params.externalId;
          if (params.tags !== undefined) body.tags = params.tags;
          if (params.traits !== undefined) body.traits = params.traits;

          const result = await client.post("/tasks", body);
          return text(result);
        } catch (err) {
          return toolError(`Failed to create task: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "update_task",
      "Update an existing Vitally task.",
      {
        id: z.string(),
        source: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        assignedToId: z.string().optional(),
        completedById: z.string().optional(),
        completedAt: z.string().optional(),
        dueDate: z.string().optional(),
        categoryId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = {};
          if (params.name !== undefined) body.name = params.name;
          if (params.description !== undefined) body.description = params.description;
          if (params.assignedToId !== undefined) body.assignedToId = params.assignedToId;
          if (params.completedById !== undefined) body.completedById = params.completedById;
          if (params.completedAt !== undefined) body.completedAt = params.completedAt;
          if (params.dueDate !== undefined) body.dueDate = params.dueDate;
          if (params.categoryId !== undefined) body.categoryId = params.categoryId;
          if (params.tags !== undefined) body.tags = params.tags;
          if (params.traits !== undefined) body.traits = params.traits;

          const queryParams: Record<string, string | number | boolean | undefined> = {};
          if (params.source) queryParams.source = params.source;

          const url = `/tasks/${encodeURIComponent(params.id)}`;
          const result = await client.request("PUT", url, { params: queryParams, body });
          return text(result);
        } catch (err) {
          return toolError(`Failed to update task: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "delete_task",
      "Delete a Vitally task by its ID.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        try {
          await client.del(`/tasks/${encodeURIComponent(id)}`);
          return text({ deleted: true, taskId: id });
        } catch (err) {
          return toolError(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
