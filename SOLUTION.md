# SOLUTION — Unit Test Agent and agentic PR workflow

A custom **Claude Code** agent (`unit-test-agent`) with five reusable **skills**, driven by a
four-job **GitHub Actions** workflow. On every pull request it decides which changed
frontend/backend files need tests, creates or updates them, proves they pass in an isolated
job, commits them to the PR branch and reports everything in one sticky PR comment.
The same agent was used locally (coverage mode) to fill the existing coverage gaps.

## 1. Where things live

| Piece | Path | Role |
| --- | --- | --- |
| Custom agent | [`.claude/agents/unit-test-agent.md`](.claude/agents/unit-test-agent.md) | System prompt: mission, hard rules, workflow order, quality bar. Tools limited to `Read, Glob, Grep, Edit, Write, Bash, Skill`. |
| Skill: analyze | [`.claude/skills/analyze-pr-changes/`](.claude/skills/analyze-pr-changes/SKILL.md) | Decide `create / update / none` per changed file. Ships `changed-files.mjs` (deterministic diff → `plan.json`). |
| Skill: backend | [`.claude/skills/backend-unit-tests/`](.claude/skills/backend-unit-tests/SKILL.md) | Conventions per layer (Zod, mappers, Prisma repository spies, Supertest routers, env/config, lifespan). |
| Skill: frontend | [`.claude/skills/frontend-unit-tests/`](.claude/skills/frontend-unit-tests/SKILL.md) | RTL conventions, design-system mocks, TanStack Query hook wrapper, fetch stubbing, fake timers. |
| Skill: run & verify | [`.claude/skills/run-and-verify-tests/`](.claude/skills/run-and-verify-tests/SKILL.md) | Ships `run-tests.mjs`: typecheck / Vitest / coverage / Prettier with a **sanitized env**, compact JSON output, repair loop rules. |
| Skill: report | [`.claude/skills/report-test-results/`](.claude/skills/report-test-results/SKILL.md) | Structured final report + `result.schema.json`. |
| Guardrails | [`.claude/hooks/policy.mjs`](.claude/hooks/policy.mjs), [`guard-tool-use.mjs`](.claude/hooks/guard-tool-use.mjs), [`unit-test-agent.settings.json`](.claude/unit-test-agent.settings.json) | Path/command allowlist enforced by a `PreToolUse` hook + permission rules (`dontAsk` mode). |
| Runner | [`.github/unit-test-agent/run-agent.sh`](.github/unit-test-agent/run-agent.sh) | One entry point for CI and local runs (`pull_request` / `coverage` mode). |
| CI helpers | [`.github/unit-test-agent/`](.github/unit-test-agent/) | `parse-result.mjs` (schema validation), `validate-patch.mjs` (second policy layer), `render-report.mjs` (PR comment). |
| Workflows | [`.github/workflows/unit-test-agent.yml`](.github/workflows/unit-test-agent.yml), [`ci.yml`](.github/workflows/ci.yml) | Agentic PR workflow; plain CI (typecheck, format, tests, coverage). |

## 2. How a run works

```
pull_request ─▶ analyze ──▶ generate ──▶ verify ──▶ publish
               (no secrets)  (API key,    (no secrets) (write token,
                deterministic read-only,   re-runs all   no PR code
                plan; skip?   egress FW)   independently) executed)
```

1. **analyze** — `changed-files.mjs` lists changed files in `base...head`, drops what has no
   unit-testable logic (types, generated Prisma client, design system, barrels, stories,
   config — mirroring the coverage excludes), finds existing tests that import (and do not
   `vi.mock`) each module, and records changed line ranges. No candidates ⇒ the LLM is never
   called. Commits marked `[unit-test-agent]` are ignored (loop prevention).
2. **generate** — runs `claude -p --agent unit-test-agent` headlessly. The agent loads the
   skills in order: *analyze-pr-changes* → *backend-/frontend-unit-tests* →
   *run-and-verify-tests* (fast loop per file, ≤3 repair rounds, then a full typecheck +
   coverage gate) → *report-test-results*. Output: `agent.patch` + validated `result.json`.
3. **verify** — fresh checkout, no secrets. Validates the patch against the same allowlist,
   runs typecheck + tests + coverage **before** (PR head) and **after** (PR head + patch), and
   checks Prettier formatting of generated frontend tests. This job is the source of truth.
4. **publish** — if verification passed and the branch has not moved, applies the patch and
   pushes one commit (`test: … [unit-test-agent]`) to the PR branch. Always upserts a single
   sticky comment: decisions + rationale per file, verification table, changed-file coverage
   before → after, findings, skills used, turns/cost, and a warning if the agent's claimed
   numbers differ from what CI measured. The job fails (red check) if generation or
   verification failed.

## 3. Main technical decisions

- **Claude Code CLI as the agent runtime** (pinned version), not a hosted bot: native support
  for custom agents (`.claude/agents`) and skills (`.claude/skills`), hooks for deterministic
  policy, headless JSON output with cost/turn metrics, and the same setup works locally.
- **Deterministic work outside the LLM.** Diffing, filtering, test discovery, running tests,
  validating output and rendering the report are scripts. The model only does what needs
  judgement: deciding what to test and writing the tests. This makes runs cheaper, auditable
  and reproducible.
- **Skills carry executable tools, not only prose.** Each skill bundles the scripts it
  documents; the agent may run *only* those scripts and read-only git.
- **Defence in depth against prompt injection / over-reach** (PR code is untrusted input):
  1. Agent tooling (`.claude/`, helper scripts) is restored from the **base** commit in every
     job, so a PR cannot edit its own guardrails or prompts.
  2. `PreToolUse` hook + permission allowlist (`--permission-mode dontAsk`): writes only to
     `backend/tests/**`, `frontend/src/**/*.test.ts(x)`, `frontend/src/test/**`; no `.env` or
     `.git` reads; Bash limited to skill scripts and `git diff|log|show|status` without shell
     operators; no web tools, no MCP servers, no user-level settings.
  3. Test processes run with a **minimal environment** — the API key never reaches code under
     test; dependencies are installed with `--ignore-scripts`.
  4. **Egress firewall** (harden-runner, `block`) in the only job holding the key.
  5. Least-privilege tokens: `permissions: {}` by default; the agent job has `contents: read`
     and no persisted git credentials; only *publish* can write, and it never runs PR code.
  6. Patch validation in a separate job: only regular, non-executable text test files; no
     deletes, renames, mode changes or binaries.
  7. Fork PRs are skipped (they get no secrets); opt-out label `skip-unit-test-agent`.
  8. Report text from the model is escaped (HTML, `@mentions`, table pipes) before posting.
- **Reliability:** strict JSON-schema validation of the agent report, budget cap
  (`--max-budget-usd`), job timeouts, `concurrency` per PR with cancel-in-progress, branch-moved
  check before pushing, pinned action SHAs, TZ fixed to UTC for deterministic tests.
- **Correct, useful results:** "never modify production code" — suspected bugs become
  `findings` instead of silently "fixed" code or committed failing tests; existing tests may
  not be weakened; tests follow each package's established style (design-system mocks,
  fixtures, Prettier).

## 4. Running it

### Prerequisites

1. Repository secret **`ANTHROPIC_API_KEY`** (or `CLAUDE_CODE_OAUTH_TOKEN` from
   `claude setup-token`).
2. GitHub Actions enabled. No repository-wide write permission is needed; each job requests its
   own minimal `permissions`.
3. Optional repository variables: `UNIT_TEST_AGENT_MODEL` (default `claude-opus-5-5`),
   `UNIT_TEST_AGENT_MAX_BUDGET_USD` (default `5`).
4. PRs must come from a branch of this repository (not a fork) and not be drafts.

### On GitHub

Open or update a PR that touches `backend/**` or `frontend/**`. Results appear as the
**Unit Test Agent** checks, a job summary, a commit on the branch and the sticky comment.

### Locally

```bash
# PR mode against main
BASE_SHA=$(git merge-base origin/main HEAD) .github/unit-test-agent/run-agent.sh pull_request
# Coverage mode for specific files
FILES=backend/src/factory.ts,frontend/src/lib/http.ts .github/unit-test-agent/run-agent.sh coverage
```

Requires Node ≥ 22.12, `jq`, Claude Code CLI, installed package dependencies, and Claude
credentials. Results: `.agent-output/result.json`; test changes are left in the working tree.

## 5. Results

### Coverage gaps closed with the agent (coverage mode, run locally)

The agent was run four times in `coverage` mode over every under-covered module (reports in
[`docs/agent-runs/`](docs/agent-runs/)), then committed as `test: close coverage gaps with
unit-test-agent`. The result was reviewed by hand and run 3× to check for flakiness.

| Package | Tests | Lines | Branches | Functions |
| --- | --- | --- | --- | --- |
| Backend | 48 → **99** | 33.0% → **100%** | 33.3% → **97.9%** | 40.6% → **100%** |
| Frontend | 18 → **126** | 47.7% → **100%** | 43.8% → **99.3%** | 40.3% → **100%** |

Total agent cost ≈ $3.00 (0 blocked tool calls). The only uncovered branches are defensive code
the agent explicitly reported as unreachable without changing production code
(`res.headersSent` in the Express error handler; one short-circuit operand in `selectTodos`).

### Example run — demo PR [#1 "task statistics"](https://github.com/raultovar-space/taskly-app-node/pull/1)

The PR adds `GET /api/todos/stats` (validator, repository `count` queries, route, OpenAPI) and a
frontend `TodoStats` summary (API call, `useTodoStatsQuery`, stats invalidation in the three
mutation hooks, `toLocalDate` refactor). It deliberately contains **no test changes**, and as
written it broke 14 existing `TodosPage` tests and the backend router test typecheck.

**Run 1 — creating tests** ([workflow run](https://github.com/raultovar-space/taskly-app-node/actions/runs/40124019250)):

- *analyze*: 11 candidate source files; 4 skipped deterministically (2 × `types.ts`,
  `queryKeys.ts`, `openapi.json`).
- *generate*: skills used `analyze-pr-changes → backend-unit-tests → frontend-unit-tests →
  run-and-verify-tests → report-test-results`; 54 turns, $0.76, 156 s, 0 blocked tool calls.
  Decisions: **create** for `TodoStats.tsx` and `useTodoStatsQuery.ts`; **update** for the other
  9 (e.g. "adds a `GET /stats` route with a 422 validation branch and a UTC-date fallback";
  "page now calls `useTodoStatsQuery` — mocked both so existing tests stay isolated").
  It also added a shared `stats` fixture.
- *verify*: backend ✅ 123/123, frontend ✅ 143/143, thresholds ✅; every changed file at 100% lines
  (router 86.7% → 100%, repository 88.9% → 100%, branches 75% → 100%).
- *publish*: commit `test: add or update unit tests for changed code [unit-test-agent]` (12 files)
  and the sticky comment; CI re-dispatched and green on the bot commit.
- **Finding raised by the agent:** the server-side UTC default for `today` could disagree with the
  UI near midnight.

**Run 2 — updating tests** ([workflow run](https://github.com/raultovar-space/taskly-app-node/actions/runs/40124529386)):
the developer acted on that finding (`today` is now required) and added an "All done!" badge.
This broke 2 tests the agent itself had written.

- *generate*: 23 turns, $0.39, 86 s. **none** for 8 files ("already covered — exact Prisma
  arguments, zero totals and DB error"), **update** for 3: it replaced the "defaults to UTC" case
  with a "missing `today` → 422" case, moved `{}` to the rejected validator inputs, and added a
  test for the "All done!" branch. It flagged the behaviour change as a ⚠️ finding ("if a default
  was actually intended, the source and openapi.json need to change instead").
- *verify*: backend ❌ 121/123 → ✅ 123/123; frontend 143 → 144; `TodoStats.tsx` branches 90% → 100%.
- *publish*: a second bot commit (3 files, +12/−16), and the same comment updated in place.

## 6. Assumptions

- Unit tests mean fast, isolated Vitest tests (no PostgreSQL, network or browser), matching the
  existing suites; integration and E2E tests are out of scope.
- Generated tests are committed directly to the PR branch (and reviewed as part of the PR),
  rather than proposed in a separate PR. Committing can be turned off by removing the commit step.
- PR authors are repository collaborators. Fork PRs are skipped, because running an agent with
  secrets on untrusted fork code would need a separate, more restrictive design.
- The existing coverage configuration is the source of truth for what is worth testing
  (design-system, types, barrels and config are excluded).
- The base branch's `.claude/` and agent scripts are trusted; the PR's are not.

## 7. Limitations

- **Bot pushes and checks:** pushes made with `GITHUB_TOKEN` don't trigger `pull_request`
  workflows. CI is re-dispatched via `workflow_dispatch` so the bot commit gets green checks, but
  GitHub still lists the skipped `pull_request` runs as `action_required`. A GitHub App token would
  avoid both.
- **LLM non-determinism:** decisions, test style and cost vary between runs; correctness is
  guaranteed only by the independent verify job, not by the agent.
- **Coverage ≠ quality:** the gate measures that tests pass and cover changed files; it cannot fully
  judge the strength of assertions (no mutation testing yet).
- **Same-repo trust boundary:** a collaborator can still edit the workflow file itself in a PR
  (GitHub uses the PR's version for `pull_request`). The guardrails protect against injected
  instructions and agent mistakes, not against a malicious maintainer.
- The agent cannot delete obsolete test files (deletes are rejected by policy); it reports them.
- Large PRs are capped at 15 candidate files per run and $5 per run (configurable).
- The egress allowlist depends on the runner's current endpoints and may need updating when
  GitHub or npm change infrastructure.
- Locally, results depend on the machine's Node, npm and Claude Code versions; CI pins them.

## 8. What I would change for production

- Use a **GitHub App** for publishing (proper checks on bot commits, no `action_required` runs,
  fine-grained permissions), and put the API key in a protected **environment** with
  required reviewers or a spend limit.
- Optionally post tests as a **suggested-changes review** or a stacked PR instead of committing,
  configurable per repository.
- Add **mutation testing** (Stryker) on changed files as a quality gate, plus a flakiness re-run
  (N repetitions, or random order) before committing.
- Run the agent in an **ephemeral container / microVM** with a network namespace instead of relying
  on a runner-level egress policy; split the verify job into separate backend and frontend runners.
- **Observability:** export turns, cost, duration, decisions and verification outcomes to a
  dashboard; alert on cost spikes; keep transcripts for audit, with redaction.
- **Evals for the agent and skills:** a fixed suite of seeded PRs (new feature, refactor, bug,
  prompt-injection attempt, docs-only) run on every change to `.claude/`, scored on
  verified-pass rate, coverage delta and false "none" decisions.
- Cache `node_modules` / Prisma client between jobs; use a cheaper model for `analyze`-only
  decisions and the stronger model only for writing tests.
- Support more triggers: a `/unit-test-agent` PR comment command, and a scheduled coverage-mode run
  that opens a PR for the remaining gaps.
