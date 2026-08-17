export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  avatar: string | null;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    playoff_week_start?: number;
    playoff_teams?: number;
    num_teams?: number;
    [key: string]: unknown;
  };
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string | null;
  metadata: {
    team_name?: string;
    avatar?: string;
    [key: string]: unknown;
  } | null;
}

export interface SleeperRosterSettings {
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fpts_decimal: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
  [key: string]: unknown;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi: string[] | null;
  settings: SleeperRosterSettings;
}

export interface NflState {
  week: number;
  season: string;
  season_type: 'pre' | 'regular' | 'post' | 'off';
  display_week: number;
}

export interface PlayerLite {
  first_name: string;
  last_name: string;
  position: string | null;
  team: string | null;
  fantasy_positions: string[] | null;
  status: string | null;
  injury_status: string | null;
  number: number | null;
  age: number | null;
  search_rank: number | null;
}

export type SleeperPlayerRaw = Partial<PlayerLite> & Record<string, unknown>;

export type WeekStats = Record<string, Record<string, number>>;

export interface Team {
  rosterId: number;
  ownerId: string | null;
  teamName: string;
  ownerName: string;
  avatarUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  fpts: number;
  fptsAgainst: number;
  players: string[];
  starters: string[];
  reserve: string[];
}
