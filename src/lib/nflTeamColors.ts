/**
 * Marken-Farben aller 32 NFL-Teams (Sleeper-Abkürzungen), für die Touchdown-Overlay-Theming.
 * Fantasy-Teams selbst haben keine Farbwerte - das hier ist bewusst das NFL-Team des Scorers.
 */
export interface TeamColors {
  primary: string;
  secondary: string;
}

const FALLBACK_COLORS: TeamColors = { primary: '#4ade80', secondary: '#0a0a0a' };

const NFL_TEAM_COLORS: Record<string, TeamColors> = {
  ARI: { primary: '#97233f', secondary: '#000000' },
  ATL: { primary: '#a71930', secondary: '#000000' },
  BAL: { primary: '#241773', secondary: '#9e7c0c' },
  BUF: { primary: '#00338d', secondary: '#c60c30' },
  CAR: { primary: '#0085ca', secondary: '#101820' },
  CHI: { primary: '#0b162a', secondary: '#c83803' },
  CIN: { primary: '#fb4f14', secondary: '#000000' },
  CLE: { primary: '#311d00', secondary: '#ff3c00' },
  DAL: { primary: '#041e42', secondary: '#869397' },
  DEN: { primary: '#fb4f14', secondary: '#002244' },
  DET: { primary: '#0076b6', secondary: '#b0b7bc' },
  GB: { primary: '#203731', secondary: '#ffb612' },
  HOU: { primary: '#03202f', secondary: '#a71930' },
  IND: { primary: '#002c5f', secondary: '#a2aaad' },
  JAX: { primary: '#101820', secondary: '#d7a22a' },
  KC: { primary: '#e31837', secondary: '#ffb81c' },
  LAC: { primary: '#0080c6', secondary: '#ffc20e' },
  LAR: { primary: '#003594', secondary: '#ffa300' },
  LV: { primary: '#000000', secondary: '#a5acaf' },
  MIA: { primary: '#008e97', secondary: '#fc4c02' },
  MIN: { primary: '#4f2683', secondary: '#ffc62f' },
  NE: { primary: '#002244', secondary: '#c60c30' },
  NO: { primary: '#d3bc8d', secondary: '#101820' },
  NYG: { primary: '#0b2265', secondary: '#a71930' },
  NYJ: { primary: '#125740', secondary: '#000000' },
  PHI: { primary: '#004c54', secondary: '#a5acaf' },
  PIT: { primary: '#ffb612', secondary: '#101820' },
  SEA: { primary: '#002244', secondary: '#69be28' },
  SF: { primary: '#aa0000', secondary: '#b3995d' },
  TB: { primary: '#d50a0a', secondary: '#0a0a08' },
  TEN: { primary: '#0c2340', secondary: '#4b92db' },
  WAS: { primary: '#5a1414', secondary: '#ffb612' },
};

export function getTeamColors(abbr?: string | null): TeamColors {
  if (!abbr) return FALLBACK_COLORS;
  return NFL_TEAM_COLORS[abbr] ?? FALLBACK_COLORS;
}
