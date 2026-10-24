import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { TodoStats as Stats } from '../types'
import { TodoStats } from './TodoStats'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

const stats: Stats = { total: 5, completed: 2, active: 3, overdue: 1 }

it('renders nothing while statistics are not loaded', () => {
  const { container } = render(<TodoStats />)
  expect(container).toBeEmptyDOMElement()
})

it('renders nothing when there are no tasks', () => {
  const { container } = render(
    <TodoStats stats={{ total: 0, completed: 0, active: 0, overdue: 0 }} />,
  )
  expect(container).toBeEmptyDOMElement()
})

it('shows the total, active, completed and overdue counts', () => {
  render(<TodoStats stats={stats} />)
  const section = screen.getByRole('region', { name: 'Task statistics' })
  expect(section).toHaveTextContent('5 tasks')
  expect(screen.getByText('3 to do')).toBeVisible()
  expect(screen.getByText('2 completed')).toBeVisible()
  expect(screen.getByText('1 overdue')).toBeVisible()
})

it('uses the singular form for a single task', () => {
  render(
    <TodoStats stats={{ total: 1, completed: 0, active: 1, overdue: 0 }} />,
  )
  expect(screen.getByText('1 task')).toBeVisible()
})

it('hides the overdue badge when nothing is overdue', () => {
  render(<TodoStats stats={{ ...stats, overdue: 0 }} />)
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})
