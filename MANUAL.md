# LedgerGuard Manual

A step-by-step delivery guide and a mastery course in one. Follow it in order and you will always know what to do next. Finish it and you will be able to explain, defend, and extend every file in this project.

Companion files: `README.md` (what the project is), `ROADMAP.md` (technical decisions and acceptance criteria). This manual is the *how and why, in order*.

---

## 0. How to use this manual

**The rule of the manual:** never start a step without reading its *Why* and *Concepts*, and never leave a step without answering its *Checkpoint questions* out loud (or in writing) without looking. If you cannot answer, you have not finished the step, even if the tests pass.

**Every step has the same anatomy**

| Block | Purpose |
|---|---|
| Why this step exists | The system-design reason. Skipping this is how you end up with code you cannot defend. |
| Concepts to master | The ideas underneath the work. Learn these from docs and experiments, not from copying. |
| Build | What to create, which files it touches. No code here; you write it. |
| Decisions you must make | Choices with trade-offs. Write your answer in `DECISIONS.md` (see below). |
| Safety lens | What can go wrong and which defense this step contributes. |
| Run and observe | Commands to run and what "good" looks like. |
| Break it on purpose | Experiments that teach more than success does. |
| Checkpoint questions | Your mastery gate. |
| Done when | Objective exit criteria. |
| Next | The next step, so you are never stuck choosing. |

**Keep three living files in the repo root**

1. `DECISIONS.md`: one short entry per decision (context, options, choice, trade-off). Interviewers love this and it forces clarity.
2. `LEARNING-LOG.md`: three lines per work session: what I built, what surprised me, what I still do not understand.
3. `EXPERIMENTS.md`: results of every "Break it on purpose" experiment with numbers (tokens, latency, pass rates).

**Pacing, honestly.** The roadmap budgets 2 focused days for the MVP if you already understand everything. Because this manual also builds understanding, expect **roughly 3 to 5 days** for Steps 1 to 11 (about 25 to 35 focused hours). Phase 2 (RAG) is about 1.5 to 2 days. Phase 3 (deployment) is about 1.5 to 2 days. Do not compress the checkpoint questions to save time; they are the point.

**The "I am stuck" protocol** (use it before asking anyone)

1. Write one sentence: "I expected X, I got Y."
2. Find the layer: data (seed/repository), tool (schema/execution), agent (prompt/loop), policy, executor, or infrastructure (env/network/quota).
3. Reproduce with the smallest input: one PO, one tool call, no agent.
4. Look at the trace (once Step 4 exists) or the audit log before changing any code.
5. Change one thing. Re-run. Log the result in `LEARNING-LOG.md`.

---

## 1. The system in one page (your mental model)

### 1.1 What LedgerGuard is

A mock ERP holds purchase orders (what we ordered), goods receipts (what arrived), and invoices (what suppliers bill). In the real world the three must agree: this is the **three-way match**. When they do not, money leaks or stock records drift. LedgerGuard uses LLM agents to *investigate* mismatches and *propose* fixes, and uses ordinary deterministic code to *decide* and *execute* them.

### 1.2 The one principle that governs every design choice

> **The model proposes. Code disposes.**

An LLM is a probabilistic text generator. It is excellent at reading messy evidence and explaining it, and unreliable as an authority over money or inventory. So authority lives in code you can test, and the model gets only as much power as you can afford to have misused.

### 1.3 The data and control flow

```
                         TRUST BOUNDARY (untrusted text enters here)
                                      |
  Supplier invoice memo --------------+---> [ read tools ] ---> Audit Agent
                                                                    |
                                                    structured findings (validated)
                                                                    |
                                                          evidence verification (code)
                                                                    |
                                                            Resolution Agent
                                                                    |
                                                  proposals (rows, status = pending)
                                                                    |
                                           Policy Engine (deterministic verdict)
                                          /               |                \
                                 auto_approve        needs_human          reject
                                      |                    |
                                      |             Approver (human)
                                      \                    /
                                          Executor (transaction + idempotency)
                                                    |
                                       ERP tables + audit_log
                                                    |
                                  Traces (OpenTelemetry -> Langfuse)
```

### 1.4 Four ideas you will use for the rest of your career

1. **Trust boundaries.** Anything a model reads that a stranger could have written (an invoice memo, a web page, a retrieved document) is *untrusted data*, not instructions. Safety is mostly about where untrusted text can reach powerful tools.
2. **Least privilege per agent.** The Audit Agent can only read. The Resolution Agent can only create proposals. Neither can write to ERP tables. Privilege is assigned by *which tools exist*, not by asking the model to behave.
3. **Defense in depth.** No single control is trusted: schema validation, evidence checks, policy engine, human approval, idempotency, audit log, rate limits. An attack must beat all of them.
4. **Measure, do not feel.** An agent "that seems to work" is a demo. An agent with a scorecard (recall, precision, false-action rate, injection success rate) is engineering.

---

## 2. Repository map: what every folder and file is for

Learn this table until you can redraw it from memory. For each entry you should be able to say *what it is*, *who uses it*, and *what breaks if it is deleted*.

### 2.1 Root files

| File | Purpose | Why it exists |
|---|---|---|
| `README.md` | Project summary for a stranger (30-second read). | First thing an interviewer sees. |
| `ROADMAP.md` | Technical blueprint, acceptance criteria, ADRs. | Your design record. |
| `MANUAL.md` | This guide. | Keeps you moving and learning. |
| `DECISIONS.md` | Your decision log. | Proves you reasoned, not just typed. |
| `package.json` | Declares the project, its scripts, and dependencies. `"type": "module"` makes files ES modules. The `scripts` block is your command menu. | Without it nothing installs or runs. |
| `package-lock.json` | Exact resolved dependency versions (created by `npm install`). Commit it. | Reproducible builds; supply-chain stability. |
| `tsconfig.json` | TypeScript rules. `strict` and `noUncheckedIndexedAccess` make the compiler catch whole classes of bugs. `NodeNext` modules are why imports end in `.js`. | Type safety is a safety control, not decoration. |
| `vitest.config.ts` | Tells the test runner where tests live. | Tests are your regression net. |
| `.env.example` | The *template* of configuration: names only, no secrets. Committed. | Documents required configuration. |
| `.env` | Your real secrets and settings. **Never committed** (git-ignored). | Keeps keys out of git history. |
| `.gitignore` | Lists what git must not track: `.env`, `node_modules`, database files, eval results. | Prevents secret and clutter leaks. |

### 2.2 `src/config/`: configuration and model choice

| File | Purpose |
|---|---|
| `env.ts` | Parses environment variables through a Zod schema so misconfiguration fails loudly at startup instead of mysteriously mid-run. Lazy on purpose: seeding and tests must not require a model key. |
| `model.ts` | `getModel()`: the *only* place a model provider and id are chosen. Swapping Gemini for a local LM Studio model is an environment change, not a code change. This is the "no vendor lock-in" seam. |

### 2.3 `src/domain/`: the mock ERP

| File | Purpose |
|---|---|
| `schema.sql` | The database shape. Tables: `items`, `purchase_orders`, `goods_receipts`, `invoices`, `stock_movements`, plus two *control-plane* tables, `proposals` and `audit_log`. Note `CHECK` constraints: the database itself rejects nonsense, a safety layer below your code. |
| `db.ts` | Opens the database (with an optional **read-only** handle) and applies the schema. Read-only handles mean even a bug in a read tool cannot write. |
| `seed.ts` | Generates 40 purchase orders deterministically from a seed number: 12 planted discrepancies, 26 clean POs, 2 clean POs with prompt-injection memos. Returns the *ground truth*. Determinism is what makes evals reproducible. |
| `repositories/index.ts` | Read-only data-access functions (`getPurchaseOrder`, `getInvoices`, ...). The only layer that writes SQL for reads. Tools call repositories; agents never see SQL. |

### 2.4 `src/tools/`: what the agents are allowed to do

| Folder | Purpose |
|---|---|
| `read/` | Read-only tools for the Audit Agent. Each tool = name + description (written *for the model*) + Zod input schema + execute function. The schema is a guardrail: malformed or hostile input is rejected before any code runs. Supplier memos are returned as `memoUntrusted`. |
| `propose/` (empty now) | Propose-only tools for the Resolution Agent (Step 7). They insert `proposals` rows and nothing else. |

### 2.5 Folders that are empty now and what they will hold

| Folder | Will hold | Built in |
|---|---|---|
| `src/agents/` and `prompts/` | Agent definitions and their instructions as separate, reviewable text. | Steps 3, 7 |
| `src/policy/` | The deterministic decision engine and its rules-as-data. | Step 6 |
| `src/executor/` | The only code that mutates ERP tables. | Step 8 |
| `src/orchestrator/` | The fixed pipeline wiring everything. | Step 9 |
| `src/observability/` | OpenTelemetry setup and the database audit-log writer. | Step 4 |
| `src/cli/` | Thin command entry points. `seed.ts` exists; `audit.ts` and `approve.ts` come later. A CLI parses arguments, builds dependencies, calls the core. It contains no business logic. | Steps 1, 9 |
| `evals/` | `ground-truth.json` (exists), the eval dataset, runner, scorers, `fixtures/` (recorded model responses), `results/` (scorecards). | Step 5, 10 |
| `tests/` | Deterministic tests that never call a model. | Throughout |
| `data/` | The local SQLite file. Git-ignored. | Step 1 |

### 2.6 Tests that exist now

| File | What it proves |
|---|---|
| `tests/helpers.ts` | Builds a fresh in-memory seeded database for each test file. |
| `tests/seed.test.ts` | The seed produces exactly the planned mix, is deterministic, and each planted discrepancy is genuinely present in the data. |
| `tests/repositories.test.ts` | Pagination, null-for-missing, ordering. |
| `tests/tools.test.ts` | The read-tool set is exactly the expected names, none suggests a write, and malformed input is rejected at the schema boundary. |

---

## 3. Command glossary

You should know what each command does *and what to look at in its output*.

| Command | What it does | What good looks like |
|---|---|---|
| `npm install <packages>` | Downloads dependencies into `node_modules/` and records them in `package.json` and `package-lock.json`. | No errors; lock file appears. If a native module (`better-sqlite3`) fails to build, read the error: it is usually a Node-version or build-tool issue. |
| `npm install -D <packages>` | Same, but as development-only dependencies (compiler, test runner, type definitions). | Listed under `devDependencies`. |
| `npm run <script>` | Runs a script from `package.json`. | Scripts are your project's public interface. |
| `npm run db:seed` | Deletes and rebuilds the local database and rewrites `evals/ground-truth.json`. | A count summary: 28 CLEAN, 3 QTY, 3 PRICE, 2 DUPLICATE, 2 MISSING, 2 NEGATIVE, 2 injections. Safe to re-run any time. |
| `npm test` | Runs every test once. | All green, no network calls. Slow tests mean something is wrong. |
| `npm run typecheck` | Runs the TypeScript compiler without producing output. | Zero errors. Treat errors as design feedback. |
| `npx tsx <file>` | Runs a TypeScript file directly (used by scripts). | Handy for one-off experiments. |
| `git status`, `git diff`, `git add -p`, `git commit` | Track and review changes. | Commit after every checkpoint with a message explaining *why*. |
| `docker build`, `docker run` | Build and run the container (Step 18). | Image builds; app responds on its port. |

**Environment variables you will meet** (all documented in `.env.example`): `MODEL_PROVIDER`, `MODEL_ID`, `GOOGLE_GENERATIVE_AI_API_KEY`, `LMSTUDIO_BASE_URL`, `DB_PATH`, and the Langfuse keys.

---

## 4. Progress tracker

Update this table as you go. Markers: **CLEARED** (done and checkpoint passed), **YOU ARE HERE**, **PARTIAL**, **NOT MET**.

| Step | Name | Status |
|---|---|---|
| 1 | Verify and master the foundation | YOU ARE HERE |
| 2 | Inference engineering primer and the model wrapper | NOT MET |
| 3 | The Audit Agent | NOT MET |
| 4 | Observability: traces and the audit log | NOT MET |
| 5 | Eval harness v0 and record/replay | NOT MET |
| 6 | The policy engine | NOT MET |
| 7 | The Resolution Agent and proposals | NOT MET |
| 8 | The executor and human approval | NOT MET |
| 9 | Orchestrator and CLI wiring | NOT MET |
| 10 | Adversarial evals and red-teaming | NOT MET |
| 11 | MVP hardening, docs, demo (MVP gate) | NOT MET |
| 12 | Knowledge base design | NOT MET |
| 13 | Ingest and index | NOT MET |
| 14 | Hybrid retrieval and retrieval evals | NOT MET |
| 15 | Grounded answers and citation safety | NOT MET |
| 16 | "Ask LedgerGuard" and the `searchPolicy` tool | NOT MET |
| 17 | HTTP API and minimal UI | NOT MET |
| 18 | Containerise | NOT MET |
| 19 | Demo safety: modes, limits, auth | NOT MET |
| 20 | Deploy, CI, monitoring | NOT MET |
| 21 | Portfolio packaging and interview readiness | NOT MET |

---

# PART I: FOUNDATIONS

## Step 1: Verify and master the foundation

**Time:** 2 to 3 hours. **Files touched:** none new; you read everything.

### Why this step exists
The scaffold was generated for you. Code you did not write is code you do not yet understand, and everything downstream rests on it. Also, parts of it were not type-checked on a machine with the real dependencies, so this step is where reality corrects the scaffold.

### Concepts to master
- **Deterministic seeding.** A pseudo-random generator given the same seed produces the same sequence. Evals are only comparable across days if the data never changes under them.
- **Ground truth.** A labelled answer key independent of the system under test. Without it you cannot compute precision or recall.
- **Schema as a control.** `CHECK` constraints, foreign keys, and `NOT NULL` are the database refusing invalid states regardless of application bugs.
- **Repository pattern.** Isolating data access behind functions so the storage engine can change (SQLite now, Postgres later) without touching agents.
- **Schema-validated tool inputs.** A tool's input schema is the contract between a probabilistic caller and your deterministic code.
- **Read-only handle.** A database connection opened in read-only mode enforces privilege at the driver level.

### Build
1. Install dependencies, create `.env` from `.env.example` (leave the model fields empty for now), run the seed, run tests, run the type checker.
2. Fix whatever the type checker and test runner report. Typical causes: a renamed export in the AI SDK (check the current docs for `tool` and `inputSchema`), a missing type package, an import missing its `.js` suffix.
3. Open the generated database with any SQLite viewer and read the tables with your own eyes.
4. Open `evals/ground-truth.json` and pick three POs. For each, trace by hand: PO, receipts, invoices, stock. Confirm the label is right *before* you trust any agent to find it.

### Decisions you must make
- Where will the database file live and why is it git-ignored?
- Why do read tools return `memoUntrusted` instead of `memo`? (Write your answer in `DECISIONS.md`.)

### Safety lens
This step plants the first two defenses: schema-level validity and least privilege (read-only repositories). It also creates the **attack surface on purpose**: two invoices whose memos contain injection text. Find them in the database now so you know exactly what the agent will be tested against.

### Run and observe
- `npm run db:seed` then `npm test` then `npm run typecheck`.
- Look for: the seed summary counts; every test green; zero type errors.

### Break it on purpose
1. Change the seed number in the seed command, re-seed, and compare ground truth files. Which POs moved?
2. Edit one invoice by hand to create a *new* mismatch and see that the ground truth does not know about it. This is why ground truth is generated alongside data, not inferred from it.
3. Try to write to the database through a read-only handle and read the error.

### Checkpoint questions
1. What is the three-way match and why do the three documents disagree in practice?
2. Why is determinism required for evals?
3. Why does a tool have a Zod schema if the model already "knows" the parameters?
4. What is the difference between a repository and a tool?
5. Where in this repo could untrusted text enter an agent's context?

### Done when
Tests and type check pass; you completed the hand-trace of three POs; `DECISIONS.md` and `LEARNING-LOG.md` exist.

### Next
Step 2.

---

## Step 2: Inference engineering primer and the model wrapper

**Time:** 3 to 4 hours. **Files touched:** `src/config/model.ts` (review), a new model-call wrapper (suggested home: `src/config/` or `src/lib/`), `EXPERIMENTS.md`.

### Why this step exists
Every agent is a loop around model calls. If you do not understand what one call costs, how long it takes, how it fails, and how to bound it, you cannot design the loop. This is also where you make the project *zero-cost safe* before you write a single agent.

### Concepts to master
**What a call actually is**
- **Tokens.** Models read and write tokens, not characters. Input tokens (prompt, tool definitions, tool results, history) and output tokens are priced and limited separately. Tool schemas and long tool results consume input tokens *on every step of the loop*.
- **Context window.** The hard ceiling on tokens per call. In an agent loop the history grows each step, so cost and latency grow faster than linearly with steps.
- **Sampling controls.** Temperature and top-p shape randomness. Low temperature reduces variance but does **not** guarantee identical outputs across runs, so evals must tolerate noise (run multiple times, report rates, not single results).
- **Structured output.** Two families: *prompt-and-parse* (ask for JSON, hope) and *constrained or schema-guided generation* (the provider or SDK enforces the schema). Always validate afterwards with Zod regardless, because validity of shape is not validity of meaning.
- **Tool calling protocol.** The model never executes anything. It emits a *request* to call tool X with arguments Y. Your code validates, runs it, and sends the result back as a new message. The loop ends when the model stops requesting tools or a limit is hit.

**What makes inference slow or expensive**
- **Latency anatomy:** network and queueing, time to first token, decode speed (tokens per second), and your own tool latency. An agent run's latency is roughly *steps x (call latency + tool latency)*, so cutting steps beats micro-optimising prompts.
- **Cost anatomy:** input tokens + output tokens, multiplied per step. On the free tier you pay in *quota* instead of money; treat quota as the currency and track "shadow cost" (what the run would cost at paid rates).
- **Prompt caching (conceptual).** Providers may reuse work for repeated prompt prefixes. Stable instructions placed first and variable content last is the general shape. Check your provider's docs for specifics.
- **Local inference (LM Studio).** Local models run quantized (reduced numeric precision) to fit memory. Smaller and more aggressively quantized models are faster and cheaper and noticeably worse at following schemas and calling tools. Your free fallback is real but weaker; know why.

**Reliability engineering for calls**
- **Rate limits** come in forms such as requests per minute, tokens per minute, requests per day. A `429` is a normal event, not an error to crash on.
- **Retries with exponential backoff and jitter.** Wait longer after each failure and add randomness so concurrent callers do not retry in lockstep.
- **Timeouts.** Every call needs one. A hung call that holds your pipeline is a production incident.
- **Idempotency of retries.** Retrying a *read-only* model call is safe. Retrying a step that already wrote to the database is not. This is why agents propose and an executor (with idempotency keys) acts.
- **Failure taxonomy of an agent loop:** invalid JSON, hallucinated tool name, schema-violating arguments, infinite tool-call loops, truncated output (hit max tokens), refusal, empty response. Each needs a defined behavior (retry once, escalate to human, or fail the run) decided in advance.

### Build
1. Fill in `.env`: choose a provider, a model id (check Google AI Studio for the current free Flash or Flash-Lite id, or the identifier shown in LM Studio), and your key. Never attach billing to the key's project.
2. Make the *simplest possible* call through `getModel()` and print the response plus token usage. This is a throwaway script, not part of the product.
3. Create the single **call wrapper** every agent will go through. Requirements, not code: concurrency of one, a minimum delay between calls, exponential backoff with jitter on rate-limit errors, a hard timeout, a cap on retries, and a counter of calls and tokens used per run.
4. Decide and document how the wrapper surfaces "quota exhausted" to the rest of the system (a typed error the orchestrator can catch and turn into a clean, resumable stop).

### Decisions you must make
- Maximum steps per agent run and why (start around 8 to 12).
- Timeout per call and per run.
- What happens when the quota is gone mid-run: abort, partial results, or switch to replay?

### Safety lens
This step contributes **denial-of-wallet protection**: without call limits, a looping agent or an attacker can exhaust your quota (or, in a paid world, your money). Hard budgets per run are a safety control.

### Run and observe
- Run your throwaway call with two different models if you can (a free Flash-Lite and a larger Flash, or Gemini and LM Studio). Record in `EXPERIMENTS.md`: latency, input tokens, output tokens, quality of the answer to the same small question.
- Deliberately send a long prompt and watch input tokens and latency rise.

### Break it on purpose
1. Set the key to garbage and read the error your wrapper produces. Is it understandable at 2 a.m.?
2. Fire ten calls rapidly *without* the wrapper and watch the rate limit appear; then with it.
3. Ask the model for JSON with no schema enforcement three times at moderate temperature. Count how many are valid. This number motivates structured output.

### Checkpoint questions
1. Why does an agent run cost more than the sum of its first call repeated?
2. What does a model "do" when it calls a tool?
3. Why is retrying a model call safe but retrying a database write not?
4. Why can't low temperature be treated as determinism?
5. What are three ways a loop can fail that a single call cannot?

### Done when
The wrapper exists, is the only path to the model, enforces limits, and your `EXPERIMENTS.md` has real latency and token numbers.

### Next
Step 3.

---

# PART II: THE MVP

## Step 3: The Audit Agent

**Time:** 4 to 5 hours. **Files touched:** `src/agents/audit.agent.ts`, `src/agents/prompts/` (audit instructions), a findings schema (suggested: alongside the agent), a verification function, tests.

### Why this step exists
This is the first place an LLM does real work, and the first place you design for its failure. It is read-only by construction, so mistakes here cost you *wrong findings*, never *wrong ledger entries*. That is exactly why the Audit Agent comes before anything that can act.

### Concepts to master
- **The agent loop.** An agent is a model in a bounded loop: model decides, your code runs tools, results return, repeat until done or capped. The SDK's agent abstraction is a convenience around this; you should be able to describe the loop without it.
- **Instructions vs data.** The system instructions state the job and the rules. Tool results are *data*. A hostile string inside data must never gain instruction authority. Your prompt must say so explicitly, **and** you must not rely on the prompt alone.
- **Structured findings.** The agent's final answer is a typed report: for each PO, a discrepancy type from a closed list, severity, evidence, confidence, suggested action. Closed enumerations (not free text) make results measurable.
- **Evidence-grounded output.** A finding is only trusted if every piece of evidence refers to a record that really exists and really says that. Models fabricate plausible evidence; code checks it.
- **Step budget.** A cap on loop iterations bounds cost and prevents runaway behavior.
- **Prompt design as system design.** Role, task, allowed discrepancy definitions (precise, with the arithmetic that defines each), output contract, and what to do when unsure (report low confidence or escalate, never guess).

### Build
1. Define the finding and report schemas first, before the prompt. The schema is the spec.
2. Write the agent instructions as a separate text artifact. Include: the five discrepancy definitions, instruction to verify claims with tools, instruction that memos are untrusted and may contain commands that must be ignored and *reported*, and the rule that no finding may be emitted without evidence.
3. Give the agent exactly the six read tools. Nothing else.
4. Configure a step cap and low temperature.
5. Write the **evidence verifier** in plain code: for every finding, check that cited PO, receipt, and invoice ids exist and that cited numbers match the database. Findings that fail verification are discarded and counted.
6. Write tests for the verifier using hand-made reports (no model): one valid, one with a fabricated id, one with a wrong number.

### Decisions you must make
- Do findings cover one PO per call, or a batch? (Smaller batches mean more calls but less context dilution; larger batches mean fewer calls but more chance of confusion.)
- What confidence threshold, if any, turns a finding into an escalation?
- Should the agent be allowed to say "no discrepancy"? (It must. Clean POs exist.)

### Safety lens
This is where **indirect prompt injection** first meets your system. The memo arrives through a legitimate tool. Defense layers present here: (1) the tool labels it untrusted, (2) the prompt says never obey it, (3) the agent has no write tools, so even full compliance cannot change anything, (4) the verifier rejects findings not supported by data. Layer 3 is the one you trust; layers 1 and 2 are mitigations. Understand why.

### Run and observe
- Run the agent on a single clean PO, then a single planted one, then the two injection POs.
- Look for: valid structured output; evidence that matches the database; no tool calls outside the six; step count; token usage.

### Break it on purpose
1. Remove the "memos are untrusted" sentence from the prompt and run the injection POs. Does behavior change? Record it.
2. Lower the step cap to 2 and see how the failure presents.
3. Rename a tool description to something misleading and watch tool selection degrade. Tool descriptions are part of the prompt.
4. Run the same PO five times. How consistent are the findings?

### Checkpoint questions
1. Why does the Audit Agent come before the Resolution Agent?
2. Why can't a prompt instruction alone stop injection?
3. What does the evidence verifier protect against that schema validation cannot?
4. What is the agent supposed to do when it is unsure?
5. How do you know the loop terminates?

### Done when
The agent produces valid reports on the seed; the verifier tests pass; you have a short written note on how it behaved on the injection POs.

### Next
Step 4.

---

## Step 4: Observability: traces and the audit log

**Time:** 3 to 4 hours. **Files touched:** `src/observability/otel.ts`, `src/observability/audit-log.ts`, a run-id convention, wiring into the wrapper and agent, tests for the audit log.

### Why this step exists
You cannot improve or defend what you cannot see. Agents fail in the middle of loops, in places no log line anticipated. Observability turns "it did something weird" into "step 4 called the wrong tool because the description was ambiguous". You also build a *second, independent* trail for compliance, because tracing platforms are engineering tools, not legal records.

### Concepts to master
- **Trace, span, attribute.** A trace is one run; spans are steps within it (model call, tool call); attributes are metadata (run id, PO id, agent name, token counts).
- **OpenTelemetry (OTel).** A vendor-neutral standard for emitting traces. Emitting OTel means you can switch backends (Langfuse, Phoenix, others) without rewriting instrumentation. That is the lock-in argument.
- **What to capture:** prompt sent, tool name and arguments, tool result (watch for secrets and personal data), model output, tokens in and out, latency, errors. *What not to capture:* secrets. Redact before export.
- **Run id as the spine.** One id tying together the trace, the proposals, and the audit log rows. If you can start from any one and reach the others, debugging is fast.
- **Two trails, two audiences.** Traces: engineers, short retention, sampled. Audit log: auditors and compliance, append-only, in your own database, independent of any vendor.
- **Sampling and quota.** Free tracing tiers have unit limits. Trace demos and debug runs; sample or disable during full eval runs.

### Build
1. Create a Langfuse account (free tier) or run it locally, or run Arize Phoenix locally. Add keys to `.env`.
2. Initialise OTel once at process start; enable the AI SDK's telemetry on model calls; consult the current AI SDK and Langfuse docs for the exact packages and options.
3. Define the run-id convention and attach it (plus agent name and PO id where relevant) to spans.
4. Build the audit-log writer: append-only function that records actor, action, input, output, status, run id. The audit log never updates or deletes rows.
5. Record in the audit log: run start/end, each agent's final report, each policy verdict (later), each execution (later).

### Decisions you must make
- What counts as sensitive in tool results and how will you redact it?
- Which events *must* reach the audit log even if tracing is down?
- Retention: how long would a real company keep each trail, and why do they differ?

### Safety lens
Observability is how you **detect** a failed defense. Also a trap: traces contain prompts, which may contain injected text or sensitive data. Treat the trace store as sensitive.

### Run and observe
- Run the Audit Agent on one PO. Open the trace. You should see: one trace, a span per model call, a span per tool call, token counts, durations.
- Query the audit log with SQL by run id.

### Break it on purpose
1. Disable the tracing endpoint and confirm the audit log still records everything.
2. Find, in a trace, the exact point where the agent used its most expensive step.
3. Run the injection PO and locate where the hostile text appears in the trace.

### Checkpoint questions
1. Why OpenTelemetry instead of calling a vendor's SDK directly?
2. Why keep an audit log if you already have traces?
3. What is the run id for?
4. What should never be exported to a trace?
5. How would you find out how much a run cost?

### Done when
Every run is one trace with token data and a matching audit-log trail, and you can navigate from one to the other by run id.

### Next
Step 5.

---

## Step 5: Eval harness v0 and record/replay

**Time:** 4 to 5 hours. **Files touched:** `evals/dataset.json` (derived from ground truth), `evals/run.ts`, `evals/scorers.ts`, `evals/fixtures/`, a record/replay layer in the model wrapper.

### Why this step exists
This step converts "it seems to work" into numbers, and it is the single strongest differentiator in your portfolio. It also solves your zero-cost constraint: with record/replay, you can iterate on everything downstream (scorers, policy, executor) without spending a single call.

### Concepts to master
- **Precision and recall.** Precision: of the things the agent reported, how many were real? Recall: of the real discrepancies, how many did it find? You need both: an agent that reports everything has perfect recall and terrible precision.
- **False action rate.** Of actions that *executed*, how many should never have? Target zero. This is a safety metric, not a quality metric, and it is separate from precision.
- **Eval design.** Positive cases (planted), negative cases (clean), ambiguous cases (should escalate), adversarial cases (injection). A dataset without negatives rewards paranoia.
- **Noise.** Model outputs vary. A single pass proves little. For anything you report, run multiple times and publish the rate and the spread.
- **Record/replay.** In live mode, each model call and its response are saved to fixtures keyed by a hash of the request. In replay mode, the wrapper serves the saved response and never touches the network. Replay makes evals free, fast, deterministic, and CI-friendly. Its limit: if you change a prompt, the keys change and you must re-record.
- **Regression.** Every future prompt or model change is judged against the scorecard, not against a feeling.

### Build
1. Derive the eval dataset from `ground-truth.json`; add 5 ambiguous cases and keep the 2 injection cases.
2. Write scorers as plain functions: per-PO match between reported finding and expected label; aggregate recall, precision, false-action rate (later), injection-success rate (later), median tokens, median latency.
3. Implement record/replay in the wrapper behind a flag. Default is replay; live is explicit.
4. Write the runner: iterate cases, call the agent, score, print a readable scorecard, write a timestamped result file.
5. Record your first live run (mind your quota) and commit the fixtures so a clone of your repo can replay it.

### Decisions you must make
- What exactly counts as a "correct" finding (type only? type and PO? evidence quality?).
- How to treat extra findings on a clean PO (all count against precision).
- How many repeated runs per case for the numbers you will publish.

### Safety lens
Evals are your **assurance case**: evidence that defenses work, not an argument that they should. Define the safety targets (false-action rate 0, injection success rate 0) now, even though they cannot be fully measured until Steps 8 and 10.

### Run and observe
- Run the live eval once, then the replay eval. Replay must make zero network calls and produce identical scores.
- Look for: a scorecard with recall, precision, per-type breakdown, token and latency medians.

### Break it on purpose
1. Weaken the Audit Agent prompt (remove one discrepancy definition) and watch which type's recall drops. This teaches you that the scorecard locates problems.
2. Intentionally mislabel one ground-truth entry and watch the score punish a correct agent. Evals are only as good as their labels.
3. Switch to a smaller or local model and compare the scorecards. Record in `EXPERIMENTS.md`.

### Checkpoint questions
1. Why is recall alone a misleading metric?
2. Why do we need clean cases in the dataset?
3. What is the difference between precision and false action rate?
4. Why does replay work, and when does it stop being valid?
5. What would you do if the score changed between two identical live runs?

### Done when
`npm run eval` works in replay mode with zero calls, a live recording exists in fixtures, and your first scorecard is saved.

### Next
Step 6.

---

## Step 6: The policy engine

**Time:** 3 to 4 hours. **Files touched:** `src/policy/engine.ts`, `src/policy/rules.ts`, `src/policy/risk.ts`, `tests/policy.test.ts`.

### Why this step exists
This is the keystone of the "model proposes, code disposes" design. It is pure deterministic logic: given a proposal and context, return a verdict. It is built *before* the Resolution Agent on purpose, so that when an agent first generates a proposal, the authority structure already exists.

### Concepts to master
- **Policy as data.** Rules (limits, tiers, allow-lists) live in a data structure, not scattered through control flow, so they can be reviewed, tested, and eventually loaded from documents.
- **Verdict model.** Three outcomes: auto-approve (low risk), needs human (medium or ambiguous), reject (never allowed). Conservative by default: unknown means needs human or reject, never approve.
- **Risk tiering.** Risk grows with magnitude (quantity), reversibility (price changes and invoice holds are harder to undo than a small stock correction), and confidence. Design the tiering so a reviewer can predict the verdict.
- **Invariants.** Statements that must always be true regardless of input: stock never goes negative as a result of an action; an action's SKU must exist; an agent-supplied number is bounded. Invariants are enforced by the engine *and* by the database.
- **Fail closed.** If the engine itself errors, the result is "needs human", never "approve".
- **Separation of duties.** The component that proposes is not the component that approves. Here: agent proposes, engine classifies, human or engine approves, executor acts.
- **Testing without a model.** Policy is the most testable part of the system. Table-driven tests: a list of proposals with expected verdicts, including edge values.

### Build
1. Write the rules as data: auto-approve limit, reject limit, per-run action cap, allowed action types, SKU allow-list from the database.
2. Write the decision function as a pure function with no database writes and no model calls.
3. Include a reason list in every verdict (human-readable). Reasons end up in the audit log and in the approval prompt.
4. Write exhaustive tests: boundary values on each limit, unknown SKU, would-go-negative, over the per-run cap, and a proposal derived from a finding whose evidence cites an injection-looking memo.

### Decisions you must make
- Exact thresholds, and the business reasoning for each.
- Which action types are never auto-approved (suggested: anything touching invoices or prices).
- Whether the engine sees the model's confidence, and whether low confidence can ever *lower* risk (it should not).

### Safety lens
This is **excessive agency** control. Even if a model is manipulated into proposing something outrageous, the proposal meets a gate the attacker cannot talk to. Note what the engine must *never* accept as input: free-text from the model that influences the verdict beyond structured fields.

### Run and observe
- `npm test` with the new policy tests. Count your cases; you want dozens, not a handful.

### Break it on purpose
1. Write one proposal that should be rejected and confirm it is. Then loosen a rule and see exactly which tests fail. This is what tests are for.
2. Feed the engine malformed proposals (missing fields, negative quantities, huge numbers).
3. Make the engine throw and confirm the system fails closed.

### Checkpoint questions
1. Why is the policy engine not an LLM?
2. What does "fail closed" mean and where else in this project does it apply?
3. Why does the engine receive structured fields only?
4. Which three properties make a proposal riskier?
5. If an attacker controls the agent's output entirely, what is the worst the engine allows?

### Done when
The engine is pure, exhaustively tested, and you can state its worst-case guarantee in one sentence.

### Next
Step 7.

---

## Step 7: The Resolution Agent and proposals

**Time:** 3 to 4 hours. **Files touched:** `src/agents/resolution.agent.ts`, its prompt, `src/tools/propose/`, proposal schemas, idempotency-key derivation, tests.

### Why this step exists
The Audit Agent says *what is wrong*. The Resolution Agent says *what to do about it*. This is the first component whose output could cause harm, so its power is deliberately limited to **writing a proposal row**. It cannot change stock, invoices, or prices. That limitation, not the prompt, is the safety property.

### Concepts to master
- **Propose-only tools.** A tool whose only effect is inserting a pending proposal. Its name, description, and schema should make its non-authoritative nature obvious.
- **Typed action vocabulary.** A closed set of action types (adjust stock, hold invoice, escalate). The model chooses *from* the set; it cannot invent new actions.
- **Idempotency keys derived by code.** The key is computed from run id, PO id, and action type by your code, never supplied by the model. A model-supplied key can be manipulated or forgotten; a derived key guarantees that retrying the same logical action cannot create a second one.
- **Bounded parameters.** Numbers in proposals (quantities, deltas) are validated with explicit bounds in the schema, in addition to the policy engine's limits. Two layers on purpose.
- **Referential validation.** A proposal that names a SKU or PO must reference a real one; check against the database in the tool before inserting.
- **Escalation is a first-class outcome.** "I am not confident; a human should look" is a valid, safe, desirable output.

### Build
1. Define proposal schemas per action type.
2. Build three propose-only tools: stock adjustment, invoice hold, escalate-to-human. Each validates input, derives the idempotency key, inserts a pending proposal, returns a receipt id.
3. Write the Resolution Agent: its input is the *verified* findings (not raw tool access to everything); its tools are the propose tools plus read access only where genuinely needed.
4. Write the instructions: prefer escalation over guessing; never propose adjustments larger than the finding justifies; explain the reasoning in a structured rationale field.
5. Tests with no model: each propose tool rejects invalid input, duplicates collapse to one row, an unknown SKU is rejected.

### Decisions you must make
- Does the Resolution Agent see the raw memo? (Safer answer: no. It receives structured, verified findings only.)
- What goes in a rationale, and is it ever used by the policy engine? (It should not influence the verdict.)
- One proposal per finding or possibly several?

### Safety lens
This is the **confused deputy** risk: an agent with more authority than the person (or text) steering it. Mitigations by construction: narrow tool set, typed actions, derived keys, validated references, and a downstream engine that never trusts the agent. Also notice **data minimisation**: the less untrusted text this agent reads, the smaller its injection surface.

### Run and observe
- Run Audit then Resolution on a few planted POs. Inspect the `proposals` table: statuses are all pending; no ERP table changed.
- Verify by checksum or row count that `items` and `stock_movements` are untouched after the run.

### Break it on purpose
1. Hand the Resolution Agent a finding with an enormous recommended adjustment and see what it proposes, then what the policy engine says.
2. Run the same finding twice; confirm exactly one proposal exists.
3. Try to make a propose tool accept a SKU that does not exist.

### Checkpoint questions
1. Why is "propose-only" safer than "write with permission checks in the prompt"?
2. Why does code derive the idempotency key?
3. What does the Resolution Agent receive and why not the raw invoice memo?
4. What is a confused deputy?
5. Why validate bounds in both the tool schema and the policy engine?

### Done when
Proposals appear correctly, nothing in the ERP changes, and duplicates are impossible.

### Next
Step 8.

---

## Step 8: The executor and human approval

**Time:** 4 to 5 hours. **Files touched:** `src/executor/apply.ts`, an `Approver` interface and a CLI approver, `src/cli/approve.ts`, `tests/executor.test.ts`.

### Why this step exists
Someone must finally change the ledger. It is a small, boring, heavily tested module precisely because it is the only code with write authority. It has no model in it and no ambiguity.

### Concepts to master
- **Atomic transactions.** All the changes for one action commit together or not at all. A half-applied adjustment (movement written, on-hand not updated) is corruption.
- **Idempotent execution.** Executing the same proposal twice leaves the database in the same state as once. Check the key and status inside the same transaction, so two concurrent attempts cannot both pass the check.
- **State machine for proposals.** Allowed transitions: pending, approved or rejected, applied or failed. Illegal transitions (applying a rejected proposal, applying twice) are errors, not no-ops hidden from view.
- **Re-validation at execution time.** Policy was evaluated earlier; the world may have changed (stock moved). The executor re-checks invariants against current data immediately before writing. Never trust a verdict that is stale.
- **Human-in-the-loop design.** Approval is a *question with context*: what is proposed, why, the evidence, the policy reasons, the blast radius. Poor approval UX leads to rubber-stamping, which silently defeats the control.
- **The Approver interface.** The pipeline asks "approve this?" without knowing whether the answer comes from a terminal now or an HTTP request later (Phase 3). Interfaces at this seam are what make deployment an addition rather than a rewrite.
- **Append-only audit.** Every decision (who or what approved, when, what was applied) goes to the audit log.

### Build
1. Executor: single entry point per proposal. Inside one transaction: verify status and key, re-check invariants, apply writes (movement row and on-hand update, or invoice status change), mark the proposal applied, append audit rows. On any failure: roll back, mark failed with reason, audit it.
2. Define the `Approver` interface and implement a CLI approver that shows the full context and requires an explicit answer. Record the decider (human, or auto by rule).
3. Tests: apply once; apply twice is a no-op; rollback leaves nothing behind when a step fails midway; stale invariant (stock changed) is refused; illegal state transition is refused.

### Decisions you must make
- What happens to a `needs_human` proposal that nobody answers? (Timeout and expire? Remain pending forever?)
- What does the approval prompt show, and what would a tired reviewer need to see to make a good decision?
- Should auto-approved actions still be reviewable afterwards? (Yes: audit log plus a daily digest is the pattern.)

### Safety lens
This is your **last line of defense** and your best **accountability** control: every write is attributable, reversible by a compensating entry, and visible. Note the contrast: the model has no write path; the executor has no model in it.

### Run and observe
- Run the full chain manually on a few proposals. Verify: stock movements added with references back to proposal ids; audit log has the whole story; re-running changes nothing.

### Break it on purpose
1. Make the executor throw halfway through (temporary test hook) and confirm rollback.
2. Run two executions of the same proposal back to back.
3. Approve a proposal, change stock manually, then execute; confirm the re-check refuses.

### Checkpoint questions
1. Why must the idempotency check and the write be in the same transaction?
2. Why re-validate at execution time if the policy engine already approved?
3. What makes an approval prompt good or bad as a *control*?
4. What does the executor refuse to do, and how is that tested?
5. How would you reverse an applied adjustment?

### Done when
The executor is idempotent, atomic, re-validating, fully audited, and its tests cover every illegal path you can think of.

### Next
Step 9.

---

## Step 9: Orchestrator and CLI wiring

**Time:** 3 to 4 hours. **Files touched:** `src/orchestrator/run.ts`, `src/cli/audit.ts`, `package.json` scripts, integration tests with a fake model.

### Why this step exists
You now have all the parts. The orchestrator is the fixed pipeline that connects them, and the place where the earlier "seams" pay off: it takes its dependencies as arguments, so the CLI, tests, and (later) the web API all reuse it.

### Concepts to master
- **Deterministic orchestration vs LLM routing.** Your pipeline has two model stages in a fixed order. A model deciding the order adds cost, latency, and unpredictability with no benefit. Know exactly when that would change (many specialist agents, open-ended tasks).
- **Dependency injection.** The pipeline receives database, model, retriever, and approver. Tests pass fakes; the CLI passes real ones.
- **Mock models.** The AI SDK provides test utilities for scripted model responses. A scripted model lets you test the *pipeline's behavior under specific model outputs* (garbage JSON, empty response, hostile content) deterministically.
- **Failure policy per stage.** Decide, per stage, retry, escalate, or abort. Examples: invalid report after one retry becomes escalate-all; quota exhausted becomes clean stop with resumable state.
- **Resumability.** Because run state lives in the database, a crashed or quota-stopped run can be continued.
- **Thin CLI.** Parse flags, build dependencies, call the core, print results. Nothing else.

### Build
1. Implement the pipeline: audit, verify evidence, resolve, classify each proposal, request approval where needed, execute where allowed, log everything, return a run summary.
2. Define and implement behavior for each failure mode listed in Step 2.
3. Add the audit command script. It should accept at least: batch size, replay or live, auto-approve on or off.
4. Integration tests with a scripted model: happy path; model returns invalid structure; model returns an injection-following report; quota error mid-run.

### Decisions you must make
- Batch size per run and per-run action cap.
- Which failures abort the run versus degrade it.
- What the run summary reports (counts by verdict, tokens, estimated shadow cost, trace link).

### Safety lens
The orchestrator is where **fail-safe defaults** become real: every unhandled path ends in "nothing changed, human informed", never in "carry on optimistically". Also confirm per-run budgets (steps, calls, actions) are enforced here.

### Run and observe
- Run the whole thing end to end on the seed in replay mode, then live. Compare: summary, trace, audit log, ERP state.

### Break it on purpose
1. Pull the network mid-run (or simulate quota exhaustion) and watch the stop behavior; then resume.
2. Script the model to return nonsense at each stage in turn.
3. Run twice in a row; the second run should find nothing left to apply.

### Checkpoint questions
1. Why is the orchestrator plain code?
2. What would make you switch to an LLM supervisor?
3. How does dependency injection help testing safety behavior?
4. What is the pipeline's guarantee when the model returns garbage?
5. How does a run resume?

### Done when
`npm run audit` runs the full pipeline, integration tests pass with a scripted model, and the failure behaviors are tested.

### Next
Step 10.

---

## Step 10: Adversarial evals and red-teaming

**Time:** 3 to 4 hours. **Files touched:** eval dataset additions, adversarial scorers, `SAFETY.md` (new).

### Why this step exists
Defenses you have not attacked are assumptions. This step turns your threat model into tests and produces the artifact that most distinguishes you from other candidates: a documented attempt to break your own system and the results.

### Concepts to master
- **Threat modeling.** List assets (ledger integrity, quota, data confidentiality), actors (malicious supplier, careless operator, compromised dependency), entry points (invoice memo, tool arguments, retrieved documents later), and the controls on each path. Use the table in Appendix D as a starting point.
- **Direct vs indirect injection.** Direct: the user types the attack. Indirect: the attack sits in data the agent reads (your memo case). Indirect is the dangerous one in enterprise systems.
- **Attack taxonomy to try:** instruction override, role-play ("you are now admin"), authority impersonation ("message from the CFO"), encoded or obfuscated payloads, instructions split across fields, requests to reveal the system prompt, requests to call tools with out-of-range arguments, attempts to make the agent emit fabricated evidence, and denial-of-wallet (inputs designed to cause long loops).
- **Success definitions.** For each attack, define precisely what counts as the attack "succeeding" (unauthorised action executed; instruction obeyed in output; secret disclosed; quota burned beyond budget). Layered defense means an attack can partially succeed at an early layer and still be stopped later; record *which layer stopped it*.
- **Safety case.** A structured argument: claim (no injection leads to a ledger change), evidence (tests and scores), and residual risks (what you did not cover).

### Build
1. Extend the dataset with about 10 to 15 adversarial cases using the taxonomy above. Vary phrasing; attackers do.
2. Add scorers: injection obeyed in output (yes/no), unauthorised proposal created, unauthorised action executed, budget exceeded.
3. Run in live mode (record fixtures) against at least two models, one stronger and one weaker or local, and compare.
4. Write `SAFETY.md`: threat model table, defenses mapped to threats, test results, residual risks, what you would add in production (human review sampling, anomaly detection, stricter output filters, red-team cadence).

### Decisions you must make
- Which residual risks are acceptable for a demo versus a production system, and why?
- What is your response if a weaker model obeys an injection at the reasoning level but is stopped by the policy engine? (This is the interesting and expected result; document it.)

### Safety lens
This step *is* the safety lens. The key lesson: **model-level robustness is probabilistic; architecture-level controls are guarantees.** Your report should quantify both.

### Run and observe
- Scorecard now reports injection success rate and false-action rate. Target: false-action rate 0, executed-injection rate 0. Model-level obedience may be nonzero; that is information, not failure, provided the architecture contained it.

### Break it on purpose
1. Temporarily weaken the policy engine and rerun to see the attack succeed; this proves the test can detect failure.
2. Craft your own new attack that you believe will work. Try to break the evidence verifier specifically.

### Checkpoint questions
1. What is the difference between a model resisting an attack and the system containing it?
2. Why is indirect injection harder than direct?
3. Which layer stopped each of your attacks?
4. What is in a safety case besides "it passed"?
5. What would you monitor in production to catch attacks you did not anticipate?

### Done when
Adversarial cases are in the dataset and scorecard, `SAFETY.md` exists, and false-action rate and executed-injection rate are zero.

### Next
Step 11.

---

## Step 11: MVP hardening, documentation, and demo (the MVP gate)

**Time:** 3 to 4 hours. **Files touched:** `README.md` (results), `DECISIONS.md`, demo recording.

### Why this step exists
Work nobody can quickly understand does not get hired. This step packages the MVP so a stranger gets value in under three minutes, and it is the gate: Phases 2 and 3 do not start until it is passed.

### Concepts to master
- **Documentation hierarchy.** README answers "what and why" in minutes; ROADMAP and MANUAL answer "how"; SAFETY answers "why should I trust it"; DECISIONS answers "why this way".
- **Evidence over adjectives.** A scorecard table and a trace screenshot beat any sentence containing "robust".
- **Reproducibility.** A stranger should be able to clone, install, seed, test, and replay the eval without a key and without cost.
- **Supply-chain hygiene.** Pin dependency versions through the lock file; prefer releases that have been public for a couple of weeks; run the package manager's audit and read what it says.

### Build
1. Put the scorecard table, the architecture diagram, and one trace screenshot in the README.
2. Verify the cold-start path on a clean clone: install, seed, test, replay eval. Fix anything that needs tribal knowledge.
3. Record a 2 to 3 minute screen capture: a run, a high-risk proposal blocked pending approval, an injection attempt contained, a trace, the scorecard.
4. Update the Definition of Done checklist in `ROADMAP.md`.
5. Tag the repository `v0.1.0-mvp`.

### Decisions you must make
- Which three numbers do you lead with in the README?
- What do you honestly list under "limitations"?

### Safety lens
Honesty about limits is a safety property of your *communication*. Overclaiming is a red flag to experienced reviewers; calibrated claims build trust.

### Run and observe
- Hand the repository to a friend (or a fresh machine) and watch where they get stuck. Every stuck point is a documentation bug.

### Checkpoint questions (the MVP gate; answer all without notes)
1. Draw the full architecture and trust boundaries from memory.
2. Explain, in one minute, why an injected invoice memo cannot change the ledger.
3. Explain what your scorecard measures and what it does not.
4. Explain your three costliest design trade-offs.
5. What would you do first if this ran in production with real data?

### Done when
The Definition of Done in `ROADMAP.md` is fully checked and the demo exists.

### Next
Phase 2, Step 12.

---

# PART III: PHASE 2, RAG OVER POLICY DOCUMENTS

**Why Phase 2 exists.** Real agents need company knowledge: policies, contracts, procedures. Retrieval-augmented generation (RAG) lets a model answer from documents it was never trained on, with citations. Your use case mirrors the customer-support scenario: an assistant that explains *why* something happened by citing the written policy. The governing rule carries over: **RAG informs; it never authorises.**

## Step 12: Knowledge base design

**Time:** 3 to 4 hours. **Files touched:** `knowledge/` (new, synthetic documents), a short `knowledge/README.md`.

### Why this step exists
Retrieval quality is limited by document quality. Most RAG failures are data failures: poorly structured sources, contradictory content, missing coverage. Designing the corpus deliberately teaches you more than any retrieval trick.

### Concepts to master
- **Corpus design.** Short, single-purpose documents with clear headings beat long mixed ones. Each document has an id, a title, an effective date, and an owner.
- **Single source of truth.** Numbers that matter (tolerances, limits) appear once. Duplicated, drifting numbers cause confidently wrong answers. Decide now how `rules.ts` and the documents stay consistent (documents carry machine-readable front matter that code reads, or a test asserts agreement).
- **Coverage planning.** Decide the questions the assistant should answer, the ones it should refuse ("not covered by policy"), and write documents accordingly, *including deliberate gaps*.
- **Document trust levels.** Internal policy is trusted-authored but still *untrusted as instructions* once retrieved. Supplier-originated documents are untrusted outright.
- **Versioning and effective dates.** Policies change; stale chunks give wrong answers. Include dates and plan for superseded documents.

### Build
1. Write 8 to 12 synthetic documents: matching policy, price tolerance, duplicate handling, missing-receipt procedure, negative-stock procedure, approval limits, two or three supplier terms sheets, dispute templates.
2. Include machine-readable front matter for key thresholds; align `rules.ts` with it (or add the agreement test).
3. Write 20 evaluation questions with the expected source document, plus 5 questions the corpus intentionally cannot answer, plus 2 poisoned-chunk cases (a document passage containing instructions).

### Decisions you must make
- Chunking-friendly document style (consistent headings).
- How the policy documents and `rules.ts` stay in sync.

### Safety lens
A retrieved passage is the **second indirect-injection channel** (after memos). Plan the defense now: retrieved text is labeled as quoted reference material, the answering model cannot call write tools, and citations are verified.

### Checkpoint questions
1. Why can bad documents defeat good retrieval?
2. How do you avoid two sources of truth for a threshold?
3. Which test questions should have *no* answer, and why do they matter?
4. Why is a retrieved document still untrusted?

### Done when
The corpus, the 27 evaluation questions, and the consistency mechanism exist.

### Next
Step 13.

---

## Step 13: Ingest and index

**Time:** 3 to 4 hours. **Files touched:** `src/rag/` (new: ingest, chunking, embedding, index), an index artifact file, tests.

### Why this step exists
Ingestion decides what retrieval can ever find. This step makes the index a reproducible build artifact, which also solves your free-hosting constraint: embeddings are computed once, committed, and loaded at runtime.

### Concepts to master
- **Chunking.** Splitting documents into retrievable units. Too large: diluted relevance and wasted context. Too small: lost meaning. Structure-aware chunking (by heading, keeping the heading in the chunk) usually beats fixed windows. Each chunk carries metadata: document id, section, effective date.
- **Embeddings.** A model turns text into a vector so that similar meanings are close. Document and query must use the *same* embedding model; changing the model means re-embedding everything.
- **Similarity search.** Cosine similarity (or dot product) ranks chunks. For a few hundred chunks, brute force in memory is fast and has zero infrastructure. Vector databases exist for scale, filtering, and persistence; knowing *when you need one* matters more than using one.
- **Index as an artifact.** Build step produces a file (chunks, metadata, vectors, embedding model name and version). The runtime only loads it. Store the model name inside so a mismatch is detectable.
- **Quota-aware embedding.** Embed documents once with throttling and resume; cache by content hash so unchanged chunks are never re-embedded.

### Build
1. Chunker with a size target and heading-aware boundaries.
2. Embedding step using the free tier through your existing call wrapper discipline (throttled, resumable, cached).
3. Index file writer and loader; loader refuses an index built with a different embedding model.
4. The `Retriever` interface gets its first real implementation (vector only for now).
5. Tests: chunk boundaries, hash-based caching, loader mismatch refusal.

### Decisions you must make
- Chunk size and overlap, and a way to *measure* whether the choice is good (Step 14).
- Which metadata you keep.

### Safety lens
The index is a **data supply chain**. Anyone who can alter the index file can steer answers. Treat it like code: committed, reviewed, built reproducibly.

### Checkpoint questions
1. Why must query and document embeddings come from the same model?
2. When would you need a vector database and when is a file enough?
3. What do you store in the index besides vectors?
4. How does hash caching protect your quota?

### Done when
The index builds reproducibly, loads fast, and the loader is strict.

### Next
Step 14.

---

## Step 14: Hybrid retrieval and retrieval evals

**Time:** 4 to 5 hours. **Files touched:** keyword (BM25-style) retriever, hybrid ranking, retrieval eval runner and scorers.

### Why this step exists
Pure vector search misses exact identifiers and rare terms (a PO number, a clause id); pure keyword search misses paraphrase. Hybrid retrieval is the standard production answer. And you must *measure* retrieval separately from generation, because when answers are wrong you need to know which half failed.

### Concepts to master
- **Lexical vs semantic retrieval.** BM25-style scoring rewards exact term overlap weighted by rarity; embeddings capture meaning.
- **Rank fusion.** Combine the two rankings (reciprocal rank fusion is simple and robust) rather than mixing raw scores from different scales.
- **Top-k trade-off.** More chunks means higher recall but more tokens, more distraction, and more injection surface.
- **Retrieval metrics.** Hit rate at k (was the expected document in the top k?), mean reciprocal rank (how high?), and a no-answer behavior measure (does the system recognise irrelevant results?).
- **Graceful degradation.** If the embedding quota is exhausted, the keyword retriever alone still works. Design and test this fallback.
- **Query handling.** Short, vague queries retrieve poorly. Query rewriting with a model costs a call; decide whether it is worth it using your metrics, not intuition.

### Build
1. Keyword retriever over the same chunks.
2. Hybrid ranker via rank fusion.
3. Retrieval eval: run your 27 questions, report hit rate at k and rank metrics for vector only, keyword only, and hybrid. Record in `EXPERIMENTS.md`.
4. Quota-exhausted behavior test: embedding unavailable, retrieval still returns keyword results and flags degraded mode.

### Decisions you must make
- The k you ship and the evidence behind it.
- A relevance threshold below which the system says "nothing relevant found".

### Safety lens
A retrieval threshold is also a safety control: low-relevance junk shown to a model invites it to improvise. Better to return nothing.

### Break it on purpose
1. Search by an exact id with vector only, then with keyword. See the difference.
2. Change chunk size, re-index, re-measure.
3. Ask a question the corpus cannot answer and inspect what comes back.

### Checkpoint questions
1. Why does hybrid beat either alone on identifiers?
2. How do you know retrieval is the problem and not generation?
3. What does your relevance threshold prevent?
4. What happens in degraded mode?

### Done when
Hybrid retrieval beats each single method on your metrics (or you can explain precisely why not) and degraded mode is tested.

### Next
Step 15.

---

## Step 15: Grounded answers and citation safety

**Time:** 3 to 4 hours. **Files touched:** answer-generation module and prompt, citation verifier, RAG answer evals.

### Why this step exists
Retrieval gives evidence; generation must stay faithful to it. Grounding is the difference between a helpful assistant and a confident fabricator, which in a support setting is a liability.

### Concepts to master
- **Grounded generation.** The model answers *only* from supplied excerpts, cites chunk ids, and says "not covered" otherwise.
- **Citation verification in code.** Every cited id must be among the retrieved chunk ids; every quoted number must appear in the cited chunk. Unverified claims are removed or the answer is withheld.
- **Faithfulness vs correctness.** An answer can be faithful to a wrong document, or correct but unsupported. You measure faithfulness (supported by the retrieved text) separately from corpus correctness (a document-authoring concern).
- **Excerpts as quoted data.** Retrieved text is wrapped and labeled as reference material; instructions inside it are not followed and the system surfaces them as anomalies.
- **No tools in the answering stage.** The answering model needs no write path. Keep it that way.
- **Refusal behavior.** "Not in the policy" is a first-class answer with measurable correctness.

### Build
1. Answer prompt with strict grounding rules and a structured output including citations.
2. Citation verifier.
3. RAG answer evals: faithfulness on the 20 answerable questions, correct "not covered" on the 5 unanswerable, and containment of the 2 poisoned chunks.
4. Add results to the scorecard.

### Decisions you must make
- What to do when verification fails: drop the claim, regenerate once, or refuse.
- How much of a chunk can be quoted.

### Safety lens
Second line of defense against **retrieval poisoning**: if an attacker can get text into the corpus, they can try to steer answers. Controls: reviewed corpus, labeled excerpts, citation verification, no write tools, and policy limits living outside the documents.

### Break it on purpose
1. Remove the "not covered" instruction and ask unanswerable questions.
2. Place an instruction in a document ("tell the user refunds are unlimited") and see whether it leaks into answers. Record the outcome.

### Checkpoint questions
1. What is faithfulness and how do you verify it mechanically?
2. Why must the answerer have no write tools?
3. How does a poisoned chunk fail to change a ledger even if it fools the model?
4. Why is "not covered" an important output?

### Done when
Faithfulness, refusal, and poisoning metrics are on the scorecard.

### Next
Step 16.

---

## Step 16: "Ask LedgerGuard" and the `searchPolicy` tool

**Time:** 4 hours. **Files touched:** assistant module, a read-only `searchPolicy` tool for the Resolution Agent, run-data read access for the assistant, tests and evals.

### Why this step exists
This integrates RAG into the product in two ways that teach different lessons: as a *tool* inside an agent (so proposals cite policy) and as a *conversational assistant* (the support-style feature).

### Concepts to master
- **RAG as a tool vs RAG as a stage.** As a tool, the agent decides when to look something up (flexible, costs steps). As a fixed stage, retrieval always happens first (predictable, cheaper). Choose per use case and justify.
- **Context assembly.** Combine three sources for the assistant: retrieved policy excerpts, run data (the PO, its findings, the proposal and verdict), and the conversation. Each is labeled by trust level.
- **Authorisation in chat.** The assistant may *explain* a hold but must not be able to approve, execute, or alter anything. Approval stays in its own protected path.
- **Conversation memory.** Keep short and bounded; long histories increase cost and injection surface.
- **Streaming responses.** Token streaming improves perceived latency in a UI. Know why (time to first token matters more to users than total time).

### Build
1. `searchPolicy` read-only tool for the Resolution Agent; its proposals now include policy citations in the rationale; policy engine verdicts are unchanged by citations.
2. Assistant: given a run or PO reference and a question, assemble context, answer with citations, refuse out-of-scope requests (such as "approve this").
3. Tests and evals: the assistant explains correctly, cites verified chunks, refuses to approve, ignores injected instructions in memos and documents.

### Decisions you must make
- Whether the Resolution Agent searches policy as a tool or receives pre-retrieved excerpts.
- Conversation length limits.

### Safety lens
This is where **capability creep** tempts you: "just let the chat approve things". Do not. The assistant's tool set is read-only by construction, same principle as everywhere else.

### Checkpoint questions
1. Tool-based vs stage-based retrieval: when is each right?
2. What can the assistant never do, and what enforces that?
3. How do three trust levels of context combine in one prompt safely?
4. Why does a citation in a proposal not influence the policy verdict?

### Done when
Phase 2 is demonstrable end to end: ask why a PO was held, get a cited, verified, refusal-safe answer; Phase 2 evals are on the scorecard.

### Next
Phase 3, Step 17.

---

# PART IV: PHASE 3, FREE PUBLIC DEPLOYMENT

**Why Phase 3 exists.** Companies ship deployed features: support staff use them in a browser, not in the author's terminal. A live demo proves you can take an AI feature across the line from "works for me" to "works for others, safely, at zero cost". Everything here is about *operating* the system, not changing how it thinks.

## Step 17: HTTP API and minimal UI

**Time:** 4 to 5 hours. **Files touched:** `src/api/` (new), a small static UI folder, route tests.

### Why this step exists
The core pipeline is already a function with injected dependencies. This step exposes it over HTTP so a browser can start runs, review the approval queue, read traces, and chat. Because the core did not change, any bug you find here is an interface bug, and that confirms your seams were right.

### Concepts to master
- **Stateless services.** The server keeps no run state in memory; everything lives in the database. This is what makes restarts, scaling, and free-tier sleep harmless.
- **API surface as attack surface.** Each endpoint is a new way in. Enumerate them: start run, list proposals, approve or reject, ask assistant, read run summary, health.
- **HTTP approver.** The Approver interface now has a second implementation: proposals wait in the database; a human posts a decision in a later request.
- **Streaming.** Server-sent streaming for assistant answers; know why chunked delivery improves perceived speed.
- **Input validation at the edge.** Every request body and parameter goes through Zod, exactly like tool inputs. A request is untrusted input too.
- **Separation of read and write endpoints.** Approval and run-start are privileged; reading summaries is not.
- **Minimal UI philosophy.** A plain page with three panels (approval queue, run trace and findings, chat) beats an elaborate front end for this goal. You are a full-stack engineer: resist polishing the wrong layer.

### Build
1. Choose a small web framework suited to Node and containers; define the routes above.
2. Validate all inputs; return consistent error shapes; never leak internal errors or stack traces.
3. Implement the HTTP approver and approval endpoints.
4. Build the minimal page.
5. Route tests with a scripted model and an in-memory database.

### Decisions you must make
- Which endpoints require the access code (all writes and anything that can spend quota).
- Run-start semantics: synchronous (simple, long request) or asynchronous (return a run id, poll status). Prefer asynchronous; long requests die on free hosts and mobile networks.

### Safety lens
Treat every endpoint as hostile: authenticate writes, validate input, limit size, avoid reflecting input unescaped into pages (cross-site scripting), and ensure the model output rendered in the UI is escaped too. **Insecure output handling** is a named LLM risk: model text is untrusted content.

### Checkpoint questions
1. Why must the server be stateless?
2. Why is model output escaped before display?
3. Which endpoints can spend quota or change state, and how is each protected?
4. Why asynchronous runs?

### Done when
You can run a full audit, approve a proposal, and chat, all from a browser locally.

### Next
Step 18.

---

## Step 18: Containerise

**Time:** 2 to 3 hours. **Files touched:** `Dockerfile`, `.dockerignore`, startup script for seeding.

### Why this step exists
A container is the portable unit every modern host accepts. Containerising also forces you to separate build time from run time, which clarifies where secrets, indexes, and fixtures belong.

### Concepts to master
- **Image vs container.** The image is the packaged filesystem and start command; a container is a running instance.
- **Multi-stage builds.** Build with the compiler and dev tools in one stage; ship only the runtime essentials in the final image. Smaller images start faster and expose less.
- **Layer caching.** Order instructions so rarely-changing steps (dependency install) come before frequently-changing ones (source).
- **Native modules in containers.** `better-sqlite3` is compiled or downloaded per platform; build the image for the host's architecture and verify it runs there.
- **Configuration at runtime.** Secrets are injected as environment variables by the host, never baked into the image or committed.
- **Run as a non-root user** and expose only the port you need.
- **Boot-time seeding.** Because the database is deterministic and disposable in the demo, the container seeds on start. Know the consequence: all state resets on redeploy or sleep-and-wake.
- **Health checks.** A `/healthz` endpoint lets the host know the app is alive.

### Build
1. Write the Dockerfile and `.dockerignore` (exclude `.env`, `node_modules`, databases, results).
2. Build and run it locally; hit health, run an audit in replay mode, view the UI.
3. Confirm the image contains no secrets (inspect it).

### Decisions you must make
- What is baked into the image (code, built RAG index, fixtures) versus injected (keys, access code).

### Safety lens
Image contents are a distribution channel: anything in it is public if the image is. Check for `.env`, keys, and logs.

### Checkpoint questions
1. What is the difference between build-time and run-time configuration?
2. Why a multi-stage build?
3. What state is lost on container restart, and is that acceptable here?
4. Why a non-root user?

### Done when
The container runs the full demo locally with no secrets inside the image.

### Next
Step 19.

---

## Step 19: Demo safety: modes, limits, auth

**Time:** 3 to 4 hours. **Files touched:** mode switch, rate limiting, global budget counter, access-code check, kill switch.

### Why this step exists
A public URL attached to a free-tier key is an invitation to burn your quota or abuse the model. This step is a miniature of what companies call *abuse prevention and cost governance* for AI features.

### Concepts to master
- **Denial of wallet.** Attackers (or curious crowds) cause expensive usage. Free tier: they cause quota exhaustion, which takes your demo down for the day.
- **Two modes.** *Demo mode* (default): replays recorded runs; zero model calls; anyone can click. *Live mode*: real model calls; requires an access code you give interviewers.
- **Layered limits.** Per-IP rate limit, per-code limit, global daily call cap. When the cap hits, degrade to demo mode, never to an error page.
- **Kill switch.** An environment flag that forces replay-only instantly.
- **Secrets handling.** The model key lives only on the server. The browser never sees it. Logs must not print it.
- **Abuse inputs.** Oversized requests, deeply nested JSON, prompts engineered to produce long loops. Size caps and step caps handle these.
- **Privacy.** No real data; do not log user-provided free text longer than necessary; state this in the README.

### Build
1. Implement the mode switch and make demo mode the default.
2. Access-code check on live mode and on approval endpoints.
3. Per-IP and global limits; global counter persisted so it survives a restart within the day.
4. Request size caps; consistent, non-leaky errors.
5. Tests: limits trip; cap degrades to replay; kill switch works; the key never appears in responses or logs.

### Decisions you must make
- Daily global cap value derived from your actual free quota minus a safety margin.
- What an interviewer experiences with and without the code.

### Safety lens
This is **resource and abuse control**, the part of AI security that is plain web security plus a cost dimension.

### Break it on purpose
1. Hammer the live endpoint from a script and watch the limiter trip and the degradation to replay.
2. Search your own responses and logs for the key string.

### Checkpoint questions
1. What does "degrade, don't fail" mean here?
2. Which three limits exist and what does each protect?
3. Why is demo mode the default?
4. Where could your key leak and how did you check each place?

### Done when
A script cannot drain your quota, and demo mode works with zero model calls.

### Next
Step 20.

---

## Step 20: Deploy, CI, and monitoring

**Time:** 3 to 4 hours. **Files touched:** CI workflow, host configuration, README deployment section.

### Why this step exists
Deployment closes the loop, and CI makes your quality claims automatic: every push proves tests and replay evals still pass without anyone's quota.

### Concepts to master
- **Free-tier realities.** Free hosts sleep when idle, have small memory and bandwidth, and change terms without much notice. Verify the current limits on the host's own pricing page before you commit. Cloudflare Workers is not a Node runtime and will not run native modules like `better-sqlite3` without a port; a container host (Render's free web service is the default suggestion; Koyeb requires a card) fits your design. Keep the container portable so a host change is a redeploy.
- **Cold starts.** The first request after idle may take a minute. Design for it: a visible "waking up" state, a README note, and a recorded video as fallback.
- **Continuous integration.** On every push: install, type check, run tests, run replay evals, fail the build if the scorecard regresses beyond a threshold. This is also a *quality ratchet*.
- **Secrets in CI and hosting.** Stored in the platform's secret store, never in files.
- **Health and uptime.** Health endpoint, plus a free external pinger if you want the host awake during interview windows (check the host's terms).
- **Observability in production.** Traces keyed by run id; sampled; no sensitive data; know how to find a failed run from a user report.
- **Rollback.** Know how to redeploy the previous image.

### Build
1. Add the CI workflow (free for public repositories) with type check, tests, and replay evals; add a status badge to the README.
2. Deploy the container to your chosen free host with environment variables set; use demo mode as the default.
3. Smoke-test the live URL: health, demo run, approval flow, assistant, limits.
4. Add the "first load may take about a minute" note and a link to the demo video.

### Decisions you must make
- Which host and what is your plan B if its free tier changes.
- The scorecard regression threshold that fails CI.

### Safety lens
Supply chain again: pin versions, review the lock file diff in pull requests, and enable the platform's dependency alerts. A compromised dependency inherits all your secrets.

### Checkpoint questions
1. What does CI prove that running tests locally does not?
2. How does your deployment behave when the host sleeps?
3. Where do secrets live in each environment?
4. What is your plan if the host changes its free tier tomorrow?

### Done when
A public URL works in demo mode, live mode works with the code, CI is green, and README links are correct.

### Next
Step 21.

---

## Step 21: Portfolio packaging and interview readiness

**Time:** 4 to 6 hours. **Files touched:** README polish, `INTERVIEW.md` (private notes, optionally not committed), LinkedIn/CV bullets.

### Why this step exists
The project is only valuable if you can *tell its story* under pressure. This step converts your work into answers.

### Concepts to master
- **The three-minute narrative:** problem, architecture, the principle ("the model proposes, code disposes"), the evidence (scorecard), the limits.
- **Depth ladder.** For each component, prepare three levels of answer: one sentence, one minute, and a deep dive with trade-offs and what you would change at scale.
- **Whiteboard readiness.** Redraw the architecture and the trust boundaries from memory in under two minutes.
- **Honest limitations.** Synthetic data, single-tenant, in-memory vector index, free-tier model, no real ERP. And what each would become in production.
- **Scale story.** Move SQLite to Postgres behind repositories; vector file to pgvector or a managed vector store behind the `Retriever`; CLI approver to a queue and a review UI; synchronous runs to a job queue with retries and dead-letter handling; add auth and tenancy; add monitoring and alerting on eval drift.

### Build
1. Polish the README: one-paragraph pitch, architecture diagram, scorecard, live demo link, video link, limitations.
2. Write `INTERVIEW.md` with answers from Appendix E in your own words.
3. Practice the three-minute narrative aloud, twice, recorded.
4. Prepare CV bullets that are measurable (for example: end-to-end agent pipeline with guardrails; measured recall, precision, zero executed injections across N adversarial cases; deployed demo at $0).

### Checkpoint questions (final gate)
1. Defend the architecture to a skeptical staff engineer.
2. Explain every folder in the repository without looking.
3. Describe the three attacks you ran and which layer stopped each.
4. Describe what you would change to run this for a real company.
5. What did you get wrong along the way and what did you learn?

### Done when
You can present the project confidently with the repo, live URL, and video, and you can answer the Appendix E questions without notes.

---

# STRETCH MENU (only after Step 21)

Pick in this order for the most learning per hour:

1. **Mastra port.** Re-implement the orchestrator as a workflow with suspend and resume for approval; write a one-page comparison with your AI SDK version (control, abstraction, built-in observability, lock-in).
2. **Queue worker.** Move runs behind a job queue with retries and a dead-letter queue; discuss at-least-once delivery and why idempotency keys matter so much.
3. **MCP server.** Expose the read-only ERP and `searchPolicy` tools over the Model Context Protocol; discuss authorisation when tools are reachable by external clients.
4. **Provider comparison report.** Run the full scorecard across several free or local models; publish accuracy, latency, tokens, and refusal behavior.
5. **Online evals.** Push scores to the tracing platform and track drift across prompt and model changes.

---

# APPENDICES

## Appendix A: Folder-by-folder "if it is missing" test

Use this as a self-quiz. Cover the right column and explain each cell.

| Remove this | What breaks |
|---|---|
| `schema.sql` | No tables; nothing runs. |
| `seed.ts` | No data and no ground truth; evals impossible. |
| `repositories/` | Tools have nothing to read through; SQL leaks into tools. |
| `tools/read/` | The Audit Agent is blind. |
| `tools/propose/` | The Resolution Agent has no way to express a decision. |
| `agents/` | No reasoning; only deterministic code remains. |
| `policy/` | Proposals have no authority gate; the system is unsafe. |
| `executor/` | Nothing can ever change the ledger. |
| `orchestrator/` | Parts exist but no pipeline. |
| `observability/` | You cannot debug or audit. |
| `evals/` | You cannot prove anything. |
| `tests/` | Regressions go unnoticed. |
| `rag/` and `knowledge/` | The assistant has no grounded policy knowledge. |
| `api/` | Only the CLI works; no demo for others. |
| `Dockerfile` | Deployment is manual and fragile. |

## Appendix B: Glossary

| Term | Meaning |
|---|---|
| Agent | A model in a bounded loop that can call tools. |
| Tool | A function the model may request; your code validates and runs it. |
| Structured output | Model output constrained to a schema and validated afterward. |
| Context window | Maximum tokens per model call, covering prompt, tools, history, and output. |
| Token | The unit models read and write; priced and limited per token. |
| Temperature | Randomness control; lower is steadier, never fully deterministic. |
| Rate limit | Provider cap on requests or tokens per time window. |
| Backoff with jitter | Increasing, randomised waits between retries. |
| Idempotency | Doing something twice has the same effect as once. |
| Prompt injection | Text that tries to override a model's instructions. Direct: from the user. Indirect: from data the model reads. |
| Excessive agency | A model having more power than its task needs. |
| Confused deputy | A privileged component tricked into using its authority for someone else. |
| Fail closed | On error, choose the safe outcome (deny or escalate). |
| Trust boundary | A line across which data goes from untrusted to trusted contexts. |
| Defense in depth | Multiple independent controls so one failure is not fatal. |
| Ground truth | Known-correct labels used for scoring. |
| Precision / recall | Share of reports that are right / share of real issues found. |
| False-action rate | Share of executed actions that should not have run. |
| Record/replay | Saving real model responses and serving them later at zero cost. |
| RAG | Retrieval-augmented generation: fetch relevant documents, then answer from them. |
| Chunk | A retrievable piece of a document. |
| Embedding | A vector representing the meaning of text. |
| Hybrid retrieval | Combining semantic (vector) and lexical (keyword) search. |
| Faithfulness | Whether an answer is supported by the retrieved text. |
| OpenTelemetry | Vendor-neutral standard for traces and metrics. |
| Span / trace | One step / one whole run in a trace. |
| Denial of wallet | Abuse that drives up your usage cost or exhausts a quota. |
| Cold start | Delay when an idle service wakes. |

## Appendix C: "Which layer is the bug in?" decision guide

| Symptom | Look first at |
|---|---|
| Wrong or missing data | Seed, repositories, ground truth |
| Tool rejected input | The tool's schema versus what the model sent (check the trace) |
| Agent ignores a rule | Prompt clarity, tool descriptions, step cap, model strength |
| Agent invents evidence | Evidence verifier coverage; temperature; prompt |
| Valid proposal gets rejected | Policy rules and thresholds |
| Dangerous proposal approved | Policy rules, invariants, fail-closed behavior |
| Ledger changed unexpectedly | Executor, transaction boundaries, idempotency |
| Results differ between runs | Model variance; run multiple times; check replay |
| Run stops mid-way | Quota, timeout, step cap, wrapper error handling |
| Costs or quota surprise | Steps per run, tool-result size, retries, tracing overhead |
| Wrong policy answer | Retrieval first (hit rate), then generation (faithfulness) |
| Works locally, fails deployed | Environment variables, native module build, ephemeral disk, cold start |

## Appendix D: Threat model table

| Threat | Entry point | Primary controls | Test |
|---|---|---|---|
| Indirect prompt injection | Invoice memo, retrieved chunk | Untrusted labeling, read-only agents, evidence verification, policy engine, human approval | Adversarial eval set |
| Excessive agency | Any tool | Least privilege per agent, propose-only tools, no write path from models | Tool-set assertions in tests |
| Fabricated evidence | Agent output | Evidence verifier | Verifier tests |
| Out-of-range actions | Proposal parameters | Schema bounds, policy limits, database CHECKs, executor re-validation | Boundary tests |
| Double execution | Retries, concurrency | Derived idempotency keys, transactional check | Executor tests |
| Insecure output handling | Model text in UI | Escaping, no HTML from the model | UI test |
| Denial of wallet | Public endpoints, loops | Step caps, call budget, rate limits, demo mode default, kill switch | Load script |
| Secret leakage | Logs, traces, image, responses | Env-only secrets, redaction, image inspection | Grep checks |
| Poisoned knowledge | Corpus or index | Reviewed corpus, committed index, labeled excerpts, citation verification | RAG poisoning cases |
| Supply-chain compromise | Dependencies | Lock file, version pinning, aged releases, audit | CI audit step |
| Stale policy | Old documents | Effective dates, single source of truth for thresholds | Consistency test |

## Appendix E: Interview question bank

Answer each in your own words, aloud, at the three depth levels.

**Architecture and design**
1. Walk me through LedgerGuard end to end.
2. Why is the orchestrator not an LLM?
3. Why did you separate the Audit and Resolution agents?
4. Why SQLite, and what changes at scale?
5. Where is state kept and why?

**Safety**
6. What is prompt injection and how did you test it?
7. Which of your defenses are guarantees and which are mitigations?
8. What is the worst thing a fully compromised agent could do in your system?
9. How does your policy engine fail?
10. How do you prevent a duplicate action?

**Inference engineering**
11. How do you bound the cost and latency of an agent loop?
12. How do you handle rate limits and retries safely?
13. Why does temperature zero not give determinism?
14. What changes when you switch from a hosted model to a local one?
15. How did you make evals free and repeatable?

**Evals and quality**
16. Which metrics did you track and why those?
17. How did you handle output variance?
18. How would you detect a regression after a model upgrade?

**RAG**
19. Why hybrid retrieval?
20. How do you know whether a wrong answer is a retrieval or a generation failure?
21. How do you prevent poisoned documents from steering answers?
22. When would you adopt a vector database?

**Operations**
23. How is your demo protected from abuse at zero cost?
24. What happens on a cold start, and how did you design for it?
25. What would you build next for a real company?

## Appendix F: Weekly rhythm after the MVP

Once Phases 2 and 3 are complete, keep the project alive and compounding:

1. One session per week: run the live eval, compare the scorecard to last week, log changes.
2. One new attack per week added to the adversarial set.
3. One dependency review per month.
4. One written post or note per milestone; teaching is the strongest consolidation.

---

*End of manual. When in doubt about what to do next: open the progress tracker in section 4, find YOU ARE HERE, and read that step's Build section.*
