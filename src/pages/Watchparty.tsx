import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { buildLiveGameIndex, isTeamLive, isTeamFinished, buildRedZoneTeams, diffJustFinishedTeams } from '../lib/liveGames';
import type { LiveGameInfo } from '../lib/liveGames';
import { espnTeamToSleeperTeam } from '../lib/nflTeamAliases';
import { extractBigPlays, estimatePlayPoints } from '../lib/bigPlays';
import { formatLiveStatLine } from '../lib/liveStatLine';
import { initials } from '../lib/avatar';
import { LoadingState, ErrorState } from '../components/LoadingError';
import { PlayerCard } from '../components/PlayerCard';
import { TeamPill } from '../components/TeamPill';
import { BigPlayTicker } from '../components/BigPlayTicker';
import { TouchdownOverlay } from '../components/TouchdownOverlay';
import { InfoModal } from '../components/InfoModal';
import type { BigPlay } from '../lib/bigPlays';
import type { MeanVariance, ProjectionMethod } from '../lib/winProbability';
import type { EspnScoreboard } from '../api/espn';
import type { PlayerLite, SleeperMatchup, Team, WeekStats } from '../api/types';

const SLEEPER_POLL_INTERVAL_MS = 30_000;
const ESPN_POLL_INTERVAL_MS = 20_000;
const TICKER_ITEM_LIFETIME_MS = 20_000;
const TICKER_MAX_ITEMS = 2;
const FINISHED_BANNER_DURATION_MS = 4_000;

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

function LeaderTile({
  emoji,
  title,
  playerId,
  players,
  rosterId,
  teamByRosterId,
  valueLabel,
  negative,
}: {
  emoji: string;
  title: string;
  playerId: string;
  players: Record<string, PlayerLite>;
  rosterId: number;
  teamByRosterId: Map<number, Team>;
  valueLabel: string;
  negative?: boolean;
}) {
  const player = players[playerId];
  return (
    <div className="watchparty-leader-card">
      <div className="watchparty-leader-emoji">{emoji}</div>
      <div className="watchparty-leader-title">{title}</div>
      <div className="watchparty-leader-name">{player ? `${player.first_name} ${player.last_name}` : playerId}</div>
      <div className={`watchparty-leader-value${negative ? ' watchparty-leader-value-negative' : ''}`}>
        {valueLabel}
      </div>
      <TeamPill team={teamByRosterId.get(rosterId)} />
    </div>
  );
}

function EmptyLeaderTile({ emoji, title, message }: { emoji: string; title: string; message: string }) {
  return (
    <div className="watchparty-leader-card watchparty-leader-card-empty">
      <div className="watchparty-leader-emoji">{emoji}</div>
      <div className="watchparty-leader-title">{title}</div>
      <div className="muted">{message}</div>
    </div>
  );
}

function TeamStatTile({
  emoji,
  title,
  team,
  valueLabel,
  negative,
}: {
  emoji: string;
  title: string;
  team: Team | undefined;
  valueLabel: string;
  negative?: boolean;
}) {
  return (
    <div className="watchparty-leader-card">
      <div className="watchparty-leader-emoji">{emoji}</div>
      <div className="watchparty-leader-title">{title}</div>
      <TeamPill team={team} />
      <div className={`watchparty-leader-value${negative ? ' watchparty-leader-value-negative' : ''}`}>
        {valueLabel}
      </div>
    </div>
  );
}

export function Watchparty() {
  const { teams, players, league, nflState, loading: leagueLoading, error: leagueError, reload } = useLeagueData();

  const [matchups, setMatchups] = useState<SleeperMatchup[]>([]);
  const [weekStats, setWeekStats] = useState<WeekStats>({});
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
  const [fullscreen, setFullscreen] = useState(false);
  const [justFinishedTeams, setJustFinishedTeams] = useState<Set<string>>(new Set());

  const seenPlayIds = useRef<Set<string>>(new Set());
  const baselinedEvents = useRef<Set<string>>(new Set());
  const settledEvents = useRef<Set<string>>(new Set());
  const removalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const finishedBannerTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const prevLiveIndexRef = useRef<Map<string, LiveGameInfo>>(new Map());
  const pageRef = useRef<HTMLDivElement>(null);

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
  const redZoneTeams = useMemo(() => (scoreboard ? buildRedZoneTeams(scoreboard) : new Set<string>()), [scoreboard]);

  const isLocked = useMemo(
    () => (playerId: string) => {
      const team = players[playerId]?.team;
      const info = team ? liveIndex.get(team) : undefined;
      return !info || info.state === 'post';
    },
    [players, liveIndex],
  );

  // Sleeper-Matchups + Roh-Stats: initial laden + alle 30s neu, solange die aktuelle Woche läuft.
  useEffect(() => {
    if (!league || week === null) return;
    let cancelled = false;
    setMatchLoading(true);
    setMatchError(null);

    Promise.all([sleeper.getMatchups(league.league_id, week), sleeper.getWeekStats(league.season, week)])
      .then(([matchupData, statsData]) => {
        if (!cancelled) {
          setMatchups(matchupData);
          setWeekStats(statsData);
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
      Promise.all([sleeper.getMatchups(league.league_id, week), sleeper.getWeekStats(league.season, week)])
        .then(([matchupData, statsData]) => {
          setMatchups(matchupData);
          setWeekStats(statsData);
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
    if (!isLiveWeek || week === null || !league) return;
    let cancelled = false;
    const scoreboardParams = {
      week,
      year: league.season,
      seasontype: nflState?.season_type === 'post' ? (3 as const) : (2 as const),
    };

    const tick = () => {
      if (document.hidden) return;
      espn
        .getScoreboard(scoreboardParams)
        .then((data) => {
          if (cancelled) return;
          setScoreboard(data);

          const nextIndex = buildLiveGameIndex(data);
          const justFinished = diffJustFinishedTeams(prevLiveIndexRef.current, nextIndex);
          prevLiveIndexRef.current = nextIndex;

          if (justFinished.size > 0) {
            setJustFinishedTeams((prev) => new Set([...prev, ...justFinished]));
            const timer = setTimeout(() => {
              finishedBannerTimers.current.delete(timer);
              setJustFinishedTeams((prev) => {
                const next = new Set(prev);
                for (const team of justFinished) next.delete(team);
                return next;
              });
            }, FINISHED_BANNER_DURATION_MS);
            finishedBannerTimers.current.add(timer);
          }
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
  }, [isLiveWeek, week, league, nflState?.season_type]);

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

          const allPlays = extractBigPlays(event.id, summary);
          const newPlays = allPlays.filter((p) => !seenPlayIds.current.has(p.id));

          // Erster Abruf für dieses Spiel in dieser Sitzung: alle bereits existierenden Plays
          // gelten als "schon gesehen", lösen aber nichts aus - das waren Plays von VOR dem
          // Öffnen/Neuladen der Seite, keine, die gerade live passieren. Nur Plays, die ab dem
          // nächsten Poll NEU dazukommen, zählen als echtes Live-Ereignis.
          const isBaseline = !baselinedEvents.current.has(event.id);
          baselinedEvents.current.add(event.id);
          for (const play of newPlays) seenPlayIds.current.add(play.id);
          if (isBaseline || newPlays.length === 0) return;

          for (const play of newPlays) {
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
      for (const timer of finishedBannerTimers.current) clearTimeout(timer);
    };
  }, []);

  // Browser-Vollbild (F11-artig) + eigener Vollbild-Modus, der Navigation/Titel ausblendet.
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const enterFullscreen = () => {
    document.documentElement.requestFullscreen?.().catch(() => {
      // Browser-Vollbild nicht verfügbar/verweigert - der eigene Vollbild-Modus greift trotzdem.
    });
    setFullscreen(true);
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    setFullscreen(false);
  };

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

  // Nur für den Vollbild-Modus: Bester Spieler der Woche, größter Over-/Underperformer und
  // bester gerade LIVE spielender Spieler, alles über die sichtbaren Matchups hinweg, auf Basis
  // der eh schon gepollten Live-Punkte/Projections/Spielstatus.
  const liveLeaders = useMemo(() => {
    let best: { playerId: string; rosterId: number; points: number } | null = null;
    let bestOver: { playerId: string; rosterId: number; points: number; delta: number } | null = null;
    let worstUnder: { playerId: string; rosterId: number; points: number; delta: number } | null = null;
    let bestLive: { playerId: string; rosterId: number; points: number } | null = null;

    for (const [, entries] of visiblePairs) {
      for (const m of entries) {
        const starters = (m.starters ?? []).filter((id) => id && id !== '0');
        for (const id of starters) {
          const points = m.players_points?.[id] ?? 0;
          if (!best || points > best.points) best = { playerId: id, rosterId: m.roster_id, points };

          const team = players[id]?.team;
          const live = isTeamLive(liveIndex, team);
          const hasPlayedOrPlaying = live || isTeamFinished(liveIndex, team);

          if (hasPlayedOrPlaying) {
            const proj = projections.get(id)?.mean ?? 0;
            const delta = points - proj;
            if (!bestOver || delta > bestOver.delta) bestOver = { playerId: id, rosterId: m.roster_id, points, delta };
            if (!worstUnder || delta < worstUnder.delta) worstUnder = { playerId: id, rosterId: m.roster_id, points, delta };
          }

          if (live) {
            if (!bestLive || points > bestLive.points) bestLive = { playerId: id, rosterId: m.roster_id, points };
          }
        }
      }
    }

    return { best, bestOver, worstUnder, bestLive };
  }, [visiblePairs, projections, liveIndex, players]);

  // Welches Team hat gerade die meisten über- bzw. unterperformenden Starter (nur Spieler, die
  // schon gespielt haben oder gerade spielen - sonst wäre "0 gespielt" fälschlich ein Underperform).
  const teamPerformanceLeaders = useMemo(() => {
    const counts = new Map<number, { over: number; under: number; total: number }>();

    for (const [, entries] of visiblePairs) {
      for (const m of entries) {
        const starters = (m.starters ?? []).filter((id) => id && id !== '0');
        let over = 0;
        let under = 0;
        let total = 0;

        for (const id of starters) {
          const team = players[id]?.team;
          if (!isTeamLive(liveIndex, team) && !isTeamFinished(liveIndex, team)) continue;
          total += 1;
          const points = m.players_points?.[id] ?? 0;
          const proj = projections.get(id)?.mean ?? 0;
          if (points > proj) over += 1;
          else if (points < proj) under += 1;
        }

        counts.set(m.roster_id, { over, under, total });
      }
    }

    let mostOver: { rosterId: number; count: number; total: number } | null = null;
    let mostUnder: { rosterId: number; count: number; total: number } | null = null;
    for (const [rosterId, c] of counts) {
      if (c.total === 0) continue;
      if (!mostOver || c.over > mostOver.count) mostOver = { rosterId, count: c.over, total: c.total };
      if (!mostUnder || c.under > mostUnder.count) mostUnder = { rosterId, count: c.under, total: c.total };
    }

    return { mostOver, mostUnder };
  }, [visiblePairs, projections, liveIndex, players]);

  // Gleicht die Höhe aller Spieler-Kacheln mit Stat-Zeile (nur Vollbild) an die tatsächlich
  // höchste Kachel an - robuster als ein geschätzter Fixwert, da Stat-Text je nach Position und
  // Spielstand unterschiedlich lang ist.
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const container = pageRef.current;
    if (!container) return;

    const cards = container.querySelectorAll<HTMLElement>('.player-card-with-stats');
    if (cards.length === 0) return;

    const applyHeights = () => {
      for (const card of cards) card.style.height = 'auto';
      let max = 0;
      for (const card of cards) max = Math.max(max, card.offsetHeight);
      for (const card of cards) card.style.height = `${max}px`;
    };

    applyHeights();
    window.addEventListener('resize', applyHeights);
    return () => {
      window.removeEventListener('resize', applyHeights);
      for (const card of cards) card.style.height = '';
    };
  }, [fullscreen, weekStats, visiblePairs, players]);

  // Gleicht die Höhe aller Leader-Kacheln (Bester Spieler, Over-/Underperformer, Team-Stats, ...)
  // an die höchste tatsächlich gerenderte Kachel an - dieselbe Technik wie oben, da die Kacheln
  // unterschiedlich viele Zeilen Inhalt haben (Spielername vs. nur Team-Pill z.B.).
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const container = pageRef.current;
    if (!container) return;

    const cards = container.querySelectorAll<HTMLElement>('.watchparty-leader-card');
    if (cards.length === 0) return;

    const applyHeights = () => {
      for (const card of cards) card.style.height = 'auto';
      let max = 0;
      for (const card of cards) max = Math.max(max, card.offsetHeight);
      for (const card of cards) card.style.height = `${max}px`;
    };

    applyHeights();
    window.addEventListener('resize', applyHeights);
    return () => {
      window.removeEventListener('resize', applyHeights);
      for (const card of cards) card.style.height = '';
    };
  }, [fullscreen, liveLeaders, teamPerformanceLeaders]);

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
    <div ref={pageRef} className={`page${fullscreen ? ' watchparty-fullscreen' : ''}`}>
      {!fullscreen && (
        <div className="page-title-row">
          <h1>Live-Ticker</h1>
          <div className="live-ticker-controls">
            <span className="live-badge">
              <span className="live-badge-dot" /> Live
            </span>
            {lastUpdated && (
              <span className="muted live-updated">
                Aktualisiert um{' '}
                {lastUpdated.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              type="button"
              className="info-btn"
              onClick={() => setShowInfo(true)}
              aria-label="Wie wird die Gewinnwahrscheinlichkeit berechnet?"
            >
              i
            </button>
            {pairs.length > 1 && (
              <button type="button" className="btn btn-ghost" onClick={() => setShowMatchupPicker(true)}>
                Matchups auswählen
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={enterFullscreen}>
              ⛶ Vollbild
            </button>
          </div>
        </div>
      )}

      {fullscreen && (
        <button type="button" className="fullscreen-exit-btn" onClick={exitFullscreen} aria-label="Vollbild verlassen">
          ✕
        </button>
      )}

      {!fullscreen && showMatchupPicker && (
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

      {!fullscreen && (
        <p className="muted playoff-picture-note">
          Die Gewinnwahrscheinlichkeit ist eine Näherung, keine exakte Sleeper-eigene Berechnung. Der
          Big-Play-Ticker stammt aus einer inoffiziellen ESPN-Quelle mit unscharfer Spieler-Zuordnung per
          Namens-Abgleich.
        </p>
      )}

      {!fullscreen && showInfo && (
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

      {!fullscreen && !anyGameLive && (
        <div className="banner">Aktuell läuft kein NFL-Spiel – Punkte werden trotzdem aktualisiert, sobald wieder gespielt wird.</div>
      )}

      {touchdownAlert && (
        <TouchdownOverlay
          play={touchdownAlert}
          players={players}
          teamByPlayerId={teamByPlayerId}
          onDone={() => setTouchdownAlert(null)}
        />
      )}

      <BigPlayTicker plays={ticker} teamByPlayerId={teamByPlayerId} players={players} slots={TICKER_MAX_ITEMS} />

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

                  <div className={`winprob-bar${winProbA === null ? ' winprob-bar-empty' : ''}`}>
                    {winProbA !== null && (
                      <>
                        <div
                          className={`winprob-segment ${winProbA >= 0.5 ? 'winprob-segment-win' : 'winprob-segment-lose'}`}
                          style={{ width: `${(winProbA * 100).toFixed(1)}%` }}
                        />
                        <div
                          className={`winprob-segment ${winProbA >= 0.5 ? 'winprob-segment-lose' : 'winprob-segment-win'}`}
                          style={{ width: `${(100 - winProbA * 100).toFixed(1)}%` }}
                        />
                        <span className="winprob-label">
                          {(winProbA * 100).toFixed(0)}% / {(100 - winProbA * 100).toFixed(0)}%
                        </span>
                      </>
                    )}
                  </div>

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
                          redZone={redZoneTeams.has(players[id]?.team ?? '')}
                          finished={isTeamFinished(liveIndex, players[id]?.team)}
                          justFinished={justFinishedTeams.has(players[id]?.team ?? '')}
                          liveStatLine={fullscreen ? formatLiveStatLine(players[id]?.position, weekStats[id]) : null}
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
                            redZone={redZoneTeams.has(players[id]?.team ?? '')}
                            finished={isTeamFinished(liveIndex, players[id]?.team)}
                            justFinished={justFinishedTeams.has(players[id]?.team ?? '')}
                            liveStatLine={fullscreen ? formatLiveStatLine(players[id]?.position, weekStats[id]) : null}
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

      {fullscreen &&
        (liveLeaders.best || liveLeaders.bestOver || liveLeaders.worstUnder || liveLeaders.bestLive) && (
        <div className="watchparty-live-leaders">
          {liveLeaders.best && (
            <LeaderTile
              emoji="🔥"
              title={`Bester Spieler Woche ${week}`}
              playerId={liveLeaders.best.playerId}
              players={players}
              rosterId={liveLeaders.best.rosterId}
              teamByRosterId={teamByRosterId}
              valueLabel={`${liveLeaders.best.points.toFixed(2)} Pkt.`}
            />
          )}
          {liveLeaders.bestOver && (
            <LeaderTile
              emoji="📈"
              title="Größter Overperformer"
              playerId={liveLeaders.bestOver.playerId}
              players={players}
              rosterId={liveLeaders.bestOver.rosterId}
              teamByRosterId={teamByRosterId}
              valueLabel={`${Math.abs(liveLeaders.bestOver.delta).toFixed(2)} > Proj.`}
            />
          )}
          {liveLeaders.worstUnder && (
            <LeaderTile
              emoji="📉"
              title="Größter Underperformer"
              playerId={liveLeaders.worstUnder.playerId}
              players={players}
              rosterId={liveLeaders.worstUnder.rosterId}
              teamByRosterId={teamByRosterId}
              valueLabel={`${Math.abs(liveLeaders.worstUnder.delta).toFixed(2)} < Proj.`}
              negative
            />
          )}
          {liveLeaders.bestLive ? (
            <LeaderTile
              emoji="🟢"
              title="Bester Spieler gerade live"
              playerId={liveLeaders.bestLive.playerId}
              players={players}
              rosterId={liveLeaders.bestLive.rosterId}
              teamByRosterId={teamByRosterId}
              valueLabel={`${liveLeaders.bestLive.points.toFixed(2)} Pkt.`}
            />
          ) : (
            <EmptyLeaderTile emoji="🟢" title="Bester Spieler gerade live" message="Keine Spiele aktiv" />
          )}
          {teamPerformanceLeaders.mostOver && (
            <TeamStatTile
              emoji="🏆"
              title="Meiste Overperformer"
              team={teamByRosterId.get(teamPerformanceLeaders.mostOver.rosterId)}
              valueLabel={`${teamPerformanceLeaders.mostOver.count}x Overperformt`}
            />
          )}
          {teamPerformanceLeaders.mostUnder && (
            <TeamStatTile
              emoji="⚠️"
              title="Meiste Underperformer"
              team={teamByRosterId.get(teamPerformanceLeaders.mostUnder.rosterId)}
              valueLabel={`${teamPerformanceLeaders.mostUnder.count}x Underperformt`}
              negative
            />
          )}
        </div>
      )}
    </div>
  );
}
