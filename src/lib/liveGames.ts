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
