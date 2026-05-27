# Changelog

## [1.0.1] - 2026-05-15

### Security

- Patch `fast-uri` ReDoS vulnerability via `npm audit fix` (GHSA-cc4q-3qf2-7vrm)

### Documentation

- Add project documentation and inline code comments


## [1.0.0] - 2026-04-16

### Added
- Initial release: 40 MCP tools (30 read, 10 write) for Vitally REST API
- Google OAuth authentication (@example.com only)
- WRITE_ALLOWLIST gating for write operations (Notes, Tasks, Custom Objects, Custom Traits)
- Rate limiting: 120 req/min per user, 30 req/15min on /register
- Audit logging for all tool calls
- Cursor-based auto-pagination (up to 500 results)
- Exponential backoff with jitter on 429/5xx responses
- Health check endpoint
