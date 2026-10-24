---
name: backend-unit-tests
description: Conventions and patterns for writing Vitest + Supertest unit tests for the Taskly Express/Prisma backend (backend/src → backend/tests). Use whenever creating or updating a backend test.
---

# Backend unit tests (Node + Express + Prisma + Zod)

Stack: Vitest 4 (`environment: node`), Supertest, TypeScript ESM (`NodeNext`).
Tests live flat in `backend/tests/*.test.ts` and are picked up by
`include: ['tests/**/*.test.ts']`. **No PostgreSQL is available** — every test
must mock IO.

## File skeleton

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { record, todo } from './fixture.ts';

afterEach(() => vi.restoreAllMocks());
```

- Import sources with the **`.ts` extension** from `../src/...` (see existing tests).
- Semicolons, single quotes, compact style — match `tests/router.test.ts`.
- Reuse `tests/fixture.ts` (`record`: a Prisma row, `todo`: its API JSON). Add
  new shared fixtures there rather than duplicating literals.

## Patterns by layer

| Layer | How to test |
| --- | --- |
| `validators.ts` (Zod) | Call `schema.parse` / `safeParse` directly; use `it.each` tables for valid/invalid inputs and boundaries (120/121 chars, leap years). 100% coverage is enforced. |
| `mappers.ts` | Pure functions — assert output and that input is not mutated (`structuredClone`). 100% enforced. |
| `repository.ts` | Build a real client with `createDatabase('postgresql://test:test@localhost:5432/test')` and `vi.spyOn(database.todo, 'findMany').mockResolvedValue(...)`. Assert the exact Prisma arguments. |
| `router.ts` | Mount the router on a fresh `express()` with `express.json()`, inject a fake `TodoStore` made of `vi.fn()`, drive it with `supertest`. Assert status, body **and** what the repository received / that it was not called on validation errors. |
| `factory.ts` | `createApp(fakeDatabase)` where `fakeDatabase = { todo: { findFirst: vi.fn(), ... } } as unknown as Database`. Cover 404 JSON, malformed JSON → 422, oversized body → 413, unexpected error → 500 (silence `console.error` with `vi.spyOn(console, 'error').mockImplementation(() => {})`), `/openapi.json`, `x-powered-by` disabled. |
| `api/health.ts` | Fake `database.todo.findFirst`; assert `{ status: 'ok' }` and that a rejection propagates to Express error handling (mount with `createApp` or an error handler). |
| `core/config.ts` | Use `vi.stubEnv(name, value)` and `vi.unstubAllEnvs()` in `afterEach`. Import the module normally (dotenv loading a missing `.env` is harmless). Cover override, `DATABASE_URL`, `postgresql+psycopg:` rewrite, each missing variable, URL encoding of credentials. |
| `core/database.ts` | `initialize`: pass `{ $executeRaw: vi.fn() }` and assert it was called once with a template containing `CREATE TABLE IF NOT EXISTS todos`. |
| `core/lifespan.ts` | `vi.mock('../src/core/database.ts', ...)` and `vi.mock('../src/factory.ts', ...)` with a fake app whose `listen(port, host, cb)` returns a fake server (`EventEmitter` with `address()` and `close(cb)`). Cover success, port from `API_PORT`, connect failure → `$disconnect` + rethrow, listen `error` event, and shutdown handlers via the registered `process.once` callbacks (spy on `process.once`; never send real signals; stub `process.exit`). |

Use `vi.hoisted` for mock state shared between a `vi.mock` factory and tests.

## Express 5 notes

- Async handler rejections are forwarded to the error middleware automatically.
- `router.param('id')` validation returns 422 with Zod `issues` in `detail`.
- `res.status(204).end()` has an empty body (`response.body` is `{}` in Supertest).

## Must not

- Hit a real database, network or filesystem outside `os.tmpdir()`.
- Rely on test execution order or leak env/mocks between tests.
- Lower or bypass the coverage thresholds in `vitest.config.ts`.
