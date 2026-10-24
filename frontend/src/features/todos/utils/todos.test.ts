import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('breaks priority ties by the most recent id', () => {
    const other: Todo = { ...base, id: 2 }
    expect(selectTodos([base, other], 'all', '', 'priority')).toEqual([
      other,
      base,
    ])
  })

  it('keeps only completed tasks with the completed filter', () => {
    const done: Todo = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('matches the search against the title', () => {
    const other: Todo = { ...base, id: 2, title: 'Release notes' }
    expect(selectTodos([base, other], 'all', 'SPRINT', 'newest')).toEqual([
      base,
    ])
  })

  it('sorts by due date with undated tasks last and ties by id', () => {
    const early: Todo = { ...base, id: 2, due_date: '2026-10-05' }
    const late: Todo = { ...base, id: 3, due_date: '2026-10-20' }
    const lateTwin: Todo = { ...late, id: 4 }
    expect(
      selectTodos([base, late, early, lateTwin], 'all', '', 'due'),
    ).toEqual([early, lateTwin, late, base])
  })

  it('sorts newest first by creation date and ties by id', () => {
    const newer: Todo = { ...base, id: 2, created_at: '2026-10-02T12:00:00Z' }
    const twin: Todo = { ...base, id: 3 }
    expect(selectTodos([base, newer, twin], 'all', '', 'newest')).toEqual([
      newer,
      twin,
      base,
    ])
  })
})

describe('validateTodo', () => {
  const input: TodoInput = {
    title: 'Sprint plan',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task without a due date', () => {
    expect(validateTodo(input)).toEqual({})
  })

  it('accepts a valid calendar due date', () => {
    expect(validateTodo({ ...input, due_date: '2026-02-28' })).toEqual({})
  })

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('requires a title when it is %s', (_, title) => {
    expect(validateTodo({ ...input, title })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('limits the trimmed title to 120 characters', () => {
    expect(validateTodo({ ...input, title: ` ${'a'.repeat(120)} ` })).toEqual(
      {},
    )
    expect(validateTodo({ ...input, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('limits the trimmed description to 2000 characters', () => {
    expect(validateTodo({ ...input, description: 'a'.repeat(2000) })).toEqual(
      {},
    )
    expect(validateTodo({ ...input, description: 'a'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each([
    ['a wrong format', '15/10/2026'],
    ['an unparseable value', '2026-13-45'],
    ['a non-existent day', '2026-02-30'],
  ])('rejects a due date with %s', (_, due_date) => {
    expect(validateTodo({ ...input, due_date })).toEqual({
      due_date: 'Enter a valid date.',
    })
  })
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  it.each([
    ['an active task due before today', { due_date: '2026-10-14' }, true],
    ['an active task due today', { due_date: '2026-10-15' }, false],
    ['an active task due later', { due_date: '2026-10-16' }, false],
    [
      'a completed task due before today',
      { due_date: '2026-10-14', completed: true },
      false,
    ],
    ['a task without a due date', { due_date: null }, false],
  ])('returns the right value for %s', (_, overrides, expected) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T10:00:00'))
    expect(isOverdue({ ...base, ...overrides })).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as day, short month and year', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})

describe('priorityLabels', () => {
  it('provides a label for each priority', () => {
    expect(priorityLabels).toEqual({
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    })
  })
})
