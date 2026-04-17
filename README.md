<p align="center">
  <img src="docs/screenshots/logo.png" alt="Claude Usage Dashboard" width="360" />
</p>

<h1 align="center">Claude Usage Dashboard</h1>

<p align="center">
  Local dashboard for visualizing token usage, estimated costs, subscription quotas, and tool patterns from <a href="https://claude.ai/code">Claude Code</a> session logs.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/stack-TanStack_Start-c96442" alt="TanStack Start" />
  <img src="https://img.shields.io/badge/db-SQLite-87867f" alt="SQLite" />
  <img src="https://img.shields.io/badge/style-Tailwind_v4-5e5d59" alt="Tailwind v4" />
  <img src="https://img.shields.io/badge/license-MIT-b0aea5" alt="MIT License" />
</p>

> **Local-only.** The dashboard reads `~/.claude/projects/**/*.jsonl` from your machine — it never reaches out to the Anthropic API and never uploads anything. Costs are **estimated equivalent API costs** (useful even on a Claude Pro/Max subscription as a "what would this have cost on the pay-per-token plan?" gauge).

---

## Highlights

**Cost & quota visibility**
- 17 dashboard pages built around real Claude Code log data
- Subscription tracking for Pay-per-token / Pro / Max 5× / Max 20× / custom plans, including 5-hour and weekly rolling windows
- Burn-rate forecast — "at this pace you'll hit your cap in 2h 15m"
- Cost forecast aligned to your actual billing cycle (configurable cycle start day)
- Monthly budget with warning/exceeded thresholds

**Workflow & analytics**
- Per-tool analytics (Edit / Bash / Read / TodoWrite / …) with attributed cost
- Cost-anomaly detection (z-score outlier sessions)
- Period comparison (current 30d vs prior 30d, etc.)
- Context-window utilization per turn, including a near-limit list
- GitHub-style activity calendar with streak tracking
- Tag system for grouping projects and sessions
- ⌘K command palette for instant nav across pages, projects, sessions, and tags

**Plumbing**
- Auto-sync via chokidar + long-poll — UI updates within a second of a new turn
- Outbound webhooks (Slack/Discord/anything HTTP) when budgets, subscription quotas, or anomalies cross thresholds
- PDF / CSV / JSON export and full database backup/restore
- 23 vitest unit tests; strict-mode TypeScript with zero errors

---

## Screenshots

> Older screenshots in `docs/screenshots/` predate the recent feature additions; new ones are on the way.

| Page | What it shows |
| --- | --- |
| `/` Overview | KPI cards, daily cost trend, daily token mix, top projects, recent sessions |
| `/daily` | One row per day: models used, input/output/cache breakdown, cost |
| `/calendar` | Year-at-a-glance heatmap with current/longest streak |
| `/subscription` | Pro/Max gauges, burn rate, when you'll hit the cap |
| `/forecast` | Spent / projected / vs last month, daily chart with projection bars |
| `/activity` | Day × hour heatmap of activity |
| `/projects` and `/projects/$id` | Project list + per-project model/sessions/cost trend |
| `/sessions` and `/sessions/$id` | Session list + message timeline + cumulative cost |
| `/efficiency` | CLI vs VSCode comparison, cost-vs-messages scatter, cost/msg ranking |
| `/models` | Per-model breakdown and daily cost-by-model trend |
| `/tools` | Top tools by call count, attributed cost, daily volume |
| `/anomalies` | Outlier sessions (cost > mean + 2σ) |
| `/what-if` | "What if everything was Sonnet 4.6?" full pricing matrix |
| `/cache-analysis` | Hit rate, savings vs overhead, ROI, per-model + per-project |
| `/context` | Per-turn context fill against each model's max window |
| `/compare` | Current N-day window vs prior N-day window, side-by-side |
| `/tags` | Manage tag catalog, then attach to projects/sessions |
| `/webhooks` | Add HTTP receivers + view delivery log |
| `/settings` | Plan picker, budget, billing cycle, sidechain toggle, backup/restore |

---

## Quick start

```bash
# 1. Install — pnpm 10+, Node 20+
pnpm install

# 2. Pull existing logs into the local SQLite cache
pnpm sync

# 3. Run the dashboard
pnpm dev    # http://localhost:3000
```

The dashboard auto-syncs as new log lines arrive (a chokidar watcher streams change events to the client via long poll). You only need to re-run `pnpm sync` if you wipe `data/cache.db`.

### Other scripts

```bash
pnpm build          # Production bundle
pnpm start          # Run the production server (after build)
pnpm test           # Vitest run (23 tests)
pnpm test:watch     # Vitest watch
pnpm exec tsc --noEmit --ignoreDeprecations 6.0   # Type check
pnpm db:generate    # drizzle-kit generate (only needed on schema changes)
```

---

## Architecture

```
~/.claude/projects/**/*.jsonl
        ↓ (chokidar watcher)
   reader.ts (byte-level CRLF-safe stream)
        ↓
   parser.ts (Zod-validated, extracts messages + tool_uses)
        ↓
   SQLite (better-sqlite3 + Drizzle ORM, data/cache.db)
        ↓
   ~13 server-function endpoints (TanStack Start RPC)
        ↓
   17 React routes + cmd+K palette + auto-sync
        ↓
   Outbound: PDF / CSV / JSON / DB dump / webhooks
```

### Layout

```
src/
├── lib/                pricing, format helpers, subscription plans, theme
├── types/              shared response types (re-export of server return shapes)
├── hooks/              one TanStack Query hook per server function
├── components/         ui/ primitives + cards/ + charts/ + tables/ + feature widgets
├── routes/             file-based TanStack Router pages
├── server/
│   ├── claude-logs/    paths discovery, byte-stream reader, parser, chokidar watcher
│   ├── db/             Drizzle schema, client, app-settings KV, query filters
│   ├── functions/      one file per RPC endpoint (~25)
│   ├── pdf/            PDFKit report builder (dynamic-imported)
│   ├── export/         CSV encoder (RFC-4180)
│   └── webhooks/       event catalogue, dispatcher, post-sync triggers
├── tests/              vitest fixtures + tests for parser/reader/pricing/billing
└── styles/             Tailwind v4 + warm parchment design tokens
```

### Database

| Table | Purpose |
| --- | --- |
| `projects` | One row per `~/.claude/projects/*` folder |
| `sessions` | One per `.jsonl` plus orphan rows for inlined subagent sessions |
| `messages` | Token counts, cost, stop reason, isSidechain |
| `tool_uses` | Per-tool-call row joined to a parent message |
| `tags`, `entity_tags` | User labels attached to projects/sessions |
| `webhooks`, `webhook_deliveries`, `webhook_state` | Outbound HTTP notifications + their per-event watermarks |
| `sync_state` | KV store: `lastSyncAt`, `setting:*` (budget, plan, cycle, sidechain) |

A versioned JSON dump of every table is exposed via `/settings → Backup` for moving between machines.

---

## Subscription & pricing notes

The `claude-opus-4-7` model and Pro/Max plan limits are best-effort estimates derived from public Anthropic guidance. To refresh:

1. Update `src/lib/pricing.ts` — `MODEL_FAMILY`, `PRICING`, `MODEL_CONTEXT_WINDOW` and bump `PRICING_LAST_VERIFIED`.
2. Update `src/lib/subscription.ts` — `SUBSCRIPTION_PLANS` 5-hour and weekly token caps.

Unknown models trigger a banner on `/settings` and the overview page so you know when the table is stale.

---

## Webhook payloads

POST body (`application/json`):

```json
{
  "event": "subscription.warning",
  "emittedAt": "2026-04-16T22:14:00.123Z",
  "data": {
    "plan": "max5",
    "window": "subscription:5h",
    "label": "Last 5 hours",
    "windowHours": 5,
    "inputTokens": 800000,
    "outputTokens": 1900000,
    "utilizationPercent": 0.84,
    "capReachedAt": "2026-04-16T23:01:00.000Z"
  }
}
```

If the webhook has a signing secret the request includes:
- `X-Claude-Usage-Event: subscription.warning`
- `X-Claude-Usage-Signature: sha256=<hmac of body>`

Watermarks make events fire only on transitions (`ok → warning`, `warning → exceeded`), not on every sync while the level is unchanged. The `sync.completed` event ignores the watermark and fires on every sync — leave it off unless you really want that volume.

---

## License

MIT
