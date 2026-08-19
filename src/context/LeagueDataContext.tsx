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

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!LEAGUE_ID) {
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
          sleeper.getLeague(LEAGUE_ID),
          sleeper.getUsers(LEAGUE_ID),
          sleeper.getRosters(LEAGUE_ID),
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
  }, [reloadKey]);

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
    reload,
  };

  return <LeagueDataContext.Provider value={value}>{children}</LeagueDataContext.Provider>;
}

export function useLeagueData(): LeagueDataValue {
  const ctx = useContext(LeagueDataContext);
  if (!ctx) throw new Error('useLeagueData muss innerhalb von LeagueDataProvider verwendet werden');
  return ctx;
}
