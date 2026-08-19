import type { NflState, SleeperLeague, WeekStats } from '../api/types';

export function computeFantasyPoints(
  stats: Record<string, number> | undefined,
  scoring: Record<string, number>,
): number {
  if (!stats) return 0;
  let total = 0;
  for (const key of Object.keys(stats)) {
    const weight = scoring[key];
    if (!weight) continue;
    total += stats[key] * weight;
  }
  return total;
}

/** Wochen der regulären Saison, die bereits gespielt wurden. */
export function completedRegularWeeks(state: NflState | null, league: SleeperLeague | null): number[] {
  if (!state || !league) return [];
  if (state.season_type === 'pre' || state.season_type === 'off') return [];
  const lastWeek =
    state.season_type === 'regular'
      ? Math.max(0, state.week - 1)
      : (league.settings?.playoff_week_start ?? 15) - 1;
  return Array.from({ length: lastWeek }, (_, i) => i + 1);
}

/** Summiert die Fantasy-Punkte je Spieler über mehrere Wochen-Statistik-Objekte. */
export function sumFantasyPointsByPlayer(
  weekStatsList: WeekStats[],
  scoring: Record<string, number>,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const weekStats of weekStatsList) {
    for (const [playerId, stats] of Object.entries(weekStats)) {
      totals[playerId] = (totals[playerId] ?? 0) + computeFantasyPoints(stats, scoring);
    }
  }
  return totals;
}
