/** Placeholders shaped like the content they stand in for. */

export function SkeletonLine({ width = '100%', height = '0.85rem' }) {
  return <div className="skeleton" style={{ width, height }} />
}

export function TaskCardSkeleton() {
  return (
    <div className="task-card">
      <div className="task-card__top">
        <SkeletonLine width="62%" height="1.1rem" />
        <SkeletonLine width="3.5rem" height="1.1rem" />
      </div>
      <div className="stack stack--tight">
        <SkeletonLine />
        <SkeletonLine width="88%" />
        <SkeletonLine width="55%" />
      </div>
      <div className="row" style={{ gap: '0.4rem' }}>
        <SkeletonLine width="4.5rem" height="1.3rem" />
        <SkeletonLine width="5.5rem" height="1.3rem" />
      </div>
    </div>
  )
}

export function TaskGridSkeleton({ count = 6 }) {
  return (
    <div className="task-grid">
      {Array.from({ length: count }, (_, index) => (
        <TaskCardSkeleton key={index} />
      ))}
    </div>
  )
}

export function StatsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid--4">
      {Array.from({ length: count }, (_, index) => (
        <div className="stat" key={index}>
          <SkeletonLine width="45%" height="0.7rem" />
          <div style={{ marginTop: '0.6rem' }}>
            <SkeletonLine width="70%" height="1.5rem" />
          </div>
        </div>
      ))}
    </div>
  )
}
