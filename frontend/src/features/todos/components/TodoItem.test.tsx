import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Badge } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

function renderItem(todo: Todo, busy = false) {
  const handlers = { onEdit: vi.fn(), onToggle: vi.fn(), onDelete: vi.fn() }
  render(<TodoItem todo={todo} busy={busy} {...handlers} />)
  return handlers
}

function badgeVariants() {
  return vi.mocked(Badge).mock.calls.map(([props]) => props.variant)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('shows the id and omits the description and due date when absent', () => {
  renderItem(todoFixture)
  expect(screen.getByText(`#${todoFixture.id}`)).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(badgeVariants()).toEqual(['info'])
})

it('shows the description when present', () => {
  renderItem({ ...todoFixture, description: 'Slides and a live walkthrough' })
  expect(screen.getByText('Slides and a live walkthrough')).toBeVisible()
})

it('shows a completed task with a mark-as-active checkbox', async () => {
  const user = userEvent.setup()
  const todo = { ...todoFixture, completed: true, priority: 'high' as const }
  const { onToggle } = renderItem(todo)
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todo.title}`,
  })
  expect(checkbox).toBeChecked()
  await user.click(checkbox)
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(badgeVariants()).toEqual(['success'])
})

it('completes an active task through the checkbox', async () => {
  const user = userEvent.setup()
  const { onToggle } = renderItem(todoFixture)
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
})

it('forwards delete requests', async () => {
  const user = userEvent.setup()
  const { onDelete, onEdit } = renderItem(todoFixture)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('shows an upcoming due date as a neutral badge', () => {
  renderItem({ ...todoFixture, due_date: '2026-10-20' })
  expect(screen.getByText('20 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(badgeVariants()).toEqual(['info', 'neutral'])
})

it('flags a past due date on an active task as overdue', () => {
  renderItem({ ...todoFixture, due_date: '2026-10-10' })
  expect(screen.getByText(/10 Oct 2026/)).toHaveTextContent(
    '10 Oct 2026 · overdue',
  )
  expect(badgeVariants()).toEqual(['info', 'warning'])
})

it('does not flag a past due date on a completed task', () => {
  renderItem({ ...todoFixture, completed: true, due_date: '2026-10-10' })
  expect(screen.getByText('10 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(badgeVariants()).toEqual(['success', 'neutral'])
})

it('disables every action while busy', () => {
  renderItem(todoFixture, true)
  expect(screen.getByRole('checkbox')).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})
