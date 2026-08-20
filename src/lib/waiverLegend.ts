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

export interface WaiverBattleStat {
  rosterId: number;
  wins: number;
}

/**
 * Zählt gewonnene Waiver-Battles: Fälle, in denen mehrere Teams denselben Spieler in derselben
 * Woche beansprucht haben (Sleeper protokolliert auch die verlorenen "failed"-Claims) und ein
 * Team sich gegen mindestens ein anderes durchgesetzt hat.
 */
export function computeWaiverBattles(
  weeks: number[],
  transactionsByWeek: Map<number, SleeperTransaction[]>,
): WaiverBattleStat[] {
  const wins = new Map<number, number>();

  for (const week of weeks) {
    const txns = (transactionsByWeek.get(week) ?? []).filter((t) => t.type === 'waiver' && t.adds);

    const claimsByPlayer = new Map<string, { rosterId: number; status: string }[]>();
    for (const t of txns) {
      for (const [playerId, rosterId] of Object.entries(t.adds!)) {
        const list = claimsByPlayer.get(playerId) ?? [];
        list.push({ rosterId, status: t.status });
        claimsByPlayer.set(playerId, list);
      }
    }

    for (const claims of claimsByPlayer.values()) {
      const rosterIds = new Set(claims.map((c) => c.rosterId));
      if (rosterIds.size < 2) continue;

      const winnerRosterIds = new Set(claims.filter((c) => c.status === 'complete').map((c) => c.rosterId));
      const hasLoser = claims.some((c) => c.status === 'failed' && !winnerRosterIds.has(c.rosterId));
      if (winnerRosterIds.size === 0 || !hasLoser) continue;

      for (const rosterId of winnerRosterIds) {
        wins.set(rosterId, (wins.get(rosterId) ?? 0) + 1);
      }
    }
  }

  return Array.from(wins.entries())
    .map(([rosterId, wins]) => ({ rosterId, wins }))
    .sort((a, b) => b.wins - a.wins);
}
