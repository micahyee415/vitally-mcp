# vitally-mcp-server

> A Model Context Protocol (MCP) server for the [Vitally](https://vitally.io) customer-success platform — 40 tools covering read and write operations — deployed on Google Cloud Run with Google OAuth authentication.

## Overview

`vitally-mcp-server` exposes Vitally's REST API as a set of MCP tools that any MCP-compatible AI client (e.g. Claude) can call directly. It is built with the official `@modelcontextprotocol/sdk`, runs as a stateless HTTP service on Cloud Run, and restricts access to a configurable Google Workspace domain. Write operations are additionally gated by an email allowlist so only nominated users can mutate data.

## MCP Tools

40 tools total: 30 read-only (available to all authenticated users) and 10 write (restricted to `WRITE_ALLOWLIST` members).

### Accounts

| Tool | Type | Description |
|------|------|-------------|
| `list_accounts` | Read | List accounts; filter by status (`active`, `churned`, `activeOrChurned`) |
| `get_account` | Read | Fetch a single account by Vitally ID or externalId |
| `get_account_health_scores` | Read | Retrieve health score breakdown for an account |

### Users

| Tool | Type | Description |
|------|------|-------------|
| `list_users` | Read | List all Vitally users with pagination |
| `get_user` | Read | Fetch a single user by Vitally ID or externalId |
| `search_users` | Read | Search by email, externalId, or emailSubdomain |
| `list_users_for_account` | Read | List users belonging to a specific account |

### Organizations

| Tool | Type | Description |
|------|------|-------------|
| `list_organizations` | Read | List organizations with pagination |
| `get_organization` | Read | Fetch a single organization by Vitally ID or externalId |

### Admins

| Tool | Type | Description |
|------|------|-------------|
| `search_admins` | Read | Look up a CSM or AE by email address |

### Notes

| Tool | Type | Description |
|------|------|-------------|
| `list_notes` | Read | List notes; filter by accountId, source, or archived status |
| `get_note` | Read | Fetch a single note by ID |
| `create_note` | **Write** | Create a note for an account (HTML body, date, optional tags/traits) |
| `update_note` | **Write** | Update an existing note |
| `delete_note` | **Write** | Delete a note by ID |

### Tasks

| Tool | Type | Description |
|------|------|-------------|
| `list_tasks` | Read | List tasks; filter by source or archived status |
| `list_tasks_for_account` | Read | List tasks for a specific account |
| `get_task` | Read | Fetch a single task by ID |
| `create_task` | **Write** | Create a task for an account (name, due date, assignee, tags, traits) |
| `update_task` | **Write** | Update an existing task (name, description, completion, due date) |
| `delete_task` | **Write** | Delete a task by ID |

### Projects

| Tool | Type | Description |
|------|------|-------------|
| `list_projects` | Read | List projects; filter by archived status |
| `list_projects_for_account` | Read | List projects for a specific account |
| `get_project` | Read | Fetch a single project by ID |

### Conversations

| Tool | Type | Description |
|------|------|-------------|
| `list_conversations` | Read | List conversations with pagination |
| `list_conversations_for_account` | Read | List conversations for a specific account |

### Meetings

| Tool | Type | Description |
|------|------|-------------|
| `list_meetings` | Read | List meetings; filter by archived status |
| `list_meetings_for_account` | Read | List meetings for a specific account |
| `get_meeting` | Read | Fetch a single meeting by ID |
| `get_meeting_transcript` | Read | Fetch the speaker-labeled transcript for a meeting |

### NPS

| Tool | Type | Description |
|------|------|-------------|
| `list_nps_responses` | Read | List NPS responses; filter by target (accounts or organization) |
| `list_nps_for_account` | Read | List NPS responses for a specific account |

### Custom Traits

| Tool | Type | Description |
|------|------|-------------|
| `list_custom_traits` | Read | List custom field definitions; filter by model type |
| `update_traits` | **Write** | Update custom traits on any Vitally object type |

### Custom Objects

| Tool | Type | Description |
|------|------|-------------|
| `list_custom_objects` | Read | List all custom object definitions |
| `list_custom_object_instances` | Read | List instances of a custom object |
| `search_custom_object_instances` | Read | Search instances by id, externalId, customerId, or organizationId |
| `create_custom_object_instance` | **Write** | Create a new custom object instance |
| `update_custom_object_instance` | **Write** | Update an existing custom object instance |
| `delete_custom_object_instance` | **Write** | Archive a custom object instance (soft delete — sets `archivedAt`) |

## Architecture

```
MCP client (e.g. Claude)
        │  HTTPS + Bearer token (Google OAuth)
        ▼
  Cloud Run service  (vitally-mcp-server)
  ┌─────────────────────────────────────────────┐
  │  Express HTTP server                         │
  │  ├── /health              — health check     │
  │  ├── /.well-known/...     — OAuth discovery  │
  │  ├── /register            — dynamic client   │
  │  │                          registration     │
  │  └── / and /mcp           — MCP endpoint     │
  │       │                                      │
  │       ├── verifyGoogleToken()                │
  │       │     • SHA-256 token cache (60 s)     │
  │       │     • @ALLOWED_DOMAIN enforcement    │
  │       │                                      │
  │       ├── WRITE_ALLOWLIST check              │
  │       │     • canWrite = email ∈ allowlist   │
  │       │                                      │
  │       └── StreamableHTTP MCP transport       │
  │             • per-request McpServer instance │
  │             • audit log on every tool call   │
  └─────────────────────────────────────────────┘
        │  Basic Auth (API key)
        ▼
  Vitally REST API
  (https://your-subdomain.rest.vitally.io/resources)
```

**Key design decisions:**

- **Stateless per-request server** — a fresh `McpServer` instance is created for each MCP request so write tools are dynamically included or excluded based on the authenticated user's allowlist membership.
- **Google OAuth domain restriction** — every request is validated against Google's tokeninfo endpoint. Only tokens with a verified email at `ALLOWED_DOMAIN` are accepted.
- **Write allowlist** — write tools (`create_*`, `update_*`, `delete_*`, `update_traits`) are only registered when `canWrite` is true, so they are invisible and uncallable for read-only users.
- **Vitally subdomain** — the tenant REST base URL is constructed at startup from `VITALLY_SUBDOMAIN` (default: `your-subdomain`) and authenticates with HTTP Basic Auth (API key as username, empty password).
- **Resilient client** — exponential backoff with jitter on 429/5xx responses, up to 3 retries; 10 s per-request timeout; cursor-based auto-pagination up to 500 results.
- **Rate limiting** — 120 requests/min per user on the MCP endpoint; 30 requests/15 min on `/register`.
- **Deploy** — two-stage Docker build (builder → slim runtime), pushed to GCR, deployed via Cloud Build (`cloudbuild.yaml`).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22 (ESM) |
| Language | TypeScript 5 |
| MCP SDK | `@modelcontextprotocol/sdk` |
| HTTP server | Express 5 |
| Validation | Zod 4 |
| Rate limiting | `express-rate-limit` |
| Auth | Google OAuth 2.0 (tokeninfo) |
| Container | Docker (node:22-slim, multi-stage) |
| CI/CD | Google Cloud Build |
| Hosting | Google Cloud Run |

## Getting Started

### Prerequisites

- Node.js 22+
- A Vitally account with REST API access (Settings > Integrations > REST API)
- A GCP project with a Google OAuth 2.0 Web Application client configured
- (For deploy) Google Cloud SDK and a Cloud Run-enabled GCP project

### Install

```bash
git clone https://github.com/micahyee415/vitally-mcp
cd vitally-mcp
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `VITALLY_API_KEY` | Yes | Vitally REST API key (from Settings > Integrations > REST API) |
| `VITALLY_SUBDOMAIN` | Yes | Your Vitally tenant subdomain (the `your-subdomain` in `your-subdomain.rest.vitally.io`) |
| `GOOGLE_CLIENT_ID` | Yes | GCP OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | GCP OAuth 2.0 client secret |
| `ALLOWED_DOMAIN` | No | Email domain to restrict access to (default: `example.com`) |
| `WRITE_ALLOWLIST` | No | Comma-separated emails with write access. If empty, all write tools are disabled. |
| `PORT` | No | HTTP port (default: `8080`; Cloud Run sets this automatically) |
| `SERVER_URL` | No | Public URL of this service, used for OAuth metadata endpoints |

### Run locally

```bash
npm run build
npm start
```

Or for a quick rebuild-and-run during development:

```bash
npm run dev
```

### Deploy to Cloud Run

```bash
gcloud builds submit --config cloudbuild.yaml --project your-gcp-project .
```

Cloud Build will:
1. Run `npm audit` at `high` severity — fails the build if high/critical CVEs are found.
2. Build and push the Docker image to GCR.
3. Deploy to Cloud Run (`us-central1`, managed, max 1 instance).

After deploy, set environment variables on the Cloud Run service:

```bash
gcloud run services update vitally-mcp \
  --region us-central1 \
  --update-env-vars \
    VITALLY_API_KEY=...,\
    VITALLY_SUBDOMAIN=your-subdomain,\
    GOOGLE_CLIENT_ID=...,\
    GOOGLE_CLIENT_SECRET=...,\
    ALLOWED_DOMAIN=example.com,\
    WRITE_ALLOWLIST=user@example.com,\
    SERVER_URL=https://your-service.example.com
```

## Connecting an MCP Client

Point your MCP client at the Cloud Run service URL:

```
https://your-service.example.com/mcp
```

The server implements [RFC 8414](https://datatracker.ietf.org/doc/html/rfc8414) OAuth authorization server metadata and [RFC 7591](https://datatracker.ietf.org/doc/html/rfc7591) dynamic client registration, so MCP clients that support these standards can auto-discover OAuth settings.

When prompted, authenticate with a Google account in the `ALLOWED_DOMAIN` domain. Write tools will only appear if your email is in `WRITE_ALLOWLIST`.

## Security

- **Authentication** — every request requires a valid Google OAuth bearer token verified against `https://oauth2.googleapis.com/tokeninfo`. Tokens are SHA-256 hashed and cached for up to 60 seconds.
- **Domain restriction** — only `@ALLOWED_DOMAIN` accounts are accepted (HTTP 403 otherwise).
- **Write gating** — write tools are registered only for users in `WRITE_ALLOWLIST`. The tools do not appear in the tool list for read-only users.
- **CORS** — only `https://claude.ai` and `https://api.claude.ai` are accepted as origins.
- **Rate limiting** — 120 req/min per user on MCP endpoint; 30 req/15 min on `/register`.
- **Security headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Cache-Control: no-store` on all responses.
- **Audit logging** — every tool call is logged with user email, tool name, read/write action, duration, and HTTP status code to stderr (Cloud Logging on Cloud Run).
- **Dependency scanning** — `npm audit --audit-level=high` runs as the first Cloud Build step and blocks deployment on high/critical CVEs.
