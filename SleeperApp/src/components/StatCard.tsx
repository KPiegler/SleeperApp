import type { ReactNode } from 'react';

export function StatCard({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="fun-fact-card">
      <div className="fun-fact-header">
        <span className="fun-fact-emoji">{emoji}</span>
        <span className="fun-fact-title">{title}</span>
      </div>
      <div className="fun-fact-body">{children}</div>
    </div>
  );
}
