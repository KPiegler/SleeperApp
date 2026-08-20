import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { userAvatarUrl } from '../lib/avatar';
import type {
  NflState,
  PlayerLite,
  SleeperLeague,
  SleeperRoster,
  SleeperUser,
  Team,
} from '../api/types';

const LEAGUE_ID = import.meta.env.VITE_SLEEPER_LEAGUE_ID as string | undefined;

export interface SeasonOption {
  leagueId: string;
  season: string;
}

interface LeagueDataValue {
  loading: boolean;
  error: string | null;
  league: SleeperLeague | null;
  users: SleeperUser[];
  usersById: Map<string, SleeperUser>;
  rosters: SleeperRoster[];
  teams: Team[];
  players: Record<string, PlayerLite>;
  nflState: NflState | null;
  seasons: SeasonOption[];
  selectedLeagueId: string | null;
  isCurrentSeason: boolean;
  selectSeason: (leagueId: string) => void;
  reload: () => void;
}

const LeagueDataContext = createContext<LeagueDataValue | null>(null);

function buildTeams(rosters: SleeperRoster[], usersById: Map<string, SleeperUser>): Team[] {
  return rosters.map((r) => {
    const user = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const teamName = user?.metadata?.team_name || user?.display_name || `Team ${r.roster_id}`;
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      teamName,
      ownerName: user?.display_name ?? 'Unbekannt',
      avatarUrl: userAvatarUrl(user),
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
      ties: r.settings?.ties ?? 0,
      fpts: (r.settings?.fpts ?? 0) + (r.settings?.fpts_decimal ?? 0) / 100,
      fptsAgainst: (r.settings?.fpts_against ?? 0) + (r.settings?.fpts_against_decimal ?? 0) / 100,
      players: r.players ?? [],
      starters: r.starters ?? [],
      reserve: r.reserve ?? [],
    };
  });
}

export function LeagueDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<SleeperLeague | null>(null);
  const [users, setUsers] = useState<SleeperUser[]>([]);
  const [rosters, setRosters] = useState<SleeperRoster[]>([]);
  const [players, setPlayers] = useState<Record<string, PlayerLite>>({});
  const [nflState, setNflState] = useState<NflState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(LEAGUE_ID ?? null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const selectSeason = useCallback((leagueId: string) => setSelectedLeagueId(leagueId), []);

  // Vergangene Saisons über die previous_league_id-Kette ermitteln, ausgehend von der aktuellen Liga.
  useEffect(() => {
    if (!LEAGUE_ID) return;
    let cancelled = false;

    (async () => {
      const chain: SeasonOption[] = [];
      const seen = new Set<string>();
      let nextId: string | null = LEAGUE_ID;

      while (nextId && !seen.has(nextId)) {
        seen.add(nextId);
        try {
          const data = await sleeper.getLeague(nextId);
          chain.push({ leagueId: data.league_id, season: data.season });
          nextId = data.previous_league_id;
        } catch {
          break;
        }
      }

      if (!cancelled) setSeasons(chain);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedLeagueId) {
      setError('Keine VITE_SLEEPER_LEAGUE_ID in der .env konfiguriert.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const [leagueData, usersData, rostersData, stateData] = await Promise.all([
          sleeper.getLeague(selectedLeagueId),
          sleeper.getUsers(selectedLeagueId),
          sleeper.getRosters(selectedLeagueId),
          sleeper.getNflState(),
        ]);

        const allPlayerIds = rostersData.flatMap((r) => r.players ?? []);
        const playersData = await getPlayersFor(allPlayerIds);

        if (cancelled) return;
        setLeague(leagueData);
        setUsers(usersData);
        setRosters(rostersData);
        setNflState(stateData);
        setPlayers(playersData);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Liga-Daten.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedLeagueId, reloadKey]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.user_id, u])), [users]);
  const teams = useMemo(() => buildTeams(rosters, usersById), [rosters, usersById]);

  const value: LeagueDataValue = {
    loading,
    error,
    league,
    users,
    usersById,
    rosters,
    teams,
    players,
    nflState,
    seasons,
    selectedLeagueId,
    isCurrentSeason: selectedLeagueId === LEAGUE_ID,
    selectSeason,
    reload,
  };

  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}

export function useLeagueData(): LeagueDataValue {
  const ctx = useContext(LeagueDataContext);
  if (!ctx) throw new Error('useLeagueData muss innerhalb von LeagueDataProvider verwendet werden');
  return ctx;
}
