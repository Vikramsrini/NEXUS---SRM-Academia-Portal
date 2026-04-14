import '../animations.css';

/**
 * Spinner Component
 * Displays a spinning loading indicator
 */
export default function Spinner({ size = 24, color = 'var(--accent)', style = {} }) {
  return (
    <div
      className="animate-spin"
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, size / 12)}px solid var(--border-primary)`,
        borderTopColor: color,
        borderRadius: '999px',
        ...style,
      }}
    />
  );
}

/**
 * CenteredSpinner Component
 * Spinner centered in a container
 */
export function CenteredSpinner({ size = 32, message = '' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '200px' }}>
      <Spinner size={size} />
      {message && <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{message}</p>}
    </div>
  );
}
