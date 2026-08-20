import type { SleeperMatchup, SleeperTransaction } from '../api/types';

export interface TradeSide {
  rosterId: number;
  playersReceived: string[];
  playersGaveUp: string[];
  pointsSinceTrade: number;
}

export interface TradeResult {
  transactionId: string;
  week: number;
  sides: TradeSide[];
  swing: number;
}

/**
 * Wertet abgeschlossene Trades danach aus, wie viele Punkte die getauschten Spieler seit dem
 * Trade für ihr neues Team erzielt haben – so lässt sich erkennen, wer den Deal gewonnen hat.
 */
export function computeTrades(
  weeks: number[],
  matchupsByWeek: Map<number, SleeperMatchup[]>,
  transactionsByWeek: Map<number, SleeperTransaction[]>,
): TradeResult[] {
  const results: TradeResult[] = [];

  for (const week of weeks) {
    const txns = transactionsByWeek.get(week) ?? [];
    for (const t of txns) {
      if (t.status !== 'complete' || t.type !== 'trade' || !t.adds) continue;

      const receivedByRoster = new Map<number, string[]>();
      for (const [playerId, rosterId] of Object.entries(t.adds)) {
        const list = receivedByRoster.get(rosterId) ?? [];
        list.push(playerId);
        receivedByRoster.set(rosterId, list);
      }
      if (receivedByRoster.size < 2) continue;

      const gaveUpByRoster = new Map<number, string[]>();
      for (const [playerId, rosterId] of Object.entries(t.drops ?? {})) {
        const list = gaveUpByRoster.get(rosterId) ?? [];
        list.push(playerId);
        gaveUpByRoster.set(rosterId, list);
      }

      const sides: TradeSide[] = Array.from(receivedByRoster.entries()).map(([rosterId, playersReceived]) => {
        let pointsSinceTrade = 0;
        for (const w of weeks) {
          if (w < week) continue;
          const entry = (matchupsByWeek.get(w) ?? []).find((m) => m.roster_id === rosterId);
          for (const playerId of playersReceived) {
            pointsSinceTrade += entry?.players_points?.[playerId] ?? 0;
          }
        }
        return {
          rosterId,
          playersReceived,
          playersGaveUp: gaveUpByRoster.get(rosterId) ?? [],
          pointsSinceTrade: Math.round(pointsSinceTrade * 100) / 100,
        };
      });

      const points = sides.map((s) => s.pointsSinceTrade);
      const swing = Math.round((Math.max(...points) - Math.min(...points)) * 100) / 100;

      results.push({ transactionId: t.transaction_id, week, sides, swing });
    }
  }

  return results.sort((a, b) => b.swing - a.swing);
}
