import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { completedRegularWeeks, sumFantasyPointsByPlayer } from '../lib/scoring';
import { PositionBadge } from '../components/PositionBadge';
import { LoadingState, ErrorState } from '../components/LoadingError';
import type { WeekStats } from '../api/types';

const POSITIONS = ['ALLE', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const PAGE_SIZE = 25;

function playerFullName(first: string, last: string): string {
  return `${first} ${last}`.trim();
}

export function TopPlayers() {
  const { league, teams, players, nflState, loading: leagueLoading, error: leagueError } = useLeagueData();
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [pointsByPlayer, setPointsByPlayer] = useState<Record<string, number>>({});
  const [position, setPosition] = useState('ALLE');
  const [showAll, setShowAll] = useState(false);

  const weeks = useMemo(() => completedRegularWeeks(nflState, league), [nflState, league]);

  useEffect(() => {
    if (leagueLoading || !league) return;
    if (weeks.length === 0) {
      setPointsByPlayer({});
      setStatsLoading(false);
      return;
    }

    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);

    Promise.all(weeks.map((w) => sleeper.getWeekStats(league.season, w)))
      .then((weekStatsList: WeekStats[]) => {
        if (cancelled) return;
        setPointsByPlayer(sumFantasyPointsByPlayer(weekStatsList, league.scoring_settings));
      })
      .catch((e) => {
        if (!cancelled) setStatsError(e instanceof Error ? e.message : 'Fehler beim Laden der Statistiken.');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, leagueLoading, weeks]);

  const rows = useMemo(() => {
    const playerToTeam = new Map<string, (typeof teams)[number]>();
    for (const team of teams) {
      for (const id of team.players) playerToTeam.set(id, team);
    }

    const usePoints = weeks.length > 0;

    const list = Array.from(playerToTeam.entries()).map(([id, team]) => {
      const player = players[id];
      return {
        id,
        player,
        team,
        points: pointsByPlayer[id] ?? 0,
        searchRank: player?.search_rank ?? Number.MAX_SAFE_INTEGER,
      };
    });

    list.sort((a, b) => (usePoints ? b.points - a.points : a.searchRank - b.searchRank));
    return list;
  }, [teams, players, pointsByPlayer, weeks.length]);

  const filtered = useMemo(() => {
    if (position === 'ALLE') return rows;
    return rows.filter((r) => (r.player?.fantasy_positions ?? []).includes(position));
  }, [rows, position]);

  const visible = showAll ? filtered : filtered.slice(0, PAGE_SIZE);
  const usePoints = weeks.length > 0;

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} />;

  return (
    <div className="page">
      <h1>Top Spieler in unserer Liga</h1>
      {!usePoints && (
        <div className="banner">
          Es wurde noch keine Woche der regulären Saison gespielt – Sortierung erfolgt daher nach
          Sleeper-Ranking statt nach Fantasy-Punkten.
        </div>
      )}

      <div className="toolbar">
        <div className="filter-group">
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              className={`chip ${position === pos ? 'chip-active' : ''}`}
              onClick={() => setPosition(pos)}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {statsLoading && <LoadingState label="Lade Spielstatistiken…" />}
      {statsError && <ErrorState message={statsError} />}

      {!statsLoading && !statsError && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Spieler</th>
                <th>Team</th>
                <th>Fantasy-Team</th>
                <th>{usePoints ? `Punkte (${weeks.length} Wo.)` : 'Sleeper-Rang'}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, i) => (
                <tr key={row.id}>
                  <td className="rank-cell">{i + 1}</td>
                  <td>
                    <div className="top-player-name">
                      <PositionBadge position={row.player?.position ?? undefined} />
                      {row.player ? playerFullName(row.player.first_name, row.player.last_name) : row.id}
                    </div>
                  </td>
                  <td>{row.player?.team ?? '—'}</td>
                  <td>
                    <Link to={`/team/${row.team.rosterId}`}>{row.team.teamName}</Link>
                  </td>
                  <td>{usePoints ? row.points.toFixed(2) : (row.player?.search_rank ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && filtered.length > PAGE_SIZE && (
            <button className="btn" onClick={() => setShowAll(true)}>
              Alle {filtered.length} anzeigen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
