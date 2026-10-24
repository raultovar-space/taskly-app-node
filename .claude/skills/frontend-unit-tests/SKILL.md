---
name: frontend-unit-tests
description: Conventions and patterns for writing Vitest + React Testing Library unit tests for the Taskly React/TypeScript frontend (components, hooks, API client, utils). Use whenever creating or updating a frontend test.
---

# Frontend unit tests (React 19 + TanStack Query + styled-components)

Stack: Vitest 4 (`environment: jsdom`, globals typed), React Testing Library,
`@testing-library/user-event`, `@testing-library/jest-dom` (loaded in
`src/test/setup.ts`). Tests are **colocated**: `Foo.tsx` → `Foo.test.tsx`.

## Style

Prettier config of the package: **no semicolons, single quotes, trailing
commas, 80 columns**. Import test APIs explicitly:
`import { beforeEach, expect, it, vi } from 'vitest'`.

## Isolation rules used across the suite

- **Design system is always mocked** at the import path used by the component
  under test: `vi.mock('../../../design-system', () => import('../../../design-system/mocks'))`.
  The mocks render native elements (`Drawer` → `role="dialog"` with
  `aria-label={title}` and a `Close` button; `Alert` → `data-testid="alert"`;
  `Input`/`Select` → `<label>` wrapping the control, so `getByLabelText` works;
  `Checkbox` → `<input type="checkbox">`). Each is a `vi.fn`, so you can assert
  props with `vi.mocked(Alert).mock.calls[0][0]`.
- **Child components / hooks are mocked** when testing a container
  (see `TodosPage.test.tsx`, `TodoEditor.test.tsx`): `vi.mock('./hooks/useX', () => ({ useX: vi.fn() }))`
  then `vi.mocked(useX).mockReturnValue({...} as unknown as ReturnType<typeof useX>)`.
- Shared data: `src/test/todoFixture.ts` (`todoFixture`). Spread and override it
  instead of re-declaring todos.

## Patterns by module type

| Module | How to test |
| --- | --- |
| Presentational component | `render(<X {...props} />)`; query by role/label/text; `userEvent.setup()` and `await user.click(...)`; assert callbacks and disabled states. Cover every conditional branch (e.g. `TodoItem`: completed vs active, description present, due date present, overdue). |
| Container (`TodosPage`, `TodoEditor`, `DeleteTodoDialog`) | Mock hooks and children; cover success, error (rejected `mutateAsync` keeps the dialog open), busy/pending guards, and notifications. |
| TanStack Query hooks (`hooks/use*Mutation.ts`, `useTodosQuery`) | `renderHook` with a wrapper: `const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })`, `wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>`. Mock `../api/todos` (`todosApi`). Seed with `client.setQueryData(todoKeys.list, [...])`, run `await act(() => result.current.mutateAsync(...))`, then assert `client.getQueryData(todoKeys.list)`. |
| `useTodosBusy` | Real `QueryClient`; start a mutation with a pending promise via `client.getMutationCache().build(...)` or a second hook, assert `true`, resolve, `await waitFor(() => false)`. |
| `useNotice` / timers | `vi.useFakeTimers()`, `act(() => result.current.notify('x'))`, `act(() => vi.advanceTimersByTime(4000))`, `vi.useRealTimers()` in `afterEach`. |
| `lib/http.ts` | `vi.stubGlobal('fetch', vi.fn())` + `vi.unstubAllGlobals()`. Build responses with `new Response(JSON.stringify(body), { status })`. Cover: success JSON, 204 → `undefined`, 422 message, string `detail`, non-string detail fallback, invalid JSON body, network error message, aborted signal rethrows original error, header merge. |
| `api/todos.ts` | Mock `../../../lib/http` and assert path, method and body — read-only fields (`id`, timestamps) must never be sent. |
| `utils/todos.ts` | Pure functions: table tests with `it.each`. Freeze time for `isOverdue` with `vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-15T10:00:00'))`. |
| `AppProviders` | Render a child that reads `useQueryClient()` and the styled-components theme (`useTheme()`), assert both are provided; pass a custom `client`. |

## Queries, in order of preference

`getByRole(name)` → `getByLabelText` → `getByText` → `getByTestId` (only for
the mocked `alert`). Use `findBy*`/`waitFor` for anything async. Use
`toBeVisible`, `toBeDisabled`, `toHaveValue`, `toHaveTextContent`.

## Must not

- Render real design-system components (styled-components + theme noise).
- Use snapshots, `setTimeout` sleeps, or real `fetch`.
- Edit `vite.config.ts` coverage exclusions to raise numbers.
