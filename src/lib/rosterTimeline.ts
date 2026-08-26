import type { DraftPick, SleeperTransaction } from '../api/types';

export interface RosterTimelineStep {
  key: string;
  label: string;
  week: number | null;
  date: number | null;
  playerIds: string[];
  added: string[];
  dropped: string[];
}

/**
 * Rekonstruiert den Kader-Verlauf eines Teams: startet beim Draft-Kader und spielt danach die
 * abgeschlossenen Transaktionen dieses Rosters wochenweise durch (mehrere Moves in derselben
 * Woche landen in einem gemeinsamen Schritt). Sleeper speichert keine Kader-Snapshots – das ist
 * also aus Draft-Picks + Transaktions-Log hergeleitet. Details zu einzelnen Moves gibt's in der
 * Spieler-Historie.
 */
export function buildRosterTimeline(
  rosterId: number,
  draftPicks: DraftPick[],
  transactions: (SleeperTransaction & { week: number })[],
): RosterTimelineStep[] {
  const draftPlayerIds = draftPicks.filter((p) => p.roster_id === rosterId).map((p) => p.player_id);

  const steps: RosterTimelineStep[] = [
    {
      key: 'draft',
      label: 'Draft-Kader',
      week: null,
      date: null,
      playerIds: draftPlayerIds,
      added: draftPlayerIds,
      dropped: [],
    },
  ];

  const relevant = transactions
    .filter((t) => t.status === 'complete' && t.roster_ids.includes(rosterId))
    .sort((a, b) => a.created - b.created);

  const byWeek = new Map<number, (SleeperTransaction & { week: number })[]>();
  for (const t of relevant) {
    const list = byWeek.get(t.week) ?? [];
    list.push(t);
    byWeek.set(t.week, list);
  }
  const weeksSorted = Array.from(byWeek.keys()).sort((a, b) => a - b);

  const current = new Set(draftPlayerIds);

  for (const week of weeksSorted) {
    const weekTxns = byWeek.get(week)!;
    const prevSet = new Set(current);

    for (const t of weekTxns) {
      for (const [playerId, rid] of Object.entries(t.adds ?? {})) {
        if (rid === rosterId) current.add(playerId);
      }
      for (const [playerId, rid] of Object.entries(t.drops ?? {})) {
        if (rid === rosterId) current.delete(playerId);
      }
    }

    const added = Array.from(current).filter((id) => !prevSet.has(id));
    const dropped = Array.from(prevSet).filter((id) => !current.has(id));
    if (added.length === 0 && dropped.length === 0) continue;

    steps.push({
      key: `week-${week}`,
      label: `Woche ${week}`,
      week,
      date: weekTxns[weekTxns.length - 1].created,
      playerIds: Array.from(current),
      added,
      dropped,
    });
  }

  return steps;
}
