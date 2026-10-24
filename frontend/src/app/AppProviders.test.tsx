import { QueryClient, useQueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { useTheme } from 'styled-components'
import { expect, it, vi } from 'vitest'
import { GlobalStyles, theme } from '../design-system'
import { queryClient } from '../lib/queryClient'
import { AppProviders } from './AppProviders'

vi.mock('../design-system', () => import('../design-system/mocks'))

let seenClient: QueryClient | undefined
let seenTheme: unknown

function Probe() {
  seenClient = useQueryClient()
  seenTheme = useTheme()
  return <p>child content</p>
}

it('renders children with the default query client, theme and global styles', () => {
  render(
    <AppProviders>
      <Probe />
    </AppProviders>,
  )
  expect(screen.getByText('child content')).toBeVisible()
  expect(seenClient).toBe(queryClient)
  expect(seenTheme).toBe(theme)
  expect(GlobalStyles).toHaveBeenCalled()
})

it('provides a custom query client when one is passed', () => {
  const client = new QueryClient()
  render(
    <AppProviders client={client}>
      <Probe />
    </AppProviders>,
  )
  expect(seenClient).toBe(client)
})
