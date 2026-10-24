import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('sends only writable task fields when updating a task', async () => {
  const saved = { ...todoFixture, completed: true }
  vi.mocked(request).mockResolvedValue(saved)
  await expect(
    todosApi.update(todoFixture.id, { ...todoFixture, completed: true }),
  ).resolves.toEqual(saved)
  expect(request).toHaveBeenCalledWith(`/todos/${todoFixture.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: true,
    }),
  })
})

it('omits fields absent from a partial update', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await todosApi.update(3, { completed: true })
  expect(request).toHaveBeenCalledWith('/todos/3', {
    method: 'PATCH',
    body: JSON.stringify({ completed: true }),
  })
})

it('fetches statistics for the given day with the abort signal', async () => {
  const signal = new AbortController().signal
  const stats = { total: 3, completed: 1, active: 2, overdue: 1 }
  vi.mocked(request).mockResolvedValue(stats)
  await expect(todosApi.stats('2026-10-15', signal)).resolves.toEqual(stats)
  expect(request).toHaveBeenCalledWith('/todos/stats?today=2026-10-15', {
    signal,
  })
})

it('encodes the day in the statistics query string', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await todosApi.stats('2026-10-15&x=1')
  expect(request).toHaveBeenCalledWith(
    '/todos/stats?today=2026-10-15%26x%3D1',
    { signal: undefined },
  )
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(5)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith('/todos/5', { method: 'DELETE' })
})
