import type { SleeperMatchup } from '../api/types';

export interface TeamStreak {
  rosterId: number;
  result: 'W' | 'L' | 'T';
  length: number;
}

/** Aktuelle Sieges-/Niederlagenserie je Team, basierend auf den gespielten Wochen. */
export function computeStreaks(weeks: number[], matchupsByWeek: Map<number, SleeperMatchup[]>): TeamStreak[] {
  const resultsByRoster = new Map<number, Array<'W' | 'L' | 'T'>>();

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

      const resA: 'W' | 'L' | 'T' = a.points > b.points ? 'W' : a.points < b.points ? 'L' : 'T';
      const resB: 'W' | 'L' | 'T' = resA === 'T' ? 'T' : resA === 'W' ? 'L' : 'W';

      resultsByRoster.set(a.roster_id, [...(resultsByRoster.get(a.roster_id) ?? []), resA]);
      resultsByRoster.set(b.roster_id, [...(resultsByRoster.get(b.roster_id) ?? []), resB]);
    }
  }

  const streaks: TeamStreak[] = [];
  for (const [rosterId, results] of resultsByRoster) {
    if (results.length === 0) continue;
    const last = results[results.length - 1];
    let length = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === last; i--) length++;
    streaks.push({ rosterId, result: last, length });
  }

  return streaks.sort((a, b) => {
    const scoreA = a.result === 'W' ? a.length : a.result === 'L' ? -a.length : 0;
    const scoreB = b.result === 'W' ? b.length : b.result === 'L' ? -b.length : 0;
    return scoreB - scoreA;
  });
}
