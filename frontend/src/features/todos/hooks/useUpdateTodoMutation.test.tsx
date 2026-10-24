import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

it('updates the task and replaces only that task in the cached list', async () => {
  const other: Todo = { ...todoFixture, id: 1 }
  const saved: Todo = { ...todoFixture, completed: true }
  client.setQueryData(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    }),
  )
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('keeps the list cache empty when nothing was cached', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync({ id: todoFixture.id, input: {} }))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cache untouched when the update fails', async () => {
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Boom'))
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(() =>
    expect(
      result.current.mutateAsync({ id: todoFixture.id, input: {} }),
    ).rejects.toThrow('Boom'),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
