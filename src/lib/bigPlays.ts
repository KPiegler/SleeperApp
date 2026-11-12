import type { EspnPlay, EspnSummary } from '../api/espn';

export type BigPlayCategory = 'TD' | 'INT' | 'FUMBLE_LOST' | 'LONG_PLAY';

export interface BigPlay {
  id: string;
  eventId: string;
  category: BigPlayCategory;
  text: string;
  matchedPlayerIds: string[];
}

const LONG_PLAY_YARDS = 20;

export function classifyPlay(play: EspnPlay): BigPlayCategory | null {
  const type = play.type?.text ?? '';

  if (type.includes('Touchdown')) return 'TD';
  if (type.includes('Interception')) return 'INT';
  if (type === 'Fumble Recovery (Opponent)') return 'FUMBLE_LOST';
  if ((type === 'Pass Reception' || type === 'Rush') && (play.statYardage ?? 0) >= LONG_PLAY_YARDS) {
    return 'LONG_PLAY';
  }
  return null;
}

/**
 * Fasst Scoring-Plays und die komplette Drive-Play-Liste zu einer deduplizierten Liste
 * "nennenswerter" Plays zusammen (ein Touchdown taucht in beiden Quellen auf).
 */
export function extractBigPlays(eventId: string, summary: EspnSummary): BigPlay[] {
  const seen = new Set<string>();
  const plays: BigPlay[] = [];

  const allPlays: EspnPlay[] = [...(summary.scoringPlays ?? []), ...(summary.drives?.previous?.flatMap((d) => d.plays) ?? [])];

  for (const play of allPlays) {
    if (seen.has(play.id)) continue;
    const category = classifyPlay(play);
    if (!category) continue;
    seen.add(play.id);
    plays.push({
      id: `${eventId}:${play.id}`,
      eventId,
      category,
      text: play.text,
      matchedPlayerIds: [],
    });
  }

  return plays;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Ordnet einen rohen ESPN-Play-Text Sleeper-Spielern zu. ESPN nennt Spieler nur als Kürzel
 * im Freitext (z.B. "D.Jones") – kein verlässliches Spieler-ID-Feld vorhanden. Bei mehreren
 * Treffern wird bewusst niemand zugeordnet (keine Vermutung), statt falsch zuzuordnen.
 */
export function matchPlayersInPlay(
  playText: string,
  candidates: Array<{ id: string; firstName: string; lastName: string }>,
): string[] {
  const abbrevMatches: string[] = [];
  const lastNameMatches: string[] = [];

  for (const c of candidates) {
    if (!c.lastName) continue;
    const lastName = escapeRegExp(c.lastName);
    const firstInitial = c.firstName ? escapeRegExp(c.firstName[0]) : '';

    if (firstInitial) {
      const abbrevPattern = new RegExp(`\\b${firstInitial}\\.?\\s*${lastName}\\b`, 'i');
      if (abbrevPattern.test(playText)) {
        abbrevMatches.push(c.id);
        continue;
      }
    }

    const lastNamePattern = new RegExp(`\\b${lastName}\\b`, 'i');
    if (lastNamePattern.test(playText)) {
      lastNameMatches.push(c.id);
    }
  }

  if (abbrevMatches.length === 1) return abbrevMatches;
  if (abbrevMatches.length > 1) return [];
  if (lastNameMatches.length === 1) return lastNameMatches;
  return [];
}
