import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
})

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

it('prefixes the path with /api and returns the parsed JSON body', async () => {
  fetchMock.mockResolvedValue(jsonResponse([{ id: 1 }]))
  await expect(request('/todos')).resolves.toEqual([{ id: 1 }])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('merges custom headers and forwards the request options', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}))
  await request('/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'X-Trace': 'abc' },
  })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    body: '{}',
    headers: { 'Content-Type': 'application/json', 'X-Trace': 'abc' },
  })
})

it('resolves to undefined for a 204 response', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(request('/todos/1', { method: 'DELETE' })).resolves.toBe(
    undefined,
  )
})

it('reports a validation message for a 422 response', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: [] }, 422))
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('uses a string detail from the error body', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: 'Task not found' }, 404))
  await expect(request('/todos/9')).rejects.toThrow('Task not found')
})

it('falls back to a generic message when detail is not a string', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ detail: { code: 1 } }, 500))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('falls back to a generic message when the error body is not JSON', async () => {
  fetchMock.mockResolvedValue(new Response('oops', { status: 500 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('reports a connection message when fetch fails', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})
