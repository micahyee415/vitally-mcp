#!/usr/bin/env node

/**
 * Vitally MCP Server
 *
 * Connects Claude to the Vitally REST API via HTTP transport.
 * Deployed to GCP Cloud Run. Restricted to @example.com accounts via Google OAuth.
 *
 * Required env vars:
 *   VITALLY_API_KEY       — from Vitally Settings > Integrations > REST API
 *   GOOGLE_CLIENT_ID      — GCP OAuth 2.0 client ID ("Vitally MCP")
 *   GOOGLE_CLIENT_SECRET  — GCP OAuth 2.0 client secret
 *
 * Optional:
 *   WRITE_ALLOWLIST  — comma-separated @example.com emails with write access
 *   PORT=8080        — HTTP port (Cloud Run sets this automatically)
 *   SERVER_URL       — public URL of this service (for OAuth metadata)
 *   ALLOWED_DOMAIN   — email domain to allow (default: example.com)
 */

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

process.env.DOTENV_CONFIG_QUIET = "true";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "..", ".env");
if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}

import express from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { VitallyClient } from "./vitally-client.js";
import { verifyGoogleToken, extractBearerToken, AuthError } from "./auth.js";
import { logger } from "./logger.js";

// Tool registrations
import { registerAccountTools } from "./tools/accounts.js";
import { registerUserTools } from "./tools/users.js";
import { registerOrganizationTools } from "./tools/organizations.js";
import { registerAdminTools } from "./tools/admins.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerMeetingTools } from "./tools/meetings.js";
import { registerNpsTools } from "./tools/nps.js";
import { registerCustomTraitTools } from "./tools/custom-traits.js";
import { registerCustomObjectTools } from "./tools/custom-objects.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN ?? "example.com";
const SERVER_URL =
  process.env.SERVER_URL ?? `http://localhost:${PORT}`;

const ALLOWED_ORIGINS = ["https://claude.ai", "https://api.claude.ai"];

// Write allowlist
const WRITE_ALLOWLIST = new Set(
  (process.env.WRITE_ALLOWLIST ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

if (WRITE_ALLOWLIST.size === 0) {
  console.error("[vitally-mcp] Write tools disabled — WRITE_ALLOWLIST is empty.");
} else {
  console.error(`[vitally-mcp] Write tools enabled for ${WRITE_ALLOWLIST.size} user(s)`);
}

// ─── Credential check ────────────────────────────────────────────────────────

function checkCredentials(): void {
  const required = [
    "VITALLY_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error(
      `[vitally-mcp] Missing required environment variables: ${missing.join(", ")}`
    );
    process.exit(1);
  }
}

// ─── MCP server factory ─────────────────────────────────────────────────────

function createMcpServer(vitallyClient: VitallyClient, canWrite: boolean): McpServer {
  const server = new McpServer({ name: "vitally-mcp", version: "1.0.0" });

  // Read-only tools (available to all authenticated users)
  registerAccountTools(server, vitallyClient);
  registerUserTools(server, vitallyClient);
  registerOrganizationTools(server, vitallyClient);
  registerAdminTools(server, vitallyClient);
  registerProjectTools(server, vitallyClient);
  registerConversationTools(server, vitallyClient);
  registerMeetingTools(server, vitallyClient);
  registerNpsTools(server, vitallyClient);

  // Read + write tools (write gated by canWrite flag)
  registerNoteTools(server, vitallyClient, canWrite);
  registerTaskTools(server, vitallyClient, canWrite);
  registerCustomTraitTools(server, vitallyClient, canWrite);
  registerCustomObjectTools(server, vitallyClient, canWrite);

  return server;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  checkCredentials();

  const vitallyClient = new VitallyClient(process.env.VITALLY_API_KEY!);

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "32kb" }));

  // Rate limiters
  const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many registration requests. Try again in 15 minutes." },
  });

  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Rate limit exceeded. Try again in a moment." },
  });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "vitally-mcp", version: "1.0.0" });
  });

  // ─── OAuth discovery (RFC 8414) ────────────────────────────────────────────

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json({
      issuer: SERVER_URL,
      authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      token_endpoint: "https://oauth2.googleapis.com/token",
      registration_endpoint: `${SERVER_URL}/register`,
      scopes_supported: ["openid", "email", "profile"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    });
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json({
      resource: SERVER_URL,
      authorization_servers: [SERVER_URL],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
    });
  });

  app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
    res.json({
      resource: `${SERVER_URL}/mcp`,
      authorization_servers: [SERVER_URL],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
    });
  });

  // ─── Dynamic Client Registration (RFC 7591) ───────────────────────────────

  app.post("/register", registerLimiter, (req, res) => {
    const reqOrigin = req.headers.origin;
    if (reqOrigin && !ALLOWED_ORIGINS.includes(reqOrigin)) {
      res.status(403).json({ error: "Registration not permitted from this origin." });
      return;
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      res.status(500).json({ error: "OAuth client credentials not configured on server." });
      return;
    }
    const redirectUris: string[] = (req.body?.redirect_uris ?? []).filter(
      (uri: unknown) => typeof uri === "string" && uri.startsWith("https://")
    );
    console.error("[vitally-mcp] Dynamic client registration", {
      origin: req.headers.origin ?? "unknown",
    });
    res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  // ─── MCP endpoint ─────────────────────────────────────────────────────────

  app.all(["/", "/mcp"], mcpLimiter, async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      const origin = req.headers.origin;
      const allowedOrigin =
        origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id");
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
      res.status(204).end();
      return;
    }

    const startMs = Date.now();

    // 1. Validate Google OAuth token
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer resource_metadata="${SERVER_URL}/.well-known/oauth-protected-resource"`
      );
      res.status(401).json({ error: "Missing Authorization header. Use Bearer <Google OAuth token>." });
      return;
    }

    let userEmail: string;
    try {
      const authResult = await verifyGoogleToken(token, ALLOWED_DOMAIN);
      userEmail = authResult.email;
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(err.statusCode).json({ error: err.message });
        return;
      }
      logger.error("Unexpected auth error", { reason: String(err) });
      res.status(500).json({ error: "Authentication failed." });
      return;
    }

    // 2. CORS
    const origin = req.headers.origin;
    const allowedOrigin =
      origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    // 3. Handle MCP request
    const canWrite = WRITE_ALLOWLIST.has(userEmail.toLowerCase());
    const mcpServer = createMcpServer(vitallyClient, canWrite);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // 4. Audit log
    const tool: string | undefined =
      req.body?.method === "tools/call" ? req.body?.params?.name : req.body?.method;
    logger.info("Tool request completed", {
      userEmail,
      tool,
      action: canWrite ? "READ_WRITE" : "READ_ONLY",
      durationMs: Date.now() - startMs,
      statusCode: res.statusCode,
    });
  });

  // ─── Start server ─────────────────────────────────────────────────────────

  const httpServer = app.listen(PORT, () => {
    console.error(`[vitally-mcp] Server v1.0.0 listening on port ${PORT}`);
    console.error(`[vitally-mcp] Domain: @${ALLOWED_DOMAIN}`);
  });

  process.on("SIGTERM", () => {
    console.error("[vitally-mcp] SIGTERM received — draining...");
    httpServer.close(() => process.exit(0));
  });
}

main().catch((error) => {
  console.error("[vitally-mcp] Fatal error:", error);
  process.exit(1);
});
