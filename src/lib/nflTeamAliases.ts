/**
 * Sleeper und ESPN verwenden an einer bekannten Stelle unterschiedliche Team-Kürzel
 * (Washington: Sleeper = WAS, ESPN = WSH). Gegen eine volle Saison-Woche aller 32 Teams geprüft –
 * das war der einzige Unterschied.
 */
const ESPN_TO_SLEEPER: Record<string, string> = {
  WSH: 'WAS',
};

export function espnTeamToSleeperTeam(abbr: string): string {
  return ESPN_TO_SLEEPER[abbr] ?? abbr;
}
