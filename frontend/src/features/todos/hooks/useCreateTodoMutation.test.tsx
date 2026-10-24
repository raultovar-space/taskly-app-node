import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

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

it('creates the task and prepends it to the cached list', async () => {
  const existing: Todo = { ...todoFixture, id: 1 }
  const saved: Todo = { ...todoFixture, id: 2, title: 'New' }
  client.setQueryData(todoKeys.list, [existing])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(saved))
  expect(todosApi.create).toHaveBeenCalledWith(saved)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, existing])
})

it('replaces a cached copy of the same task instead of duplicating it', async () => {
  const stale: Todo = { ...todoFixture, title: 'Old' }
  client.setQueryData(todoKeys.list, [stale])
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('starts the list cache when nothing was cached yet', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() => result.current.mutateAsync(todoFixture))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('leaves the cache untouched when creation fails', async () => {
  client.setQueryData(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Boom'))
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(() =>
    expect(result.current.mutateAsync(todoFixture)).rejects.toThrow('Boom'),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
