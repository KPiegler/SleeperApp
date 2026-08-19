const COLORS: Record<string, string> = {
  QB: '#ef4444',
  RB: '#22c55e',
  WR: '#3b82f6',
  TE: '#f59e0b',
  K: '#a855f7',
  DEF: '#64748b',
  FLEX: '#94a3b8',
};

export function PositionBadge({ position }: { position: string | null | undefined }) {
  const pos = position ?? '?';
  const color = COLORS[pos] ?? '#64748b';
  return (
    <span className="position-badge" style={{ backgroundColor: color }}>
      {pos}
    </span>
  );
}
