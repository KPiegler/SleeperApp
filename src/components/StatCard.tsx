import type { ReactNode } from 'react';

export function StatCard({
  emoji,
  title,
  children,
  placeholder = false,
}: {
  emoji: string;
  title: string;
  children: ReactNode;
  placeholder?: boolean;
}) {
  return (
    <div className={`fun-fact-card${placeholder ? ' fun-fact-card-placeholder' : ''}`}>
      <div className="fun-fact-header">
        <span className="fun-fact-emoji">{emoji}</span>
        <span className="fun-fact-title">{title}</span>
        {placeholder && <span className="fun-fact-placeholder-tag">Beispiel</span>}
      </div>
      <div className="fun-fact-body">{children}</div>
    </div>
  );
}
