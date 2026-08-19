import type { DraftPick, PlayerLite } from '../api/types';

export interface DraftPickValue {
  pick: DraftPick;
  searchRank: number | null;
  /** pick_no - searchRank: positiv = später gepickt als der Rang vermuten ließ (Steal), negativ = Reach. */
  value: number | null;
}

export function computeAdpValue(picks: DraftPick[], players: Record<string, PlayerLite>): DraftPickValue[] {
  return picks.map((pick) => {
    const player = players[pick.player_id];
    const searchRank = player?.search_rank ?? null;
    const value = searchRank != null ? pick.pick_no - searchRank : null;
    return { pick, searchRank, value };
  });
}

export function biggestSteals(values: DraftPickValue[], count = 5): DraftPickValue[] {
  return values
    .filter((v) => v.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, count);
}

export function biggestReaches(values: DraftPickValue[], count = 5): DraftPickValue[] {
  return values
    .filter((v) => v.value != null)
    .sort((a, b) => (a.value as number) - (b.value as number))
    .slice(0, count);
}
