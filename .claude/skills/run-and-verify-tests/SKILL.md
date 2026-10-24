---
name: run-and-verify-tests
description: Run typecheck, targeted Vitest files and package coverage for the Taskly backend or frontend, interpret failures, and iterate until the new or updated tests pass. Use after writing or editing any test, and before reporting results.
---

# Run and verify tests

All test execution goes through one script. It runs inside the package directory
with a sanitized environment (no API keys or tokens), a 10-minute timeout, and
prints a compact JSON summary instead of raw logs.

```
node .claude/skills/run-and-verify-tests/scripts/run-tests.mjs --package <backend|frontend> [options]
```

| Option | Meaning |
| --- | --- |
| `--typecheck` | `tsc --noEmit` for the package (tests are type-checked too). |
| `--files a,b` | Run only these test files (repo- or package-relative). |
| `--format` | Frontend only: run Prettier `--write` on the `--files` first (CI enforces `format:check`). |
| `--coverage` | Run the **whole** package suite with coverage (`--files` ignored, because per-file thresholds apply to the full suite). |
| `--sources s1,s2` | Limit the coverage table to these repo-relative source files. |
| `--json <path>` | Also write the summary to a file (e.g. `.agent-output/backend-tests.json`). |

Exit code 0 means everything requested passed.

## Loop

1. **Fast loop** per test file you touched:
   `--package <pkg> --typecheck --files <test-file>` (frontend: add `--format`)
2. Read `typecheck.errors` and `tests.failures[]` (`file`, `test`, `message`).
   Decide whether the **test** is wrong (wrong selector, wrong mock shape,
   async not awaited, wrong expectation about current behaviour) and fix it.
   Read the source again rather than guessing.
3. If the source is wrong (the test encodes clearly intended behaviour and the
   code violates it), do **not** edit the source: remove or rewrite that case
   so the suite stays green, and add a `findings` entry with the evidence.
4. Maximum **3 repair rounds per test file**. If it still fails, delete your
   new failing cases (keep the passing ones) and report it.
5. **Final gate** once all files pass, for every affected package:
   `--package <pkg> --typecheck --coverage --sources <changed source files> --json .agent-output/<pkg>-tests.json`
   - All existing and new tests must pass.
   - `coverage.thresholdsOk` must be `true` (backend enforces 100% on
     validators/mappers).
   - Target ≥ 90% lines and branches for each changed source file; if not
     reached, add cases for the uncovered branches or explain why in the report
     (e.g. defensive code that cannot be reached).

## Flakiness checklist

- Use `await` with `userEvent` and `findBy*` / `waitFor` for async UI.
- Use `vi.useFakeTimers()` (and restore) for timeouts such as `useNotice`.
- Never depend on the current date without fixing it (`vi.setSystemTime`).
- Reset mocks between tests (`vi.clearAllMocks()` / `vi.restoreAllMocks()`).
- The runner sets `TZ=UTC`; do not rely on a local timezone.

The CI verify job re-runs the same script on a clean checkout without secrets, so
"it passed for me" is never trusted on its own — make it actually pass.
