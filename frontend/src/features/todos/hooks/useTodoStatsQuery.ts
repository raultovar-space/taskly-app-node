import { useQuery } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { toLocalDate } from '../utils/todos'

export function useTodoStatsQuery() {
  return useQuery({
    queryKey: todoKeys.stats,
    // Overdue is relative to the user's calendar day, not the server's.
    queryFn: ({ signal }) => todosApi.stats(toLocalDate(), signal),
  })
}
