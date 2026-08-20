export interface SleeperLeague {
  league_id: string;
  previous_league_id: string | null;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  avatar: string | null;
  draft_id: string | null;
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

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points: number;
  players: string[] | null;
  starters: string[] | null;
  players_points: Record<string, number> | null;
}

export interface SleeperTransaction {
  transaction_id: string;
  type: 'trade' | 'waiver' | 'free_agent' | 'commissioner' | (string & {});
  status: string;
  leg: number;
  created: number;
  roster_ids: number[];
  adds: Record<string, number> | null;
  drops: Record<string, number> | null;
}

export interface BracketMatch {
  r: number;
  m: number;
  t1: number | null;
  t2: number | null;
  w: number | null;
  l: number | null;
  t1_from?: { w?: number; l?: number } | null;
  t2_from?: { w?: number; l?: number } | null;
  p?: number | null;
}

export interface DraftPick {
  pick_no: number;
  round: number;
  draft_slot: number;
  roster_id: number;
  picked_by: string;
  player_id: string;
  is_keeper: boolean | null;
  metadata: {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    injury_status?: string;
  } | null;
  reactions: Record<string, string[]> | null;
}

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
