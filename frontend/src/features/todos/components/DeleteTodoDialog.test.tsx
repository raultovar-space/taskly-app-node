import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Button } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: new Error('Could not delete.'),
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

function mockDelete({
  mutateAsync = vi.fn(),
  isPending = false,
}: { mutateAsync?: ReturnType<typeof vi.fn>; isPending?: boolean } = {}) {
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending,
    error: null,
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  return mutateAsync
}

it('deletes the task and reports success', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  })
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  expect(mutateAsync).toHaveBeenCalledWith(todoFixture.id)
})

it('keeps the confirmation open when deletion fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete({
    mutateAsync: vi.fn().mockRejectedValue(new Error('Could not delete.')),
  })
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onDeleted).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
})

it('disables the actions while the page is busy', () => {
  mockDelete()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy
      onClose={vi.fn()}
      onDeleted={vi.fn()}
    />,
  )
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
})

it('ignores delete requests while the deletion is pending', () => {
  const mutateAsync = mockDelete({ isPending: true })
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled()
  // The button is disabled in the DOM, so invoke its handler directly to
  // verify the component also guards against a double submission.
  const deleteButton = vi
    .mocked(Button)
    .mock.calls.map(([props]) => props)
    .filter((props) => props.variant === 'danger')
    .pop()
  act(() => deleteButton?.onClick?.({} as never))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})
