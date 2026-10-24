import { Badge, Text } from '../../../design-system'
import type { TodoStats as Stats } from '../types'

export function TodoStats({ stats }: { stats?: Stats }) {
  if (!stats || stats.total === 0) return null
  return (
    <section className="row compact" aria-label="Task statistics">
      <Text as="span" muted size="small">
        {stats.total === 1 ? '1 task' : `${stats.total} tasks`}
      </Text>
      {stats.active > 0 ? (
        <Badge variant="info">{stats.active} to do</Badge>
      ) : (
        <Badge variant="success">All done!</Badge>
      )}
      <Badge variant="success">{stats.completed} completed</Badge>
      {stats.overdue > 0 && (
        <Badge variant="warning">{stats.overdue} overdue</Badge>
      )}
    </section>
  )
}
