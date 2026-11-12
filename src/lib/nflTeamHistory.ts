import { espn } from '../api/espn';
import { espnTeamToSleeperTeam } from './nflTeamAliases';

/** Woche -> Sleeper-normalisiertes NFL-Team-Kürzel, aus ESPNs Gamelog für diesen Spieler. */
export async function fetchTeamByWeek(espnId: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const gamelog = await espn.getGamelog(espnId);
    for (const event of Object.values(gamelog.events ?? {})) {
      const abbr = event.team?.abbreviation;
      if (abbr) map.set(event.week, espnTeamToSleeperTeam(abbr));
    }
  } catch {
    // Inoffizielle ESPN-API - bei einem Fehlschlag bleibt die Map leer, Aufrufer fällt dann auf
    // die bisherige Logik (Draft-Team/aktuelles Team) zurück.
  }
  return map;
}
