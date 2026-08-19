import type { SleeperLeague } from '../api/types';

const DEFAULT_PLAYOFF_ROUNDS = 3;

export function maxLeagueWeek(league: SleeperLeague | null): number {
  const playoffStart = league?.settings?.playoff_week_start ?? 15;
  return playoffStart + DEFAULT_PLAYOFF_ROUNDS - 1;
}

export function weekLabel(week: number, league: SleeperLeague | null): string {
  const playoffStart = league?.settings?.playoff_week_start ?? 15;
  const playoffSpots = league?.settings?.playoff_teams ?? 6;

  if (week < playoffStart) return `Woche ${week}`;

  const round = week - playoffStart;
  if (playoffSpots === 6) {
    const names = ['Viertelfinale', 'Halbfinale', 'Finale'];
    const roundName = names[round];
    return roundName ? `Woche ${week} · Playoffs (${roundName})` : `Woche ${week} · Playoffs`;
  }
  return `Woche ${week} · Playoffs`;
}
