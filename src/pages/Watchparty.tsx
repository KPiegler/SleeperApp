import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { espn } from '../api/espn';
import { completedRegularWeeks, computeFantasyPoints } from '../lib/scoring';
import {
  playerWeeklyPoints,
  meanVariance,
  projectSide,
  winProbability,
  buildProjections,
  applyPositionVarianceFloor,
} from '../lib/winProbability';
import { buildLiveGameIndex, isTeamLive } from '../lib/liveGames';
import { espnTeamToSleeperTeam } from '../lib/nflTeamAliases';
import { extractBigPlays, estimatePlayPoints } from '../lib/bigPlays';
import { initials } from '../lib/avatar';
import { LoadingState, ErrorState } from '../components/LoadingError';
import { PlayerCard } from '../components/PlayerCard';
import { BigPlayTicker } from '../components/BigPlayTicker';
import { TouchdownOverlay } from '../components/TouchdownOverlay';
import { InfoModal } from '../components/InfoModal';
import type { BigPlay } from '../lib/bigPlays';
import type { MeanVariance, ProjectionMethod } from '../lib/winProbability';
import type { EspnScoreboard } from '../api/espn';
import type { SleeperMatchup, Team } from '../api/types';

const SLEEPER_POLL_INTERVAL_MS = 30_000;
const ESPN_POLL_INTERVAL_MS = 20_000;
const TICKER_ITEM_LIFETIME_MS = 20_000;
const TICKER_MAX_ITEMS = 2;

// Umschaltbar für eine spätere UI-Option - 'season_average' reaktiviert die alte Heuristik
// (grober Saison-Durchschnitt statt echter Sleeper-Wochenprojektion).
const PROJECTION_METHOD: ProjectionMethod = 'sleeper_projection';

function formatPoints(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MatchupTeamBlock({
  team,
  points,
  played,
  won,
  projectedTotal,
  reverse,
}: {
  team: Team;
  points: number;
  played: boolean;
  won: boolean;
  projectedTotal: number;
  reverse?: boolean;
}) {
  return (
    <Link
      to={`/team/${team.rosterId}`}
      className={`matchup-team ${won ? 'matchup-team-won' : ''} ${reverse ? 'matchup-team-reverse' : ''}`}
    >
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="table-avatar" />
      ) : (
        <div className="table-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <div className="matchup-team-info">
        <div className="team-name">{team.teamName}</div>
        <div className="owner-name">
          <span className="matchup-team-projection">Proj. {formatPoints(projectedTotal)}</span>
          <span className="matchup-team-owner">{team.ownerName}</span>
        </div>
      </div>
      <div className="matchup-points">{played ? formatPoints(points) : '–'}</div>
    </Link>
  );
}

export function Watchparty() {
  const { teams, players, league, nflState, loading: leagueLoading, error: leagueError, reload } = useLeagueData();

  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [matchLoading, setMatchLoading] = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [seasonStats, setSeasonStats] = useState<Map<string, MeanVariance>>(new Map());
  const [projectedPoints, setProjectedPoints] = useState<Map<string, number>>(new Map());
  const [scoreboard, setScoreboard] = useState<EspnScoreboard | null>(null);
  const [ticker, setTicker] = useState<BigPlay[]>([]);
  const [touchdownAlert, setTouchdownAlert] = useState<BigPlay | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [visibleMatchupIds, setVisibleMatchupIds] = useState<Set<number> | null>(null);
  const [showMatchupPicker, setShowMatchupPicker] = useState(false);

  const seenPlayIds = useRef<Set<string>>(new Set());
  const settledEvents = useRef<Set<string>>(new Set());
  const removalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const week = nflState?.season === league?.season ? nflState?.week ?? null : null;
  const isLiveWeek =
    league?.season === nflState?.season &&
    (nflState?.season_type === 'regular' || nflState?.season_type === 'post');

  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);
  const teamByPlayerId = useMemo(() => {
    const map = new Map<string, Team>();
    for (const team of teams) {
      for (const id of team.players) map.set(id, team);
    }
    return map;
  }, [teams]);
  // Nur Spieler, die in dieser Woche in einem aktuell SICHTBAREN Matchup tatsächlich STARTEN - Big
  // Plays sollen sich weder auf Bankspieler noch auf ausgeblendete Matchups beziehen.
  const startingPlayerIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of matchups) {
      if (visibleMatchupIds !== null && (m.matchup_id == null || !visibleMatchupIds.has(m.matchup_id))) continue;
      for (const id of m.starters ?? []) {
        if (id && id !== '0') set.add(id);
      }
    }
    return set;
  }, [matchups, visibleMatchupIds]);
  const relevantTeams = useMemo(() => {
    const set = new Set<string>();
    for (const id of startingPlayerIds) {
      const team = players[id]?.team;
      if (team) set.add(team);
    }
    return set;
  }, [startingPlayerIds, players]);
  const liveIndex = useMemo(() => (scoreboard ? buildLiveGameIndex(scoreboard) : new Map()), [scoreboard]);

  const isLocked = useMemo(
    () => (playerId: string) => {
      const team = players[playerId]?.team;
      const info = team ? liveIndex.get(team) : undefined;
      return !info || info.state === 'post';
    },
    [players, liveIndex],
  );

  // Sleeper-Matchups: initial laden + alle 30s neu, solange die aktuelle Woche läuft.
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
        if (!cancelled) setMatchError(e instanceof Error ? e.message : 'Fehler beim Laden der Matchups.');
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, week, retryKey]);

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
          // Stiller Fehlschlag beim Live-Poll - der nächste Versuch folgt automatisch.
        });
    }, SLEEPER_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [league, week, isLiveWeek]);

  // Saison-Durchschnitt/Varianz pro Spieler - einmalig als Basis für die Gewinnwahrscheinlichkeit.
  useEffect(() => {
    if (!league) return;
    let cancelled = false;
    const weeks = completedRegularWeeks(nflState, league);
    if (weeks.length === 0) {
      setSeasonStats(new Map());
      return;
    }

    Promise.all(weeks.map((w) => sleeper.getWeekStats(league.season, w)))
      .then((weekStatsList) => {
        if (cancelled) return;
        const allPlayerIds = new Set<string>();
        for (const t of teams) for (const id of t.players) allPlayerIds.add(id);

        const map = new Map<string, MeanVariance>();
        for (const id of allPlayerIds) {
          map.set(id, meanVariance(playerWeeklyPoints(id, weekStatsList, league.scoring_settings)));
        }

        const positionByPlayer = new Map<string, string | null | undefined>();
        for (const id of allPlayerIds) positionByPlayer.set(id, players[id]?.position);

        setSeasonStats(applyPositionVarianceFloor(map, positionByPlayer));
      })
      .catch(() => {
        if (!cancelled) setSeasonStats(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [league, nflState, teams, players]);

  // Sleeper-Wochenprojektion für die aktuelle Woche - echte, wochenspezifische Punkteschätzung
  // (Gegner/Verletzungsstatus etc. bereits von Sleeper eingerechnet), einmalig pro Woche geladen.
  useEffect(() => {
    if (!league || week === null) return;
    let cancelled = false;

    sleeper
      .getProjections(league.season, week)
      .then((projections) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const p of projections) {
          map.set(p.player_id, computeFantasyPoints(p.stats ?? undefined, league.scoring_settings));
        }
        setProjectedPoints(map);
      })
      .catch(() => {
        if (!cancelled) setProjectedPoints(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [league, week]);

  // ESPN-Scoreboard: Live-Status pro NFL-Team, Basis für "spielt gerade"-Highlight und Play-by-Play-Polling.
  useEffect(() => {
    if (!isLiveWeek) return;
    let cancelled = false;

    const tick = () => {
      if (document.hidden) return;
      espn
        .getScoreboard()
        .then((data) => {
          if (!cancelled) setScoreboard(data);
        })
        .catch(() => {
          // Inoffizielle ESPN-API - ein Fehlschlag pausiert nur bis zum nächsten Tick.
        });
    };

    tick();
    const id = setInterval(tick, ESPN_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isLiveWeek]);

  // ESPN-Play-by-Play: nur für laufende Spiele mit mindestens einem in unserer Liga rostierten Spieler.
  useEffect(() => {
    if (!scoreboard || !league) return;
    let cancelled = false;

    const eventsToFetch = scoreboard.events.filter((event) => {
      const eventTeams = (event.competitions?.[0]?.competitors ?? []).map((c) =>
        espnTeamToSleeperTeam(c.team.abbreviation),
      );
      const touchesRoster = eventTeams.some((t) => relevantTeams.has(t));
      if (!touchesRoster) return false;
      if (event.status.type.state === 'in') return true;
      if (event.status.type.state === 'post' && !settledEvents.current.has(event.id)) return true;
      return false;
    });

    for (const event of eventsToFetch) {
      const eventTeams = (event.competitions?.[0]?.competitors ?? []).map((c) =>
        espnTeamToSleeperTeam(c.team.abbreviation),
      );
      const candidates = Object.entries(players)
        .filter(([id, p]) => p.team && eventTeams.includes(p.team) && startingPlayerIds.has(id))
        .map(([id, p]) => ({ id, firstName: p.first_name, lastName: p.last_name }));

      espn
        .getSummary(event.id)
        .then((summary) => {
          if (cancelled) return;
          if (event.status.type.state === 'post') settledEvents.current.add(event.id);

          const newPlays = extractBigPlays(event.id, summary).filter((p) => !seenPlayIds.current.has(p.id));
          if (newPlays.length === 0) return;

          for (const play of newPlays) {
            seenPlayIds.current.add(play.id);
            play.pointsByPlayerId = estimatePlayPoints(play, candidates, league.scoring_settings);
            play.matchedPlayerIds = Object.keys(play.pointsByPlayerId);
          }

          const newTouchdown = newPlays.find((p) => p.category === 'TD');
          if (newTouchdown) setTouchdownAlert(newTouchdown);

          setTicker((prev) => [...newPlays.reverse(), ...prev].slice(0, TICKER_MAX_ITEMS));

          for (const play of newPlays) {
            const timer = setTimeout(() => {
              removalTimers.current.delete(timer);
              setTicker((prev) => prev.filter((p) => p.id !== play.id));
            }, TICKER_ITEM_LIFETIME_MS);
            removalTimers.current.add(timer);
          }
        })
        .catch(() => {
          // Inoffizielle ESPN-API - ein Fehlschlag pausiert nur bis zum nächsten Tick.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [scoreboard, relevantTeams, players, league, startingPlayerIds]);

  useEffect(() => {
    return () => {
      for (const timer of removalTimers.current) clearTimeout(timer);
    };
  }, []);

  const projections = useMemo(
    () => buildProjections(seasonStats, projectedPoints, PROJECTION_METHOD),
    [seasonStats, projectedPoints],
  );

  const pairs = useMemo(() => {
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of matchups) {
      if (m.matchup_id == null) continue;
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }
    return Array.from(byMatchupId.entries());
  }, [matchups]);

  const visiblePairs = useMemo(
    () => (visibleMatchupIds === null ? pairs : pairs.filter(([matchupId]) => visibleMatchupIds.has(matchupId))),
    [pairs, visibleMatchupIds],
  );

  const toggleMatchupVisibility = (matchupId: number) => {
    setVisibleMatchupIds((prev) => {
      const base = prev ?? new Set(pairs.map(([id]) => id));
      const next = new Set(base);
      if (next.has(matchupId)) next.delete(matchupId);
      else next.add(matchupId);
      return next;
    });
  };

  const played = matchups.some((m) => m.points > 0);
  const anyGameLive = scoreboard?.events.some((e) => e.status.type.state === 'in') ?? false;

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} onRetry={reload} />;

  if (!isLiveWeek || week === null) {
    return (
      <div className="page">
        <h1>Live-Ticker</h1>
        <div className="banner">Der Live-Ticker funktioniert nur für die aktuell laufende Saison und Woche.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-title-row">
        <h1>Live-Ticker</h1>
        {pairs.length > 1 && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowMatchupPicker(true)}>
            Matchups auswählen
          </button>
        )}
      </div>

      {showMatchupPicker && (
        <InfoModal title="Matchups auswählen" onClose={() => setShowMatchupPicker(false)}>
          <div className="filter-group">
            <button
              type="button"
              className={`chip ${visibleMatchupIds === null ? 'chip-active' : ''}`}
              onClick={() => setVisibleMatchupIds(null)}
            >
              Alle
            </button>
            {pairs.map(([matchupId, entries]) => {
              const [a, b] = entries;
              const teamA = teamByRosterId.get(a.roster_id);
              const teamB = b ? teamByRosterId.get(b.roster_id) : undefined;
              const isVisible = visibleMatchupIds === null || visibleMatchupIds.has(matchupId);
              const label = teamB
                ? `${teamA?.teamName ?? '?'} vs ${teamB.teamName}`
                : `${teamA?.teamName ?? '?'} (Spielfrei)`;
              return (
                <button
                  key={matchupId}
                  type="button"
                  className={`chip ${isVisible ? 'chip-active' : ''}`}
                  onClick={() => toggleMatchupVisibility(matchupId)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </InfoModal>
      )}

      <div className="week-picker">
        <span className="live-badge">
          <span className="live-badge-dot" /> Live
        </span>
        {lastUpdated && (
          <span className="muted live-updated">
            Aktualisiert um{' '}
            {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>

      <p className="muted playoff-picture-note">
        Die Gewinnwahrscheinlichkeit ist eine Näherung, keine exakte Sleeper-eigene Berechnung.
        <button
          type="button"
          className="info-btn"
          onClick={() => setShowInfo(true)}
          aria-label="Wie wird die Gewinnwahrscheinlichkeit berechnet?"
        >
          i
        </button>{' '}
        Der Big-Play-Ticker stammt aus einer inoffiziellen ESPN-Quelle mit unscharfer Spieler-Zuordnung per
        Namens-Abgleich.
      </p>

      {showInfo && (
        <InfoModal title="Wie wird die Gewinnwahrscheinlichkeit berechnet?" onClose={() => setShowInfo(false)}>
          <p>Für jeden Starter einer Matchup-Seite wird ein Punkte-Schätzwert und eine Unsicherheit ermittelt:</p>
          <ul>
            <li>
              <strong>Spiel schon beendet:</strong> echte Live-Punkte zählen fix, keine Unsicherheit mehr.
            </li>
            <li>
              <strong>Spiel läuft noch oder hat nicht begonnen:</strong> Sleepers eigene Wochen-Projektion für
              diesen Spieler, umgerechnet auf das Scoring dieser Liga.
            </li>
          </ul>
          <p>
            Die Unsicherheit je Spieler kommt aus der Streuung seiner bisherigen Saison-Punkte. Damit ein Spieler
            mit wenig oder verzerrter Historie (z. B. gerade erst vom Bankspieler zum Starter geworden) nicht
            künstlich sicher wirkt, wird diese Streuung auf einen Mindestwert angehoben – den Durchschnitt der
            Streuung aller vergleichbaren Spieler derselben Position in der Liga.
          </p>
          <p>
            Die Gesamtpunkte beider Seiten (Summe aus echten + geschätzten Werten) werden über eine
            Normalverteilung verglichen, daraus ergibt sich die Prozentzahl.
          </p>
          <p>
            <strong>Bekannte Grenzen:</strong> keine Berücksichtigung von Zusammenhängen zwischen Spielern (z. B.
            QB und sein eigener Receiver), keine Anpassung der Unsicherheit während das Spiel läuft, und Sleepers
            eigenes Modell ist nicht öffentlich – exakte Übereinstimmung ist daher nicht zu erwarten.
          </p>
        </InfoModal>
      )}

      {!anyGameLive && <div className="banner">Aktuell läuft kein NFL-Spiel – Punkte werden trotzdem aktualisiert, sobald wieder gespielt wird.</div>}

      {touchdownAlert && (
        <TouchdownOverlay
          play={touchdownAlert}
          players={players}
          teamByPlayerId={teamByPlayerId}
          onDone={() => setTouchdownAlert(null)}
        />
      )}

      <BigPlayTicker plays={ticker} teamByPlayerId={teamByPlayerId} players={players} />

      {matchLoading && <LoadingState label="Lade Matchups…" />}
      {matchError && <ErrorState message={matchError} onRetry={() => setRetryKey((k) => k + 1)} />}

      {!matchLoading && !matchError && (
        <>
          {matchups.length === 0 && <p className="muted">Für diese Woche sind noch keine Matchups verfügbar.</p>}

          <div className="matchup-grid matchup-grid-live">
            {visiblePairs.map(([matchupId, entries]) => {
              const [a, b] = entries;
              const teamA = a ? teamByRosterId.get(a.roster_id) : undefined;
              const teamB = b ? teamByRosterId.get(b.roster_id) : undefined;
              if (!teamA || !a) return null;

              const aWon = played && b ? a.points > b.points : false;
              const bWon = played && b ? b.points > a.points : false;

              const startersA = (a.starters ?? []).filter((id) => id && id !== '0');
              const startersB = b ? (b.starters ?? []).filter((id) => id && id !== '0') : [];

              const projA = projectSide(startersA, a.players_points, isLocked, projections);
              const projB = b ? projectSide(startersB, b.players_points, isLocked, projections) : null;
              const winProbA = projB ? winProbability(projA, projB) : null;

              return (
                <div className="matchup-card" key={matchupId}>
                  <div className="matchup-header">
                    <MatchupTeamBlock
                      team={teamA}
                      points={a.points}
                      played={played}
                      won={aWon}
                      projectedTotal={projA.mean}
                    />
                    <div className="matchup-vs-col">
                      <span className="matchup-vs">vs</span>
                    </div>
                    {teamB && projB ? (
                      <MatchupTeamBlock
                        team={teamB}
                        points={b!.points}
                        played={played}
                        won={bWon}
                        projectedTotal={projB.mean}
                        reverse
                      />
                    ) : (
                      <div className="matchup-team matchup-bye">Spielfrei</div>
                    )}
                  </div>

                  {winProbA !== null && (
                    <div className="winprob-bar">
                      <div className="winprob-fill" style={{ width: `${(winProbA * 100).toFixed(1)}%` }} />
                      <span className="winprob-label">
                        {(winProbA * 100).toFixed(0)}% / {(100 - winProbA * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}

                  <div className="matchup-players">
                    <div className="matchup-players-col">
                      {startersA.map((id) => (
                        <PlayerCard
                          key={`a-${id}`}
                          playerId={id}
                          player={players[id]}
                          extra={`${(a.players_points?.[id] ?? 0).toFixed(1)} Pkt.`}
                          live={isTeamLive(liveIndex, players[id]?.team)}
                          projection={projections.get(id)?.mean ?? null}
                        />
                      ))}
                    </div>
                    <div className="matchup-players-col">
                      {b &&
                        startersB.map((id) => (
                          <PlayerCard
                            key={`b-${id}`}
                            playerId={id}
                            player={players[id]}
                            extra={`${(b.players_points?.[id] ?? 0).toFixed(1)} Pkt.`}
                            live={isTeamLive(liveIndex, players[id]?.team)}
                            projection={projections.get(id)?.mean ?? null}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
