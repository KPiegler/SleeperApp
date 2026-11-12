import type {
  BracketMatch,
  DraftPick,
  NflState,
  SleeperLeague,
  SleeperMatchup,
  SleeperPlayerRaw,
  SleeperProjection,
  SleeperRoster,
  SleeperTransaction,
  SleeperUser,
  WeekStats,
} from './types';

const BASE = 'https://api.sleeper.app/v1';
const PROJECTIONS_BASE = 'https://api.sleeper.app/projections/nfl';

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Sleeper API Fehler ${res.status} bei ${url}`);
  }
  return res.json() as Promise<T>;
}

export const sleeper = {
  getLeague: (leagueId: string) => getJSON<SleeperLeague>(`${BASE}/league/${leagueId}`),
  getUsers: (leagueId: string) => getJSON<SleeperUser[]>(`${BASE}/league/${leagueId}/users`),
  getRosters: (leagueId: string) => getJSON<SleeperRoster[]>(`${BASE}/league/${leagueId}/rosters`),
  getMatchups: (leagueId: string, week: number) =>
    getJSON<SleeperMatchup[]>(`${BASE}/league/${leagueId}/matchups/${week}`),
  getTransactions: (leagueId: string, week: number) =>
    getJSON<SleeperTransaction[]>(`${BASE}/league/${leagueId}/transactions/${week}`),
  getDraftPicks: (draftId: string) => getJSON<DraftPick[]>(`${BASE}/draft/${draftId}/picks`),
  getWinnersBracket: (leagueId: string) => getJSON<BracketMatch[]>(`${BASE}/league/${leagueId}/winners_bracket`),
  getUserByUsername: (username: string) => getJSON<SleeperUser | null>(`${BASE}/user/${username}`),
  getUserLeagues: (userId: string, season: string) =>
    getJSON<SleeperLeague[]>(`${BASE}/user/${userId}/leagues/nfl/${season}`),
  getLosersBracket: (leagueId: string) => getJSON<BracketMatch[]>(`${BASE}/league/${leagueId}/losers_bracket`),
  getNflState: () => getJSON<NflState>(`${BASE}/state/nfl`),
  getWeekStats: (season: string, week: number) =>
    getJSON<WeekStats>(`${BASE}/stats/nfl/regular/${season}/${week}`),
  getProjections: (season: string, week: number) =>
    getJSON<SleeperProjection[]>(`${PROJECTIONS_BASE}/${season}/${week}?season_type=regular`),
  getAllPlayers: () => getJSON<Record<string, SleeperPlayerRaw>>(`${BASE}/players/nfl`),
};
