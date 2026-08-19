import { sleeper } from './sleeper';
import type { PlayerLite } from './types';

const CACHE_KEY = 'sleeper_players_cache_v1';
const TTL_MS = 24 * 60 * 60 * 1000;

interface CacheShape {
  ts: number;
  players: Record<string, PlayerLite>;
}

function readCache(): CacheShape | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheShape;
  } catch {
    return null;
  }
}

function writeCache(cache: CacheShape) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage voll/nicht verfügbar - Cache wird einfach nicht persistiert
  }
}

/**
 * Lädt Spieler-Metadaten nur für die übergebenen IDs.
 * Sleeper bietet dafür keinen Batch-Endpunkt, daher wird bei einem Cache-Miss
 * einmalig der komplette Spieler-Dump geladen und auf die benötigten IDs reduziert.
 * Das Ergebnis wird 24h in localStorage zwischengespeichert (Sleeper empfiehlt,
 * den vollen Dump nicht öfter als einmal täglich abzurufen).
 */
export async function getPlayersFor(ids: string[]): Promise<Record<string, PlayerLite>> {
  const uniqueIds = Array.from(new Set(ids));
  const cache = readCache();
  const fresh = !!cache && Date.now() - cache.ts < TTL_MS;

  if (fresh && cache && uniqueIds.every((id) => id in cache.players)) {
    return cache.players;
  }

  const bulk = await sleeper.getAllPlayers();
  const players: Record<string, PlayerLite> = fresh && cache ? { ...cache.players } : {};

  for (const id of uniqueIds) {
    const p = bulk[id];
    if (!p) continue;
    players[id] = {
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      position: (p.position as string) ?? null,
      team: (p.team as string) ?? null,
      fantasy_positions: (p.fantasy_positions as string[]) ?? null,
      status: (p.status as string) ?? null,
      injury_status: (p.injury_status as string) ?? null,
      number: (p.number as number) ?? null,
      age: (p.age as number) ?? null,
      search_rank: (p.search_rank as number) ?? null,
    };
  }

  writeCache({ ts: Date.now(), players });
  return players;
}
