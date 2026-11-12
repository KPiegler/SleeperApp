const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ATHLETES_BASE = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes';

export interface EspnSituation {
  isRedZone?: boolean;
  possession?: string;
}

export interface EspnScoreboardEvent {
  id: string;
  status: { type: { state: 'pre' | 'in' | 'post' } };
  competitions: Array<{
    competitors: Array<{ id?: string; team: { abbreviation: string } }>;
    situation?: EspnSituation;
  }>;
}

export interface EspnScoreboard {
  week: { number: number };
  events: EspnScoreboardEvent[];
}

export interface EspnPlay {
  id: string;
  type: { text: string };
  text: string;
  statYardage?: number;
}

export interface EspnScoringPlay extends EspnPlay {
  team: { abbreviation: string };
}

export interface EspnSummary {
  scoringPlays?: EspnScoringPlay[];
  drives?: { previous?: Array<{ plays: EspnPlay[] }> };
}

export interface EspnGamelogEvent {
  week: number;
  team?: { abbreviation: string };
}

export interface EspnGamelog {
  events: Record<string, EspnGamelogEvent>;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ESPN API Fehler ${res.status} bei ${url}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Inoffizielle, undokumentierte ESPN-Endpunkte (kein eigenes Backend nötig, CORS-offen).
 * Liefert Live-Spielstatus und Play-by-Play, die Sleeper nicht bereitstellt. Keine SLA – kann
 * sich jederzeit ohne Vorwarnung ändern.
 */
export const espn = {
  getScoreboard: () => getJSON<EspnScoreboard>(`${BASE}/scoreboard`),
  getSummary: (eventId: string) => getJSON<EspnSummary>(`${BASE}/summary?event=${eventId}`),
  /** Pro-Spiel-Historie eines Spielers inkl. NFL-Team zu jeder Woche - deckt unterjährige Trades ab. */
  getGamelog: (espnId: string) => getJSON<EspnGamelog>(`${ATHLETES_BASE}/${espnId}/gamelog`),
};
