import { maxLeagueWeek } from './weeks';
import type { NflState, SleeperLeague } from '../api/types';

/**
 * Wochen, für die Transaktionen abgerufen werden sollen. Anders als bei den Punkte-Stats zählt
 * hier auch die Preseason: Sleeper sammelt alle Vorsaison-Moves (z. B. Verletzungs-Waiver) bereits
 * unter Woche 1, bevor die reguläre Saison überhaupt begonnen hat.
 */
export function transactionWeeks(nflState: NflState | null, league: SleeperLeague | null): number[] {
  if (!league) return [];
  const maxWeek = maxLeagueWeek(league);

  if (!nflState || nflState.season !== league.season) {
    return Array.from({ length: maxWeek }, (_, i) => i + 1);
  }
  if (nflState.season_type === 'pre' || nflState.season_type === 'off') {
    return [1];
  }
  const upTo = Math.max(1, Math.min(nflState.week, maxWeek));
  return Array.from({ length: upTo }, (_, i) => i + 1);
}

export function isPreseason(nflState: NflState | null, league: SleeperLeague | null): boolean {
  return (
    !!league &&
    league.season === nflState?.season &&
    (nflState?.season_type === 'pre' || nflState?.season_type === 'off')
  );
}

export interface TransactionTypeInfo {
  label: string;
  emoji: string;
  className: string;
}

const TYPE_INFO: Record<string, TransactionTypeInfo> = {
  trade: { label: 'Trade', emoji: '🔁', className: 'txn-type-trade' },
  waiver: { label: 'Waiver', emoji: '📝', className: 'txn-type-waiver' },
  free_agent: { label: 'Free Agent', emoji: '🆓', className: 'txn-type-free-agent' },
  commissioner: { label: 'Commissioner', emoji: '🛠️', className: 'txn-type-commissioner' },
};

export function typeInfo(type: string): TransactionTypeInfo {
  return TYPE_INFO[type] ?? { label: type, emoji: '📋', className: 'txn-type-other' };
}

export function groupByRoster(record: Record<string, number> | null): Map<number, string[]> {
  const map = new Map<number, string[]>();
  if (!record) return map;
  for (const [playerId, rosterId] of Object.entries(record)) {
    const list = map.get(rosterId) ?? [];
    list.push(playerId);
    map.set(rosterId, list);
  }
  return map;
}
