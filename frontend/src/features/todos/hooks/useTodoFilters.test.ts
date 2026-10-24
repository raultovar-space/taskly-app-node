import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const active: Todo = { ...todoFixture, id: 1, title: 'Write docs' }
const done: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Ship release',
  priority: 'high',
  completed: true,
}
const todos = [active, done]

it('starts showing all tasks, newest first, with an empty search', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([done, active])
})

it('applies the selected status filter', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('active'))
  expect(result.current.filter).toBe('active')
  expect(result.current.visible).toEqual([active])
})

it('applies the search text', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setSearch('docs'))
  expect(result.current.search).toBe('docs')
  expect(result.current.visible).toEqual([active])
})

it('applies the selected sort order', () => {
  const lowLatest: Todo = { ...active, id: 3, priority: 'low' }
  const { result } = renderHook(() => useTodoFilters([lowLatest, done]))
  expect(result.current.visible).toEqual([lowLatest, done])
  act(() => result.current.setSort('priority'))
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([done, lowLatest])
})

it('recomputes visible tasks when the input list changes', () => {
  const { result, rerender } = renderHook(({ list }) => useTodoFilters(list), {
    initialProps: { list: [active] },
  })
  rerender({ list: todos })
  expect(result.current.visible).toEqual([done, active])
})
