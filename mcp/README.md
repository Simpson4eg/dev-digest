# @devdigest/mcp

A local **stdio MCP server** that gives an AI agent five DevDigest tools for
running and reading pull-request reviews. It is a thin client over the DevDigest
API (`@devdigest/api`), so the API must be running.

## Tools

| Tool | What it does |
|------|--------------|
| `list_agents` | List the review agents configured in your workspace (get a valid `agent` id). |
| `run_agent_on_pr` | Run one agent on a PR and return the findings. Waits for the run; if it is still going at timeout, returns `{status:"running", run_id}`. **Only tool that writes.** |
| `get_findings` | Concise verdict + score + severity breakdown for a PR already reviewed (`detail:true` for the full list). |
| `get_conventions` | The repo's extracted coding conventions, grouped by status and category. |
| `get_blast_radius` | *Stub* — returns an error; will map a PR's impacted files later. |

All tools take flat arguments: `repo` as `"owner/name"`, `pr` as a number,
`agent` as an id from `list_agents`.

## Setup

```sh
cd mcp
npm install
npm run build          # → dist/server.js
```

Make sure the DevDigest API is up first:

```sh
./scripts/dev.sh       # from the repo root — Postgres + API (:3001) + web
```

## Configuration (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API. |
| `DEVDIGEST_RUN_TIMEOUT_MS` | `50000` | How long `run_agent_on_pr` waits before the `running` fallback. **Keep it below your MCP client's tool-call timeout** (often ~60s). |
| `DEVDIGEST_POLL_INTERVAL_MS` | `2000` | Poll cadence while waiting for a run. |
| `DEVDIGEST_REQUEST_TIMEOUT_MS` | `15000` | Per-request HTTP timeout. |
| `DEVDIGEST_API_TOKEN` | — | Optional `Authorization: Bearer` token (not needed in the local no-auth MVP). |

## Register with Claude Code

Add it to a `.mcp.json` (project or user scope):

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "node",
      "args": ["C:\\Users\\you\\dev-digest\\mcp\\dist\\server.js"],
      "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }
    }
  }
}
```

or via the CLI:

```sh
claude mcp add devdigest -- node /abs/path/to/dev-digest/mcp/dist/server.js
```

During development you can point the command at `npx tsx src/server.ts` instead
of the built file.

## Develop

```sh
npm run dev            # tsx watch
npm test               # Vitest — tools tested against a mocked API port
npm run typecheck
```

See `AGENTS.md` for the architecture (onion layering, design rules).
