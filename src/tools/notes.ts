import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerNoteTools(server: McpServer, client: VitallyClient, canWrite: boolean): void {
  server.tool(
    "list_notes",
    "List Vitally notes. Optionally filter by accountId, source, or archived status.",
    {
      accountId: z.string().optional(),
      source: z.string().optional(),
      archived: z.boolean().optional(),
    },
    async ({ accountId, source, archived }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (source) params.source = source;
        if (archived !== undefined) params.archived = archived;

        const path = accountId
          ? `/accounts/${encodeURIComponent(accountId)}/notes`
          : "/notes";

        const notes = await client.list(path, params);
        return text({ count: notes.length, notes });
      } catch (err) {
        return toolError(`Failed to list notes: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_note",
    "Get a single Vitally note by its ID.",
    {
      id: z.string(),
      source: z.string().optional(),
    },
    async ({ id, source }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (source) params.source = source;
        const note = await client.get(`/notes/${encodeURIComponent(id)}`, params);
        return text(note);
      } catch (err) {
        return toolError(`Failed to get note: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  if (canWrite) {
    server.tool(
      "create_note",
      "Create a new Vitally note for an account.",
      {
        accountId: z.string(),
        note: z.string().describe("Note body in HTML format"),
        noteDate: z.string().describe("ISO 8601 date string"),
        subject: z.string().optional(),
        authorId: z.string().optional(),
        categoryId: z.string().optional(),
        externalId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = {
            accountId: params.accountId,
            note: params.note,
            noteDate: params.noteDate,
          };
          if (params.subject !== undefined) body.subject = params.subject;
          if (params.authorId !== undefined) body.authorId = params.authorId;
          if (params.categoryId !== undefined) body.categoryId = params.categoryId;
          if (params.externalId !== undefined) body.externalId = params.externalId;
          if (params.tags !== undefined) body.tags = params.tags;
          if (params.traits !== undefined) body.traits = params.traits;

          const result = await client.post("/notes", body);
          return text(result);
        } catch (err) {
          return toolError(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "update_note",
      "Update an existing Vitally note.",
      {
        id: z.string(),
        source: z.string().optional(),
        note: z.string().optional(),
        subject: z.string().optional(),
        noteDate: z.string().optional(),
        authorId: z.string().optional(),
        categoryId: z.string().optional(),
        tags: z.array(z.string()).optional(),
        traits: z.record(z.string(), z.unknown()).optional(),
      },
      async (params) => {
        try {
          const body: Record<string, unknown> = {};
          if (params.note !== undefined) body.note = params.note;
          if (params.subject !== undefined) body.subject = params.subject;
          if (params.noteDate !== undefined) body.noteDate = params.noteDate;
          if (params.authorId !== undefined) body.authorId = params.authorId;
          if (params.categoryId !== undefined) body.categoryId = params.categoryId;
          if (params.tags !== undefined) body.tags = params.tags;
          if (params.traits !== undefined) body.traits = params.traits;

          const queryParams: Record<string, string | number | boolean | undefined> = {};
          if (params.source) queryParams.source = params.source;

          const url = `/notes/${encodeURIComponent(params.id)}`;
          const result = await client.request("PUT", url, { params: queryParams, body });
          return text(result);
        } catch (err) {
          return toolError(`Failed to update note: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );

    server.tool(
      "delete_note",
      "Delete a Vitally note by its ID.",
      {
        id: z.string(),
      },
      async ({ id }) => {
        try {
          await client.del(`/notes/${encodeURIComponent(id)}`);
          return text({ deleted: true, noteId: id });
        } catch (err) {
          return toolError(`Failed to delete note: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    );
  }
}
