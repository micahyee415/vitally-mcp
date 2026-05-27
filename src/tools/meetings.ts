import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { VitallyClient } from "../vitally-client.js";

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

export function registerMeetingTools(server: McpServer, client: VitallyClient): void {
  server.tool(
    "list_meetings",
    "List Vitally meetings with optional archived filter and pagination.",
    {
      archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ archived, limit }) => {
      try {
        const params: Record<string, string | number | boolean | undefined> = {};
        if (archived !== undefined) params.archived = archived;
        if (limit) params.limit = limit;
        const meetings = await client.list("/meetings", params);
        return text({ count: meetings.length, meetings });
      } catch (err) {
        return toolError(`Failed to list meetings: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "list_meetings_for_account",
    "List all Vitally meetings for a specific account.",
    {
      accountId: z.string(),
    },
    async ({ accountId }) => {
      try {
        const meetings = await client.list(`/accounts/${encodeURIComponent(accountId)}/meetings`);
        return text({ count: meetings.length, meetings });
      } catch (err) {
        return toolError(`Failed to list meetings for account: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_meeting",
    "Get a single Vitally meeting by its ID.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const meeting = await client.get(`/meetings/${encodeURIComponent(id)}`);
        return text(meeting);
      } catch (err) {
        return toolError(`Failed to get meeting: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );

  server.tool(
    "get_meeting_transcript",
    "Get the transcript for a Vitally meeting. Returns speaker-labeled sentences with timestamps.",
    {
      id: z.string(),
    },
    async ({ id }) => {
      try {
        const transcript = await client.get(`/meetings/${encodeURIComponent(id)}/transcript`);
        return text(transcript);
      } catch (err) {
        return toolError(`Failed to get meeting transcript: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  );
}
