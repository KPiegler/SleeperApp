import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { initials } from '../lib/avatar';
import { maxLeagueWeek, weekLabel } from '../lib/weeks';
import { LoadingState, ErrorState } from '../components/LoadingError';
import type { SleeperMatchup, Team } from '../api/types';

const LIVE_POLL_INTERVAL_MS = 30_000;

function defaultWeek(
  nflState: ReturnType<typeof useLeagueData>['nflState'],
  league: ReturnType<typeof useLeagueData>['league'],
  maxWeek: number,
): number {
  if (!nflState || !league || nflState.season !== league.season) return 1;
  if (nflState.season_type === 'regular' || nflState.season_type === 'post') {
    return Math.min(Math.max(nflState.week, 1), maxWeek);
  }
  return 1;
}

function TeamBlock({ team, points, played, won }: { team: Team; points: number; played: boolean; won: boolean }) {
  return (
    <Link to={`/team/${team.rosterId}`} className={`matchup-team ${won ? 'matchup-team-won' : ''}`}>
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="table-avatar" />
      ) : (
        <div className="table-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <div className="matchup-team-info">
        <div className="team-name">{team.teamName}</div>
        <div className="owner-name">{team.ownerName}</div>
      </div>
      <div className="matchup-points">{played ? points.toFixed(2) : '–'}</div>
    </Link>
  );
}

export function Schedule() {
  const { teams, league, nflState, loading: leagueLoading, error: leagueError } = useLeagueData();
  const maxWeek = useMemo(() => maxLeagueWeek(league), [league]);
  const [week, setWeek] = useState<number | null>(null);
  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [matchLoading, setMatchLoading] = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const isLiveWeek =
    league?.season === nflState?.season &&
    (nflState?.season_type === 'regular' || nflState?.season_type === 'post') &&
    nflState?.week === week;

  // Beim Wechsel der Saison die gewählte Woche zurücksetzen, damit sie neu bestimmt wird.
  useEffect(() => {
    setWeek(null);
  }, [league?.league_id]);

  useEffect(() => {
    if (leagueLoading || week !== null) return;
    setWeek(defaultWeek(nflState, league, maxWeek));
  }, [leagueLoading, nflState, league, maxWeek, week]);

  useEffect(() => {
    if (!league || week === null) return;
    let cancelled = false;
    setMatchLoading(true);
    setMatchError(null);

    sleeper
      .getMatchups(league.league_id, week)
      .then((data) => {
        if (!cancelled) {
          setMatchups(data);
          setLastUpdated(new Date());
        }
      })
      .catch((e) => {
        if (!cancelled) setMatchError(e instanceof Error ? e.message : 'Fehler beim Laden des Spielplans.');
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, week]);

  // Während die gewählte Woche live läuft, Matchups im Hintergrund periodisch neu laden.
  useEffect(() => {
    if (!league || week === null || !isLiveWeek) return;

    const id = setInterval(() => {
      if (document.hidden) return;
      sleeper
        .getMatchups(league.league_id, week)
        .then((data) => {
          setMatchups(data);
          setLastUpdated(new Date());
        })
        .catch(() => {
          // Stiller Fehlschlag beim Live-Poll – der nächste Versuch folgt automatisch.
        });
    }, LIVE_POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [league, week, isLiveWeek]);

  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);

  const pairs = useMemo(() => {
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    const byes: SleeperMatchup[] = [];
    for (const m of matchups) {
      if (m.matchup_id == null) {
        byes.push(m);
        continue;
      }
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }
    return { matchupGroups: Array.from(byMatchupId.entries()), byes };
  }, [matchups]);

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} />;
  if (week === null) return <LoadingState />;

  const played = matchups.some((m) => m.points > 0);

  return (
    <div className="page">
      <h1>Spielplan</h1>

      <div className="week-picker">
        <button className="btn btn-ghost" onClick={() => setWeek((w) => Math.max(1, (w ?? 1) - 1))} disabled={week <= 1}>
          ← Vorherige
        </button>
        <select className="week-select" value={week} onChange={(e) => setWeek(Number(e.target.value))}>
          {Array.from({ length: maxWeek }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              {weekLabel(w, league)}
            </option>
          ))}
        </select>
        <button
          className="btn btn-ghost"
          onClick={() => setWeek((w) => Math.min(maxWeek, (w ?? 1) + 1))}
          disabled={week >= maxWeek}
        >
          Nächste →
        </button>
        {isLiveWeek && (
          <span className="live-badge">
            <span className="live-badge-dot" /> Live
          </span>
        )}
        {isLiveWeek && lastUpdated && (
          <span className="muted live-updated">
            Aktualisiert um {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      {matchLoading && <LoadingState label="Lade Matchups…" />}
      {matchError && <ErrorState message={matchError} />}

      {!matchLoading && !matchError && (
        <>
          {matchups.length === 0 && (
            <p className="muted">Für diese Woche sind noch keine Matchups verfügbar.</p>
          )}
          <div className="matchup-grid">
            {pairs.matchupGroups.map(([matchupId, entries]) => {
              const [a, b] = entries;
              const teamA = a ? teamByRosterId.get(a.roster_id) : undefined;
              const teamB = b ? teamByRosterId.get(b.roster_id) : undefined;
              if (!teamA) return null;

              const aWon = played && b ? a.points > b.points : false;
              const bWon = played && b ? b.points > a.points : false;

              return (
                <div className="matchup-card" key={matchupId}>
                  <TeamBlock team={teamA} points={a.points} played={played} won={aWon} />
                  <div className="matchup-vs">vs</div>
                  {teamB ? (
                    <TeamBlock team={teamB} points={b.points} played={played} won={bWon} />
                  ) : (
                    <div className="matchup-team matchup-bye">Spielfrei</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
