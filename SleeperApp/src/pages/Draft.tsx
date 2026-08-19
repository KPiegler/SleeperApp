import { useEffect, useMemo, useState } from 'react';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { computeAdpValue, biggestSteals, biggestReaches } from '../lib/draftValue';
import { PositionBadge } from '../components/PositionBadge';
import { StatCard } from '../components/StatCard';
import { TeamPill } from '../components/TeamPill';
import { LoadingState, ErrorState } from '../components/LoadingError';
import type { DraftPick, PlayerLite } from '../api/types';

function pickPlayerName(pick: DraftPick): string {
  const m = pick.metadata;
  if (!m) return pick.player_id;
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || pick.player_id;
}

function ValueBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="muted">–</span>;
  if (value >= 15) return <span className="draft-value draft-value-steal">Steal +{value}</span>;
  if (value <= -15) return <span className="draft-value draft-value-reach">Reach {value}</span>;
  return <span className="draft-value draft-value-neutral">{value > 0 ? `+${value}` : value}</span>;
}

export function Draft() {
  const { league, teams, players, loading: leagueLoading, error: leagueError } = useLeagueData();
  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, PlayerLite>>({});
  const [round, setRound] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'round' | 'team'>('round');
  const [selectedRosterId, setSelectedRosterId] = useState<number | null>(null);

  useEffect(() => {
    if (leagueLoading) return;
    if (!league?.draft_id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    sleeper
      .getDraftPicks(league.draft_id)
      .then(async (data) => {
        if (cancelled) return;
        setPicks(data);
        const missing = data.map((p) => p.player_id).filter((id) => !players[id]);
        if (missing.length > 0) {
          const resolved = await getPlayersFor(missing);
          if (!cancelled) setExtraPlayers(resolved);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden des Drafts.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, leagueLoading, players]);

  useEffect(() => {
    if (selectedRosterId == null && teams.length > 0) {
      setSelectedRosterId(teams[0].rosterId);
    }
  }, [teams, selectedRosterId]);

  const allPlayers = useMemo(() => ({ ...players, ...extraPlayers }), [players, extraPlayers]);
  const values = useMemo(() => computeAdpValue(picks, allPlayers), [picks, allPlayers]);
  const steals = useMemo(() => biggestSteals(values, 3), [values]);
  const reaches = useMemo(() => biggestReaches(values, 3), [values]);
  const maxRound = useMemo(() => picks.reduce((max, p) => Math.max(max, p.round), 1), [picks]);
  const roundPicks = useMemo(
    () => values.filter((v) => v.pick.round === round).sort((a, b) => a.pick.pick_no - b.pick.pick_no),
    [values, round],
  );
  const teamPicks = useMemo(
    () =>
      values
        .filter((v) => v.pick.roster_id === selectedRosterId)
        .sort((a, b) => a.pick.pick_no - b.pick.pick_no),
    [values, selectedRosterId],
  );
  const teamBestValue = useMemo(() => {
    const withValue = teamPicks.filter((v) => v.value != null);
    if (withValue.length === 0) return null;
    return withValue.reduce((best, v) => ((v.value as number) > (best.value as number) ? v : best));
  }, [teamPicks]);
  const teamWorstValue = useMemo(() => {
    const withValue = teamPicks.filter((v) => v.value != null);
    if (withValue.length === 0) return null;
    return withValue.reduce((worst, v) => ((v.value as number) < (worst.value as number) ? v : worst));
  }, [teamPicks]);
  const visiblePicks = viewMode === 'round' ? roundPicks : teamPicks;

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} />;

  return (
    <div className="page">
      <h1>Draft-Rückblick</h1>

      {!league?.draft_id && <p className="muted">Für diese Liga wurde kein Draft gefunden.</p>}
      {loading && league?.draft_id && <LoadingState label="Lade Draft…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && picks.length > 0 && (
        <>
          <p className="muted playoff-picture-note">
            Bewertung auf Basis des Sleeper-Vorsaison-Rankings (ADP-Näherung): je später ein hoch eingeschätzter
            Spieler gepickt wurde, desto größer der Steal.
          </p>

          <div className="fun-fact-grid">
            {steals[0] && (
              <StatCard emoji="🎯" title="Größter Steal">
                <div className="fun-fact-headline">
                  <PositionBadge position={steals[0].pick.metadata?.position} />
                  {pickPlayerName(steals[0].pick)}
                  <span className="fun-fact-points">+{steals[0].value}</span>
                </div>
                <div className="fun-fact-sub">
                  Pick {steals[0].pick.pick_no} (Runde {steals[0].pick.round}) von{' '}
                  <TeamPill team={teamByRosterId.get(steals[0].pick.roster_id)} /> · Sleeper-Rang{' '}
                  {steals[0].searchRank}
                </div>
              </StatCard>
            )}
            {reaches[0] && (
              <StatCard emoji="😬" title="Größter Reach">
                <div className="fun-fact-headline">
                  <PositionBadge position={reaches[0].pick.metadata?.position} />
                  {pickPlayerName(reaches[0].pick)}
                  <span className="fun-fact-points">{reaches[0].value}</span>
                </div>
                <div className="fun-fact-sub">
                  Pick {reaches[0].pick.pick_no} (Runde {reaches[0].pick.round}) von{' '}
                  <TeamPill team={teamByRosterId.get(reaches[0].pick.roster_id)} /> · Sleeper-Rang{' '}
                  {reaches[0].searchRank}
                </div>
              </StatCard>
            )}
            {(steals.length > 1 || reaches.length > 1) && (
              <div className="fun-fact-card">
                <div className="fun-fact-header">
                  <span className="fun-fact-emoji">📋</span>
                  <span className="fun-fact-title">Weitere Steals &amp; Reaches</span>
                </div>
                <ul className="waiver-list">
                  {steals.slice(1).map((v) => (
                    <li key={`steal-${v.pick.pick_no}`} className="waiver-list-row">
                      <div className="waiver-list-top">
                        <PositionBadge position={v.pick.metadata?.position} />
                        <span className="waiver-list-name">{pickPlayerName(v.pick)}</span>
                        <ValueBadge value={v.value} />
                      </div>
                      <TeamPill team={teamByRosterId.get(v.pick.roster_id)} />
                    </li>
                  ))}
                  {reaches.slice(1).map((v) => (
                    <li key={`reach-${v.pick.pick_no}`} className="waiver-list-row">
                      <div className="waiver-list-top">
                        <PositionBadge position={v.pick.metadata?.position} />
                        <span className="waiver-list-name">{pickPlayerName(v.pick)}</span>
                        <ValueBadge value={v.value} />
                      </div>
                      <TeamPill team={teamByRosterId.get(v.pick.roster_id)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <h2>Draftboard</h2>
          <div className="toolbar">
            <div className="filter-group">
              <button
                className={`chip ${viewMode === 'round' ? 'chip-active' : ''}`}
                onClick={() => setViewMode('round')}
              >
                Nach Runde
              </button>
              <button
                className={`chip ${viewMode === 'team' ? 'chip-active' : ''}`}
                onClick={() => setViewMode('team')}
              >
                Nach Team
              </button>
            </div>
          </div>

          {viewMode === 'round' && (
            <div className="week-picker">
              <button
                className="btn btn-ghost"
                onClick={() => setRound((r) => Math.max(1, r - 1))}
                disabled={round <= 1}
              >
                ← Runde zurück
              </button>
              <select className="week-select" value={round} onChange={(e) => setRound(Number(e.target.value))}>
                {Array.from({ length: maxRound }, (_, i) => i + 1).map((r) => (
                  <option key={r} value={r}>
                    Runde {r}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-ghost"
                onClick={() => setRound((r) => Math.min(maxRound, r + 1))}
                disabled={round >= maxRound}
              >
                Runde vor →
              </button>
            </div>
          )}

          {viewMode === 'team' && (
            <>
              <div className="week-picker">
                <select
                  className="week-select"
                  value={selectedRosterId ?? ''}
                  onChange={(e) => setSelectedRosterId(Number(e.target.value))}
                >
                  {teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName}
                    </option>
                  ))}
                </select>
              </div>

              {(teamBestValue || teamWorstValue) && (
                <div className="fun-fact-grid">
                  {teamBestValue && (
                    <StatCard emoji="🎯" title="Bester Pick des Teams">
                      <div className="fun-fact-headline">
                        <PositionBadge position={teamBestValue.pick.metadata?.position} />
                        {pickPlayerName(teamBestValue.pick)}
                        <ValueBadge value={teamBestValue.value} />
                      </div>
                      <div className="fun-fact-sub">
                        Pick {teamBestValue.pick.pick_no} (Runde {teamBestValue.pick.round}) · Sleeper-Rang{' '}
                        {teamBestValue.searchRank}
                      </div>
                    </StatCard>
                  )}
                  {teamWorstValue && (
                    <StatCard emoji="😬" title="Schwächster Pick des Teams">
                      <div className="fun-fact-headline">
                        <PositionBadge position={teamWorstValue.pick.metadata?.position} />
                        {pickPlayerName(teamWorstValue.pick)}
                        <ValueBadge value={teamWorstValue.value} />
                      </div>
                      <div className="fun-fact-sub">
                        Pick {teamWorstValue.pick.pick_no} (Runde {teamWorstValue.pick.round}) · Sleeper-Rang{' '}
                        {teamWorstValue.searchRank}
                      </div>
                    </StatCard>
                  )}
                </div>
              )}
            </>
          )}

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pick</th>
                  {viewMode === 'round' ? <th>Team</th> : <th>Runde</th>}
                  <th>Spieler</th>
                  <th>Sleeper-Rang</th>
                  <th>Wert</th>
                </tr>
              </thead>
              <tbody>
                {visiblePicks.map((v) => (
                  <tr key={v.pick.pick_no}>
                    <td className="rank-cell">{v.pick.pick_no}</td>
                    {viewMode === 'round' ? (
                      <td>
                        <TeamPill team={teamByRosterId.get(v.pick.roster_id)} />
                      </td>
                    ) : (
                      <td>{v.pick.round}</td>
                    )}
                    <td>
                      <div className="top-player-name">
                        <PositionBadge position={v.pick.metadata?.position} />
                        {pickPlayerName(v.pick)}
                        {v.pick.metadata?.team && <span className="muted"> · {v.pick.metadata.team}</span>}
                      </div>
                    </td>
                    <td>{v.searchRank ?? '—'}</td>
                    <td>
                      <ValueBadge value={v.value} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
