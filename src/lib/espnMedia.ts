/**
 * Reine URL-Builder für ESPNs CDN (kein Fetch nötig, direkt per <img src> einbindbar).
 * Live geprüft: gültige IDs liefern 200/image-png, ungültige IDs liefern saubere 404 - also
 * per onError auf dem <img> abfangbar statt in einem kaputten Bild-Icon zu enden.
 */
const ESPN_SLEEPER_TO_ESPN_TEAM: Record<string, string> = {
  WAS: 'WSH',
};

export function espnHeadshotUrl(espnId?: string | null): string | null {
  if (!espnId) return null;
  return `https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`;
}

export function espnTeamLogoUrl(sleeperAbbr?: string | null): string | null {
  if (!sleeperAbbr) return null;
  const espnAbbr = ESPN_SLEEPER_TO_ESPN_TEAM[sleeperAbbr] ?? sleeperAbbr;
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnAbbr.toLowerCase()}.png`;
}
