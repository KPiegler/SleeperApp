import type { SleeperMatchup, SleeperTransaction } from '../api/types';

export interface WaiverPickup {
  playerId: string;
  rosterId: number;
  addWeek: number;
  totalPoints: number;
}

/**
 * Bewertet Waiver-/Free-Agent-Zugänge danach, wie viele Punkte der jeweilige Spieler
 * für das Team erzielt hat, seit er von der Waiver-Wire geholt wurde.
 */
export function computeWaiverLegend(
  weeks: number[],
  matchupsByWeek: Map<number, SleeperMatchup[]>,
  transactionsByWeek: Map<number, SleeperTransaction[]>,
): WaiverPickup[] {
  const pickups: WaiverPickup[] = [];

  for (const week of weeks) {
    const txns = transactionsByWeek.get(week) ?? [];
    for (const t of txns) {
      if (t.status !== 'complete') continue;
      if (t.type !== 'waiver' && t.type !== 'free_agent') continue;
      if (!t.adds) continue;

      for (const [playerId, rosterId] of Object.entries(t.adds)) {
        let totalPoints = 0;
        for (const w of weeks) {
          if (w < week) continue;
          const entry = (matchupsByWeek.get(w) ?? []).find((m) => m.roster_id === rosterId);
          totalPoints += entry?.players_points?.[playerId] ?? 0;
        }
        pickups.push({ playerId, rosterId, addWeek: week, totalPoints });
      }
    }
  }

  return pickups.filter((p) => p.totalPoints > 0).sort((a, b) => b.totalPoints - a.totalPoints);
}

export interface WaiverActivity {
  rosterId: number;
  count: number;
}

/** Zählt abgeschlossene Waiver-/Free-Agent-Moves je Team – wer schraubt am meisten am Roster? */
export function computeWaiverActivity(
  weeks: number[],
  transactionsByWeek: Map<number, SleeperTransaction[]>,
): WaiverActivity[] {
  const counts = new Map<number, number>();

  for (const week of weeks) {
    const txns = transactionsByWeek.get(week) ?? [];
    for (const t of txns) {
      if (t.status !== 'complete' || (t.type !== 'waiver' && t.type !== 'free_agent')) continue;
      for (const rosterId of t.roster_ids) {
        counts.set(rosterId, (counts.get(rosterId) ?? 0) + 1);
      }
    }
  }

  return Array.from(counts.entries())
    .map(([rosterId, count]) => ({ rosterId, count }))
    .sort((a, b) => b.count - a.count);
}
