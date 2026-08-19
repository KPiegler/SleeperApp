import type { DraftPick, SleeperMatchup, Team } from '../api/types';

export function mvpManager(teams: Team[]): Team | null {
  if (teams.length === 0) return null;
  return [...teams].sort((a, b) => b.fpts - a.fpts)[0];
}

export function lastPlace(teams: Team[]): Team | null {
  if (teams.length === 0) return null;
  return [...teams].sort((a, b) => {
    if (a.wins !== b.wins) return a.wins - b.wins;
    return a.fpts - b.fpts;
  })[0];
}

export interface RosterTotal {
  rosterId: number;
  total: number;
}

export function benchWasteTotals(weeks: number[], matchupsByWeek: Map<number, SleeperMatchup[]>): RosterTotal[] {
  const totals = new Map<number, number>();

  for (const week of weeks) {
    for (const m of matchupsByWeek.get(week) ?? []) {
      if (!m.starters || !m.players || !m.players_points) continue;
      const starterSet = new Set(m.starters);
      const benchIds = m.players.filter((id) => !starterSet.has(id));
      const benchPoints = benchIds.reduce((sum, id) => sum + (m.players_points?.[id] ?? 0), 0);
      totals.set(m.roster_id, (totals.get(m.roster_id) ?? 0) + benchPoints);
    }
  }

  return Array.from(totals.entries())
    .map(([rosterId, total]) => ({ rosterId, total }))
    .sort((a, b) => b.total - a.total);
}

export function heartbreakCounts(
  weeks: number[],
  matchupsByWeek: Map<number, SleeperMatchup[]>,
  marginThreshold = 5,
): RosterTotal[] {
  const counts = new Map<number, number>();

  for (const week of weeks) {
    const entries = matchupsByWeek.get(week) ?? [];
    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of entries) {
      if (m.matchup_id == null) continue;
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }

    for (const pair of byMatchupId.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points === 0 && b.points === 0) continue;
      const margin = Math.abs(a.points - b.points);
      if (margin === 0 || margin > marginThreshold) continue;
      const loserRosterId = a.points < b.points ? a.roster_id : b.roster_id;
      counts.set(loserRosterId, (counts.get(loserRosterId) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([rosterId, total]) => ({ rosterId, total }))
    .sort((a, b) => b.total - a.total);
}

export interface DraftPerformance {
  pick: DraftPick;
  seasonPoints: number;
  finishRank: number;
  value: number;
}

/** Vergleicht Draft-Position mit tatsächlicher Saison-Punktzahl (nur unter den gedrafteten Spielern). */
export function computeDraftPerformance(
  picks: DraftPick[],
  seasonPointsByPlayer: Record<string, number>,
): DraftPerformance[] {
  const withPoints = picks
    .map((pick) => ({ pick, seasonPoints: seasonPointsByPlayer[pick.player_id] ?? 0 }))
    .sort((a, b) => b.seasonPoints - a.seasonPoints);

  return withPoints.map(({ pick, seasonPoints }, i) => {
    const finishRank = i + 1;
    return { pick, seasonPoints, finishRank, value: pick.pick_no - finishRank };
  });
}
