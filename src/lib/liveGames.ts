import { espnTeamToSleeperTeam } from './nflTeamAliases';
import type { EspnScoreboard } from '../api/espn';

export interface LiveGameInfo {
  eventId: string;
  state: 'pre' | 'in' | 'post';
  homeTeam: string;
  awayTeam: string;
}

/** Sleeper-Team-Kürzel -> Infos zum aktuellen Spiel dieses Teams (falls es diese Woche spielt). */
export function buildLiveGameIndex(scoreboard: EspnScoreboard): Map<string, LiveGameInfo> {
  const index = new Map<string, LiveGameInfo>();

  for (const event of scoreboard.events) {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const teams = competitors.map((c) => espnTeamToSleeperTeam(c.team.abbreviation));
    if (teams.length !== 2) continue;

    const info: LiveGameInfo = {
      eventId: event.id,
      state: event.status.type.state,
      homeTeam: teams[0],
      awayTeam: teams[1],
    };
    index.set(teams[0], info);
    index.set(teams[1], info);
  }

  return index;
}

export function isTeamLive(index: Map<string, LiveGameInfo>, team: string | null | undefined): boolean {
  if (!team) return false;
  return index.get(team)?.state === 'in';
}

export function isTeamFinished(index: Map<string, LiveGameInfo>, team: string | null | undefined): boolean {
  if (!team) return false;
  return index.get(team)?.state === 'post';
}

/** Sleeper-Team-Kürzel, deren Zustand sich zwischen zwei Scoreboard-Abrufen zu "post" geändert hat. */
export function diffJustFinishedTeams(
  prev: Map<string, LiveGameInfo>,
  next: Map<string, LiveGameInfo>,
): Set<string> {
  const justFinished = new Set<string>();
  for (const [team, info] of next) {
    const prevState = prev.get(team)?.state;
    if (info.state === 'post' && prevState && prevState !== 'post') {
      justFinished.add(team);
    }
  }
  return justFinished;
}

/**
 * Sleeper-Team-Kürzel aller Teams, die laut ESPN gerade in der Red Zone am Ball sind. Basiert auf
 * dem `situation`-Feld, das ESPN nur während eines laufenden Spiels liefert - Format noch nicht
 * gegen echte Live-Daten verifiziert (keine NFL-Spiele zum Testzeitpunkt live), daher bewusst
 * defensiv: liefert einfach eine leere Menge, wenn das Feld fehlt oder anders aussieht als erwartet.
 */
export function buildRedZoneTeams(scoreboard: EspnScoreboard): Set<string> {
  const redZoneTeams = new Set<string>();

  for (const event of scoreboard.events) {
    if (event.status.type.state !== 'in') continue;
    const competition = event.competitions?.[0];
    const situation = competition?.situation;
    if (!situation?.isRedZone || !situation.possession) continue;

    const possessor = competition.competitors.find((c) => c.id === situation.possession);
    if (possessor?.team.abbreviation) {
      redZoneTeams.add(espnTeamToSleeperTeam(possessor.team.abbreviation));
    }
  }

  return redZoneTeams;
}
