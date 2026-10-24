import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: vi.fn(() => <p>Empty task list</p>),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      <button disabled={busy} onClick={onToggle}>
        Toggle {todo.title}
      </button>
      <button disabled={busy} onClick={onEdit}>
        Edit {todo.title}
      </button>
      <button disabled={busy} onClick={onDelete}>
        Delete {todo.title}
      </button>
    </li>
  ),
}))

const secondTodo: Todo = { ...todoFixture, id: 8, title: 'Write the report' }

function makeProps() {
  return {
    todos: [] as Todo[],
    hasTodos: false,
    loading: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('shows loading feedback before showing an empty list', () => {
  const props = makeProps()
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows an unavailable message when loading failed and no tasks are cached', () => {
  render(<TodoList {...makeProps()} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch failed', () => {
  render(<TodoList {...makeProps()} todos={[todoFixture]} hasTodos failed />)
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('listitem')).toHaveTextContent(todoFixture.title)
})

it('renders every task and forwards actions with the matching task', async () => {
  const user = userEvent.setup()
  const props = makeProps()
  render(<TodoList {...props} todos={[todoFixture, secondTodo]} hasTodos />)
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${secondTodo.title}` }),
  )
  await user.click(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  )
  await user.click(
    screen.getByRole('button', { name: `Delete ${secondTodo.title}` }),
  )
  expect(props.onToggle).toHaveBeenCalledExactlyOnceWith(secondTodo)
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith(todoFixture)
  expect(props.onDelete).toHaveBeenCalledExactlyOnceWith(secondTodo)
  expect(TodoEmptyState).not.toHaveBeenCalled()
})

it('passes the busy state to each task', () => {
  render(<TodoList {...makeProps()} todos={[todoFixture]} hasTodos busy />)
  expect(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('passes filter context, busy state and create handler to the empty state', () => {
  const props = makeProps()
  render(<TodoList {...props} hasTodos busy />)
  expect(vi.mocked(TodoEmptyState).mock.calls[0][0]).toEqual({
    hasTodos: true,
    disabled: true,
    onCreate: props.onCreate,
  })
})
