import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { beforeEach, expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
)

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

function useHarness(mutationKey: readonly string[]) {
  const resolve = useRef<() => void>(() => {})
  const mutation = useMutation({
    mutationKey,
    mutationFn: () =>
      new Promise<void>((done) => {
        resolve.current = done
      }),
  })
  return { busy: useTodosBusy(), mutation, finish: () => resolve.current() }
}

it('is not busy when no mutation is running', () => {
  const { result } = renderHook(() => useTodosBusy(), { wrapper })
  expect(result.current).toBe(false)
})

it.each([[todoKeys.create], [todoKeys.update], [todoKeys.delete]])(
  'is busy while a %j mutation is pending',
  async (key) => {
    const { result } = renderHook(() => useHarness(key), { wrapper })
    act(() => result.current.mutation.mutate())
    await waitFor(() => expect(result.current.busy).toBe(true))
    act(() => result.current.finish())
    await waitFor(() => expect(result.current.busy).toBe(false))
  },
)

it('ignores mutations outside the todos key', async () => {
  const { result } = renderHook(() => useHarness(['profile', 'update']), {
    wrapper,
  })
  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
})
