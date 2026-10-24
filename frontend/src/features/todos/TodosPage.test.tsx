import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { SuccessNotice } from '../../components/SuccessNotice'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { TodoFilters } from './components/TodoFilters'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { TodoStats } from './components/TodoStats'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodoStatsQuery } from './hooks/useTodoStatsQuery'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodoStatsQuery', () => ({ useTodoStatsQuery: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: vi.fn(
    ({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) => (
      <button disabled={disabled} onClick={onCreate}>
        New task
      </button>
    ),
  ),
}))
vi.mock('./components/TodoStats', () => ({
  TodoStats: vi.fn(() => null),
}))
vi.mock('./components/TodoFilters', () => ({
  TodoFilters: vi.fn(() => null),
}))
vi.mock('./components/TodoList', () => ({
  TodoList: vi.fn(
    ({
      todos,
      onCreate,
      onToggle,
      onEdit,
      onDelete,
    }: {
      todos: Todo[]
      onCreate: () => void
      onToggle: (todo: Todo) => void
      onEdit: (todo: Todo) => void
      onDelete: (todo: Todo) => void
    }) => (
      <section>
        <p>Task list</p>
        <button onClick={onCreate}>Create from list</button>
        {todos.map((todo) => (
          <div key={todo.id}>
            <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
            <button onClick={() => onEdit(todo)}>Edit {todo.title}</button>
            <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
          </div>
        ))}
      </section>
    ),
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: vi.fn(
    ({
      todo,
      onClose,
      onSaved,
    }: {
      todo: Todo | 'new'
      onClose: () => void
      onSaved: (message: string) => void
    }) => (
      <div
        role="dialog"
        aria-label={todo === 'new' ? 'Editor: new' : `Editor: ${todo.title}`}
      >
        <button onClick={onClose}>Close editor</button>
        <button onClick={() => onSaved('Changes saved.')}>Save editor</button>
      </div>
    ),
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(
    ({
      todo,
      onClose,
      onDeleted,
    }: {
      todo: Todo
      onClose: () => void
      onDeleted: () => void
    }) => (
      <div role="dialog" aria-label={`Delete: ${todo.title}`}>
        <button onClick={onClose}>Close delete</button>
        <button onClick={onDeleted}>Confirm delete</button>
      </div>
    ),
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({
  SuccessNotice: vi.fn(() => null),
}))

interface SetupOptions {
  loaded?: boolean
  data?: Todo[]
  queryError?: Error | null
  mutationError?: Error | null
  isPending?: boolean
  isFetching?: boolean
  busy?: boolean
  mutateAsync?: ReturnType<typeof vi.fn>
}

function setup({
  loaded = true,
  data = loaded ? [todoFixture] : undefined,
  queryError = null,
  mutationError = null,
  isPending = false,
  isFetching = false,
  busy = false,
  mutateAsync = vi.fn(),
}: SetupOptions = {}) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data,
    isPending,
    isFetching,
    isError: !!queryError,
    error: queryError,
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: 'Hello', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: data ?? [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  return { refetch, reset, notify, mutateAsync }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useTodoStatsQuery).mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof useTodoStatsQuery>)
})

it('passes the loaded statistics to the stats section', () => {
  const stats = { total: 2, completed: 1, active: 1, overdue: 0 }
  setup()
  vi.mocked(useTodoStatsQuery).mockReturnValue({
    data: stats,
  } as unknown as ReturnType<typeof useTodoStatsQuery>)
  render(<TodosPage />)
  expect(vi.mocked(TodoStats).mock.lastCall![0]).toEqual({ stats })
})

it('renders the stats section without data while statistics load', () => {
  setup()
  render(<TodosPage />)
  expect(vi.mocked(TodoStats).mock.lastCall![0]).toEqual({ stats: undefined })
})

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('passes the query state, filters and notice to the page sections', () => {
  setup({ isPending: true, loaded: false })
  render(<TodosPage />)
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  expect(vi.mocked(TodosHeader).mock.lastCall![0].disabled).toBe(true)
  expect(vi.mocked(TodoList).mock.lastCall![0]).toMatchObject({
    todos: [],
    hasTodos: false,
    loading: true,
    failed: false,
    busy: false,
  })
  const filters = vi.mocked(useTodoFilters).mock.results[0].value
  expect(vi.mocked(TodoFilters).mock.lastCall![0]).toEqual({
    filter: 'all',
    search: '',
    sort: 'newest',
    onFilterChange: filters.setFilter,
    onSearchChange: filters.setSearch,
    onSortChange: filters.setSort,
  })
  expect(vi.mocked(SuccessNotice).mock.lastCall![0]).toEqual({
    message: 'Hello',
  })
})

it('disables the header and the retry button while busy', () => {
  setup({ busy: true, queryError: new Error('Offline.') })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
  expect(vi.mocked(TodoList).mock.lastCall![0]).toMatchObject({
    hasTodos: true,
    failed: true,
    busy: true,
  })
})

it('disables the retry button while refetching', () => {
  setup({ isFetching: true, queryError: new Error('Offline.') })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('prefers the toggle error over the query error', () => {
  setup({
    queryError: new Error('Query failed.'),
    mutationError: new Error('Toggle failed.'),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Toggle failed.')
})

it('completes an active task and celebrates', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockResolvedValue({ ...todoFixture, completed: true }),
  })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Another task complete. Well done!'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: { completed: true },
  })
})

it('marks a completed task as active', async () => {
  const user = userEvent.setup()
  const completed = { ...todoFixture, completed: true }
  const { mutateAsync, notify } = setup({
    data: [completed],
    mutateAsync: vi.fn().mockResolvedValue(todoFixture),
  })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${completed.title}` }),
  )
  await waitFor(() =>
    expect(notify).toHaveBeenCalledWith('Task marked as active.'),
  )
  expect(mutateAsync).toHaveBeenCalledWith({
    id: completed.id,
    input: { completed: false },
  })
})

it('does not notify when toggling fails', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockRejectedValue(new Error('Toggle failed.')),
  })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while busy', async () => {
  const user = userEvent.setup()
  const { mutateAsync } = setup({ busy: true })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the header and closes it', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New task' }))
  expect(screen.getByRole('dialog', { name: 'Editor: new' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Close editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the list', async () => {
  const user = userEvent.setup()
  setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Create from list' }))
  expect(screen.getByRole('dialog', { name: 'Editor: new' })).toBeVisible()
})

it('edits a task, then closes the editor and shows the saved notice', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  )
  expect(
    screen.getByRole('dialog', { name: `Editor: ${todoFixture.title}` }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Save editor' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Changes saved.')
})

it('confirms a deletion and shows the deleted notice', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  expect(
    screen.getByRole('dialog', { name: `Delete: ${todoFixture.title}` }),
  ).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Confirm delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete confirmation without notifying', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  await user.click(screen.getByRole('button', { name: 'Close delete' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
