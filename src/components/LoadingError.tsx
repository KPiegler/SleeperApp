export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="state-box">
      <div className="spinner" />
      <p>{label ?? 'Lade Daten von Sleeper…'}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-box state-error">
      <p>⚠️ {message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}
