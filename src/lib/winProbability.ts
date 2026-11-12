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
 * ihrem geschätzten Punktewert aus `projections` (Quelle ist dem Aufrufer egal - Saison-
 * Durchschnitt, Sleeper-Wochenprojektion oder eine Mischung, siehe `buildProjections`).
 */
export function projectSide(
  starterIds: string[],
  livePoints: Record<string, number> | null,
  isLocked: (playerId: string) => boolean,
  projections: Map<string, MeanVariance>,
): MeanVariance {
  let mean = 0;
  let variance = 0;

  for (const id of starterIds) {
    const actual = livePoints?.[id] ?? 0;
    if (isLocked(id)) {
      mean += actual;
      continue;
    }
    const proj = projections.get(id) ?? { mean: 0, variance: 0 };
    mean += Math.max(actual, proj.mean);
    variance += proj.variance;
  }

  return { mean, variance };
}

export type ProjectionMethod = 'sleeper_projection' | 'season_average';

/**
 * Kombiniert Sleeper-Wochenprojektion (Punkte-Schätzwert für genau diese Woche, z.B. unter
 * Berücksichtigung von Gegner/Verletzungsstatus) mit der Saison-Streuung je Spieler (Sleeper
 * liefert keine Varianz zu seinen Projections). Spieler ohne Sleeper-Projektion (z.B. gerade erst
 * geadded) fallen auf den Saison-Durchschnitt zurück. `method` erlaubt später eine einfache
 * Umschaltung auf reinen Saison-Durchschnitt, ohne diese Funktion selbst anzufassen.
 */
export function buildProjections(
  seasonStats: Map<string, MeanVariance>,
  projectedPoints: Map<string, number>,
  method: ProjectionMethod = 'sleeper_projection',
): Map<string, MeanVariance> {
  if (method === 'season_average') return seasonStats;

  const result = new Map<string, MeanVariance>();
  for (const [id, stats] of seasonStats) {
    result.set(id, { mean: projectedPoints.get(id) ?? stats.mean, variance: stats.variance });
  }
  for (const [id, points] of projectedPoints) {
    if (!result.has(id)) result.set(id, { mean: points, variance: 0 });
  }
  return result;
}

const VARIANCE_FLOOR_MIN_RELEVANT_MEAN = 3;

/**
 * Hebt die Saison-Varianz eines Spielers auf einen positionsbasierten Mindestwert an, falls seine
 * eigene Historie unrealistisch niedrig wirkt (z.B. ein Spieler, der die meiste Saison auf der Bank
 * saß und erst jetzt zum Starter wurde - seine bisherigen Punkte sind fast immer 0, die Varianz
 * daraus also winzig, obwohl er ab jetzt ein normales Starter-Risiko hat). Der Mindestwert ist der
 * Durchschnitt der Varianz aller "relevanten" Spieler (Saison-Schnitt über `VARIANCE_FLOOR_MIN_RELEVANT_MEAN`
 * Punkten) derselben Position - berechnet aus allen Spielern, die der Aufrufer übergibt (z.B. die
 * komplette Liga), nicht nur aus den beiden Matchup-Seiten, für eine robustere Stichprobe.
 */
export function applyPositionVarianceFloor(
  seasonStats: Map<string, MeanVariance>,
  positionByPlayer: Map<string, string | null | undefined>,
): Map<string, MeanVariance> {
  const pools = new Map<string, number[]>();
  for (const [id, stats] of seasonStats) {
    if (stats.mean < VARIANCE_FLOOR_MIN_RELEVANT_MEAN) continue;
    const pos = positionByPlayer.get(id);
    if (!pos) continue;
    const list = pools.get(pos) ?? [];
    list.push(stats.variance);
    pools.set(pos, list);
  }

  const floors = new Map<string, number>();
  for (const [pos, variances] of pools) {
    floors.set(pos, variances.reduce((sum, v) => sum + v, 0) / variances.length);
  }

  const result = new Map<string, MeanVariance>();
  for (const [id, stats] of seasonStats) {
    const pos = positionByPlayer.get(id);
    const floor = pos ? floors.get(pos) : undefined;
    result.set(id, { mean: stats.mean, variance: floor != null ? Math.max(stats.variance, floor) : stats.variance });
  }
  return result;
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
