import '../animations.css';

/**
 * LoadingSkeleton Component
 * Displays a shimmering skeleton loader while content is loading
 */
export default function LoadingSkeleton({ width = '100%', height = '100%', borderRadius = 'var(--radius-sm)', style = {} }) {
  return (
    <div
      className="animate-shimmer"
      style={{
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

/**
 * CardSkeleton Component
 * Skeleton loader for card layouts
 */
export function CardSkeleton({ count = 1 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-secondary)', background: 'var(--surface-tertiary)' }}>
          <LoadingSkeleton width="60%" height="20px" style={{ marginBottom: '12px' }} />
          <LoadingSkeleton width="100%" height="16px" style={{ marginBottom: '8px' }} />
          <LoadingSkeleton width="80%" height="16px" />
        </div>
      ))}
    </div>
  );
}

/**
 * TableSkeleton Component
 * Skeleton loader for table layouts
 */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px', padding: '12px 16px' }}>
        {Array.from({ length: columns }).map((_, i) => (
          <LoadingSkeleton key={i} height="16px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '12px', padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-tertiary)' }}>
          {Array.from({ length: columns }).map((_, j) => (
            <LoadingSkeleton key={j} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}
