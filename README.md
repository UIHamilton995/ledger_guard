# LedgerGuard

**A guardrailed, observable, multi-agent audit system for a mock ERP, built in TypeScript.**

LedgerGuard reconciles purchase orders, goods receipts, and invoices (the classic *3-way match*), uses LLM agents to investigate discrepancies, and applies fixes through a deterministic policy layer with human approval. It is a deliberately small system that demonstrates the things production AI engineering is actually judged on: **typed tool calling, bounded agent loops, safety guardrails, human-in-the-loop, tracing, cost tracking, and evals.**

> **Core principle: the LLM proposes, code disposes.**
> Agents never write to the database. They emit validated *proposals*. A deterministic policy engine decides what executes, what needs a human, and what is rejected.

---

## Why this project

| Hiring-manager question | Where LedgerGuard answers it |
|---|---|
| Can you build agents that call tools safely? | Zod-typed, read-only vs. propose-only tool split |
| Can you stop an agent doing something stupid? | Policy engine, risk tiers, approval gates, idempotency |
| Can you debug it at 2 a.m.? | OpenTelemetry traces in Langfuse + a DB audit log |
| How do you know it works? | Seeded eval suite: precision, recall, false-action rate |
| Does it survive prompt injection? | Adversarial test cases in the eval set |
| What does it cost? | Per-run token and cost metrics from traces |

## Architecture

```
            ┌────────────────────────────────────────────┐
            │          Orchestrator (plain TypeScript)     │
            │   deterministic pipeline, not an LLM router  │
            └──────┬───────────────┬──────────────┬────────┘
                   │               │              │
          ┌────────▼───────┐ ┌─────▼────────┐ ┌───▼──────────────┐
          │  Audit Agent   │ │ Resolution   │ │ Policy Engine +  │
          │  (read-only    │ │ Agent        │ │ Executor         │
          │   tools)       │ │ (propose-    │ │ (no LLM, SQL     │
          │  → Findings[]  │ │  only tools) │ │  transactions)   │
          └────────┬───────┘ └─────┬────────┘ └───┬──────────────┘
                   │               │              │
                   └───────┬───────┴──────┬───────┘
                           ▼              ▼
                    SQLite (mock ERP)   audit_log
                           │
                  OpenTelemetry ──► Langfuse (traces, tokens, cost)
```

**Flow:** `Audit Agent` finds and explains discrepancies → `Resolution Agent` drafts proposals → `Policy Engine` classifies risk → low risk auto-applies, high risk waits for human approval → `Executor` applies atomically and logs everything.

## Stack

- **Runtime:** Node.js 22+, TypeScript (strict), ESM
- **Agent layer:** Vercel AI SDK (v7) with `ToolLoopAgent`, Zod tools, structured output
- **Validation:** Zod everywhere (tool inputs, agent outputs, API boundaries)
- **Data:** SQLite via `better-sqlite3` (stands in for the ERP database)
- **Observability:** OpenTelemetry → Langfuse (Arize Phoenix as an alternative)
- **Testing / evals:** Vitest, with a mock model for deterministic tests and a seeded eval dataset for real-model runs
- **Optional:** BullMQ worker (stretch), Mastra port (stretch), MCP server for read-only ERP tools (stretch)

## Quick start

```bash
git clone <your-repo> ledgerguard && cd ledgerguard
npm install
cp .env.example .env        # add model API key + Langfuse keys
npm run db:seed             # creates mock ERP data with planted discrepancies
npm run audit               # runs the full pipeline; prompts for approvals in the terminal
npm run eval                # runs the eval suite and prints the scorecard
npm test                    # deterministic unit tests (no API calls)
```

## What gets detected

| Code | Discrepancy |
|---|---|
| `QTY_MISMATCH` | Invoice quantity differs from goods received |
| `PRICE_MISMATCH` | Invoice unit price differs from PO price |
| `DUPLICATE_INVOICE` | Same PO/amount billed twice |
| `MISSING_RECEIPT` | Invoice exists with no goods receipt |
| `NEGATIVE_STOCK` | Movements drive on-hand below zero |

## Guardrails (summary)

1. **Tool separation:** the Audit Agent has read-only tools; the Resolution Agent can only create proposals.
2. **Schema validation:** every tool input and agent output is a Zod schema; invalid output is retried once, then escalated to a human.
3. **Policy engine:** quantity caps, SKU allow-lists, risk tiers, per-run action limits.
4. **Human approval:** high-risk proposals require explicit approval before execution.
5. **Bounded loops:** explicit step caps and timeouts on every agent.
6. **Idempotency:** every proposal has a key; re-running never double-applies.
7. **Injection resistance:** free-text ERP fields (e.g. invoice memos) are treated as untrusted data and can never expand tool permissions.

## Repository layout

```
ledgerguard/
├── README.md                 project summary (this file)
├── ROADMAP.md                technical depth, build order, decisions
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example              MODEL_ID, API key, Langfuse keys
├── .gitignore                .env, data/*.db, evals/results/
│
├── data/                     local SQLite file (git-ignored)
│
├── src/
│   ├── config/
│   │   ├── env.ts            Zod-validated environment
│   │   └── model.ts          getModel(): the single place the model is chosen
│   ├── domain/
│   │   ├── schema.sql
│   │   ├── seed.ts           planted discrepancies, fixed random seed
│   │   └── repositories/     ERP data access (items, POs, receipts, invoices)
│   ├── tools/
│   │   ├── read/             read-only tools (Audit Agent)
│   │   └── propose/          propose-only tools (Resolution Agent)
│   ├── agents/
│   │   ├── audit.agent.ts
│   │   ├── resolution.agent.ts
│   │   └── prompts/
│   ├── policy/
│   │   ├── engine.ts         decide(proposal, context)
│   │   ├── rules.ts          rules as data
│   │   └── risk.ts
│   ├── executor/
│   │   └── apply.ts          transactional and idempotent
│   ├── orchestrator/
│   │   └── run.ts            deterministic pipeline
│   ├── observability/
│   │   ├── otel.ts           OpenTelemetry to Langfuse
│   │   └── audit-log.ts      DB audit trail
│   └── cli/
│       ├── audit.ts          npm run audit
│       └── approve.ts        human approval prompt
│
├── evals/
│   ├── dataset.json          ground truth + adversarial cases
│   ├── run.ts                npm run eval
│   ├── scorers.ts
│   └── results/              timestamped scorecards (git-ignored)
│
└── tests/                    deterministic, no API calls
    ├── policy.test.ts
    ├── executor.test.ts
    └── tools.test.ts
```

## Status

See [ROADMAP.md](./ROADMAP.md) for the build plan, acceptance criteria per phase, and architecture decisions.

## License

MIT