import { useEffect, useMemo, useState } from 'react';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { completedRegularWeeks } from '../lib/scoring';
import { PositionBadge } from '../components/PositionBadge';
import { TeamPill } from '../components/TeamPill';
import { LoadingState, ErrorState } from '../components/LoadingError';
import type { PlayerLite, SleeperTransaction } from '../api/types';

type TypeFilter = 'all' | 'trade' | 'waiver' | 'free_agent';

const TYPE_INFO: Record<string, { label: string; emoji: string; className: string }> = {
  trade: { label: 'Trade', emoji: '🔁', className: 'txn-type-trade' },
  waiver: { label: 'Waiver', emoji: '📝', className: 'txn-type-waiver' },
  free_agent: { label: 'Free Agent', emoji: '🆓', className: 'txn-type-free-agent' },
  commissioner: { label: 'Commissioner', emoji: '🛠️', className: 'txn-type-commissioner' },
};

function typeInfo(type: string) {
  return TYPE_INFO[type] ?? { label: type, emoji: '📋', className: 'txn-type-other' };
}

function groupByRoster(record: Record<string, number> | null): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!record) return map;
  for (const [playerId, rosterId] of Object.entries(record)) {
    const list = map.get(rosterId) ?? [];
    list.push(playerId);
    map.set(rosterId, list);
  }
  return map;
}

interface Txn extends SleeperTransaction {
  week: number;
}

export function PlayerHistory() {
  const { league, teams, players, nflState, loading: leagueLoading, error: leagueError } = useLeagueData();
  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);
  const weeks = useMemo(() => completedRegularWeeks(nflState, league), [nflState, league]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Txn[]>([]);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, PlayerLite>>({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [teamFilter, setTeamFilter] = useState<number | 'all'>('all');

  const allPlayers = useMemo(() => ({ ...players, ...extraPlayers }), [players, extraPlayers]);

  useEffect(() => {
    if (leagueLoading || !league) return;
    if (weeks.length === 0) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(weeks.map((w) => sleeper.getTransactions(league.league_id, w)))
      .then(async (results) => {
        if (cancelled) return;
        const flat: Txn[] = [];
        weeks.forEach((w, i) => {
          for (const t of results[i]) {
            if (t.status !== 'complete') continue;
            flat.push({ ...t, week: w });
          }
        });
        flat.sort((a, b) => b.created - a.created);
        setTransactions(flat);

        const missingIds = new Set<string>();
        for (const t of flat) {
          for (const id of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) {
            if (!players[id]) missingIds.add(id);
          }
        }
        if (missingIds.size > 0) {
          const resolved = await getPlayersFor(Array.from(missingIds));
          if (!cancelled) setExtraPlayers(resolved);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden der Spieler-Historie.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, leagueLoading, weeks, players]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (teamFilter !== 'all' && !t.roster_ids.includes(teamFilter)) return false;
      return true;
    });
  }, [transactions, typeFilter, teamFilter]);

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} />;

  return (
    <div className="page">
      <h1>Spieler-Historie</h1>
      <p className="muted playoff-picture-note">
        Alle Zu- und Abgänge nach dem Draft – Trades, Waiver-Claims und Free-Agent-Moves in chronologischer
        Reihenfolge.
      </p>

      {weeks.length === 0 && (
        <div className="banner">
          Es wurde noch keine Woche der regulären Saison gespielt – hier gibt's noch keine Roster-Bewegungen zu
          zeigen.
        </div>
      )}

      {loading && weeks.length > 0 && <LoadingState label="Lade Transaktionen…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && weeks.length > 0 && (
        <>
          <div className="toolbar">
            <div className="filter-group">
              <button
                className={`chip ${typeFilter === 'all' ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                Alle
              </button>
              <button
                className={`chip ${typeFilter === 'trade' ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter('trade')}
              >
                🔁 Trades
              </button>
              <button
                className={`chip ${typeFilter === 'waiver' ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter('waiver')}
              >
                📝 Waiver
              </button>
              <button
                className={`chip ${typeFilter === 'free_agent' ? 'chip-active' : ''}`}
                onClick={() => setTypeFilter('free_agent')}
              >
                🆓 Free Agent
              </button>
            </div>
          </div>

          <div className="week-picker">
            <select
              className="week-select"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            >
              <option value="all">Alle Teams</option>
              {teams.map((t) => (
                <option key={t.rosterId} value={t.rosterId}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <p className="muted">Keine Transaktionen für diese Auswahl gefunden.</p>
          ) : (
            <div className="trade-list">
              {filtered.map((t) => {
                const info = typeInfo(t.type);
                const addsByRoster = groupByRoster(t.adds);
                const dropsByRoster = groupByRoster(t.drops);
                const rosterIds = Array.from(
                  new Set([...addsByRoster.keys(), ...dropsByRoster.keys(), ...t.roster_ids]),
                );

                return (
                  <div className="trade-card" key={t.transaction_id}>
                    <div className="txn-card-header">
                      <span className={`txn-type-badge ${info.className}`}>
                        {info.emoji} {info.label}
                      </span>
                      <span className="muted trade-card-week">
                        {new Date(t.created).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}{' '}
                        · Woche {t.week}
                      </span>
                    </div>
                    <div className="trade-card-sides">
                      {rosterIds.map((rosterId) => {
                        const added = addsByRoster.get(rosterId) ?? [];
                        const dropped = dropsByRoster.get(rosterId) ?? [];
                        if (added.length === 0 && dropped.length === 0) return null;
                        return (
                          <div className="trade-side" key={rosterId}>
                            <TeamPill team={teamByRosterId.get(rosterId)} />
                            {added.map((id) => {
                              const p = allPlayers[id];
                              return (
                                <span className="txn-player txn-player-add" key={`add-${id}`}>
                                  {p && <PositionBadge position={p.position ?? undefined} />}
                                  {p ? `${p.first_name} ${p.last_name}` : id}
                                </span>
                              );
                            })}
                            {dropped.map((id) => {
                              const p = allPlayers[id];
                              return (
                                <span className="txn-player txn-player-drop" key={`drop-${id}`}>
                                  {p && <PositionBadge position={p.position ?? undefined} />}
                                  {p ? `${p.first_name} ${p.last_name}` : id}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
