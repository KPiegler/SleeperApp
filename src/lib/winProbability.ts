import { computeFantasyPoints } from './scoring';
import type { WeekStats } from '../api/types';

export interface MeanVariance {
  mean: number;
  variance: number;
}

/** Fantasy-Punkte eines Spielers für jede abgeschlossene Woche (eine Zahl pro Woche). */
export function playerWeeklyPoints(
  playerId: string,
  weekStatsList: WeekStats[],
  scoring: Record<string, number>,
): number[] {
  return weekStatsList.map((weekStats) => computeFantasyPoints(weekStats[playerId], scoring));
}

export function meanVariance(values: number[]): MeanVariance {
  if (values.length === 0) return { mean: 0, variance: 0 };
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, variance };
}

/**
 * Projiziert die Gesamtpunkte einer Matchup-Seite: bereits abgeschlossene Spieler zählen mit
 * ihren echten Live-Punkten (keine Unsicherheit mehr), noch nicht abgeschlossene Spieler mit
 * ihrem Saison-Durchschnitt (als grobe Schätzung, keine echte Projection).
 */
export function projectSide(
  starterIds: string[],
  livePoints: Record<string, number> | null,
  isLocked: (playerId: string) => boolean,
  seasonStats: Map<string, MeanVariance>,
): MeanVariance {
  let mean = 0;
  let variance = 0;

  for (const id of starterIds) {
    const actual = livePoints?.[id] ?? 0;
    if (isLocked(id)) {
      mean += actual;
      continue;
    }
    const stats = seasonStats.get(id) ?? { mean: 0, variance: 0 };
    mean += Math.max(actual, stats.mean);
    variance += stats.variance;
  }

  return { mean, variance };
}

/** Standardnormalverteilung (Abramowitz-Stegun Approximation), keine Statistik-Bibliothek nötig. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return prob;
}

/** Grobe geschätzte Gewinnwahrscheinlichkeit für Seite A (0..1) – kein echtes Projection-Modell. */
export function winProbability(sideA: MeanVariance, sideB: MeanVariance): number {
  const totalVariance = sideA.variance + sideB.variance;
  if (totalVariance === 0) {
    if (sideA.mean === sideB.mean) return 0.5;
    return sideA.mean > sideB.mean ? 1 : 0;
  }
  const z = (sideA.mean - sideB.mean) / Math.sqrt(totalVariance);
  return normalCdf(z);
}
