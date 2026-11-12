import { computeFantasyPoints } from './scoring';
import type { EspnPlay, EspnSummary } from '../api/espn';

export type BigPlayCategory = 'TD' | 'INT' | 'FUMBLE_LOST' | 'LONG_PLAY';

export interface BigPlay {
  id: string;
  eventId: string;
  category: BigPlayCategory;
  text: string;
  rawType: string;
  statYardage: number | null;
  matchedPlayerIds: string[];
  pointsByPlayerId: Record<string, number>;
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
 * "nennenswerter" Plays zusammen (ein Touchdown taucht in beiden Quellen auf). `matchedPlayerIds`
 * und `pointsByPlayerId` sind hier noch leer - die füllt `estimatePlayPoints` (braucht die
 * Liga-Scoring-Settings, die hier noch nicht bekannt sind).
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
      rawType: play.type?.text ?? '',
      statYardage: play.statYardage ?? null,
      matchedPlayerIds: [],
      pointsByPlayerId: {},
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

const PASSING_TD_PATTERN = /^(.+?)\s\d+\s[Yy]d\spass\sfrom\s(.+?)(?:\s*\(|$)/;
const RUSHING_TD_PATTERN = /^(.+?)\s\d+\s[Yy]d\s(?:Rush|Run)\b/i;
const INT_PASSER_PATTERN = /\b([A-Z]\.[A-Za-z'-]+)\s+pass\b/;
const FUMBLE_PATTERN = /\b([A-Z]\.[A-Za-z'-]+)\b[^.]*?FUMBLE/i;
const LONG_PASS_RECEIVER_PATTERN = /\bto\s+([A-Z]\.[A-Za-z'-]+)/;
const LONG_RUSH_PATTERN = /^(?:\([^)]*\)\s*)?([A-Z]\.[A-Za-z'-]+)/;

/**
 * Schätzt, wie viele Fantasy-Punkte ein einzelner Big Play für die beteiligten Spieler gebracht
 * hat - auf Basis von Play-Typ + Yardage, umgerechnet über die Liga-eigenen Scoring-Settings
 * (dieselbe Funktion, die auch für echte/projizierte Punkte genutzt wird). Bei Pass-Touchdowns
 * werden Werfer und Fänger getrennt erkannt, da sie unterschiedliche Statlinien bekommen. Lässt
 * sich ein Play-Format nicht sicher zerlegen, bleibt die Zuordnung leer statt zu raten.
 */
export function estimatePlayPoints(
  play: Pick<BigPlay, 'text' | 'category' | 'rawType' | 'statYardage'>,
  candidates: Array<{ id: string; firstName: string; lastName: string }>,
  scoring: Record<string, number>,
): Record<string, number> {
  const yards = play.statYardage ?? 0;
  const result: Record<string, number> = {};

  const findOne = (namePart: string): string | null => {
    const matched = matchPlayersInPlay(namePart, candidates);
    return matched.length === 1 ? matched[0] : null;
  };

  if (play.category === 'TD') {
    const passMatch = play.text.match(PASSING_TD_PATTERN);
    if (passMatch) {
      const receiverId = findOne(passMatch[1].trim());
      const passerId = findOne(passMatch[2].trim());
      if (receiverId) result[receiverId] = computeFantasyPoints({ rec: 1, rec_yd: yards, rec_td: 1 }, scoring);
      if (passerId) result[passerId] = computeFantasyPoints({ pass_yd: yards, pass_td: 1 }, scoring);
      return result;
    }

    const rushMatch = play.text.match(RUSHING_TD_PATTERN);
    if (rushMatch) {
      const rusherId = findOne(rushMatch[1].trim());
      if (rusherId) result[rusherId] = computeFantasyPoints({ rush_yd: yards, rush_td: 1 }, scoring);
    }
    return result;
  }

  if (play.category === 'INT') {
    const passerMatch = play.text.match(INT_PASSER_PATTERN);
    if (passerMatch) {
      const passerId = findOne(passerMatch[1]);
      if (passerId) result[passerId] = computeFantasyPoints({ pass_int: 1 }, scoring);
    }
    return result;
  }

  if (play.category === 'FUMBLE_LOST') {
    const fumbleMatch = play.text.match(FUMBLE_PATTERN);
    if (fumbleMatch) {
      const fumblerId = findOne(fumbleMatch[1]);
      if (fumblerId) result[fumblerId] = computeFantasyPoints({ fum_lost: 1 }, scoring);
    }
    return result;
  }

  if (play.category === 'LONG_PLAY') {
    if (play.rawType === 'Pass Reception') {
      // Receiver steht nach " to " (z.B. "... pass deep left to D.London pushed ob...") - gezielt
      // statt generisch gesucht, sonst scheitert es an der Mehrdeutigkeit, wenn Passer UND
      // Receiver beide in der Kandidatenliste stehen.
      const receiverMatch = play.text.match(LONG_PASS_RECEIVER_PATTERN);
      const receiverId = receiverMatch ? findOne(receiverMatch[1]) : null;
      if (receiverId) result[receiverId] = computeFantasyPoints({ rec: 1, rec_yd: yards }, scoring);
    } else {
      // Rusher steht als erster Spielername im Text (optional nach einem Klammer-Prefix wie "(Shotgun)").
      const rushMatch = play.text.match(LONG_RUSH_PATTERN);
      const rusherId = rushMatch ? findOne(rushMatch[1]) : null;
      if (rusherId) result[rusherId] = computeFantasyPoints({ rush_yd: yards }, scoring);
    }
  }

  return result;
}
