import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: vi.fn(
    ({
      onSubmit,
      onCancel,
    }: {
      onSubmit: (input: TodoInput) => Promise<void>
      onCancel: () => void
    }) => (
      <>
        <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
        <button onClick={onCancel}>Cancel form</button>
      </>
    ),
  ),
}))

function mockMutations({
  create = vi.fn(),
  update = vi.fn(),
  createPending = false,
  updatePending = false,
  createError = null as Error | null,
  updateError = null as Error | null,
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: createPending,
    error: createError,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: updatePending,
    error: updateError,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  return { create, update }
}

function formProps() {
  return vi.mocked(TodoForm).mock.lastCall![0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('starts an empty form for a new task', () => {
  mockMutations()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(formProps()).toMatchObject({
    initial: undefined,
    busy: false,
    error: null,
  })
})

it('updates an existing task and reports the saved changes', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations({
    update: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(formProps().initial).toBe(todoFixture)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({
    id: todoFixture.id,
    input: todoFixture,
  })
  expect(create).not.toHaveBeenCalled()
})

it('keeps the editor open when saving fails', async () => {
  const user = userEvent.setup()
  const { update } = mockMutations({
    update: vi.fn().mockRejectedValue(new Error('Could not save.')),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
})

it('passes the error of the active mutation to the form', () => {
  mockMutations({
    createError: new Error('Create failed.'),
    updateError: new Error('Update failed.'),
  })
  const { rerender } = render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(formProps().error).toBe('Update failed.')
  rerender(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(formProps().error).toBe('Create failed.')
})

it('ignores submissions while the page is busy', async () => {
  const user = userEvent.setup()
  const { create } = mockMutations()
  const onSaved = vi.fn()
  render(<TodoEditor todo="new" busy onClose={vi.fn()} onSaved={onSaved} />)
  expect(formProps().busy).toBe(true)
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('ignores submissions while its own mutation is pending', async () => {
  const user = userEvent.setup()
  const { update } = mockMutations({ updatePending: true })
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(formProps().busy).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(update).not.toHaveBeenCalled()
})

it('closes from the form cancel action and the drawer', async () => {
  const user = userEvent.setup()
  mockMutations()
  const onClose = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={onClose} onSaved={vi.fn()} />,
  )
  await user.click(screen.getByRole('button', { name: 'Cancel form' }))
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})
