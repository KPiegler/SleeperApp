/**
 * Baut eine kompakte Roh-Stat-Zeile pro Position aus Sleepers Wochen-Stats (eine zusätzliche
 * Zeile in der Spieler-Kachel, bewusst nur eine - mehr Höhe statt mehr Breite, damit alle
 * Matchups weiterhin nebeneinander passen). Liefert für jede bekannte Position IMMER eine Zeile
 * (mit 0-Werten als Platzhalter, solange noch keine Stats vorliegen) - nötig, damit alle
 * Spieler-Kacheln im Vollbild-Modus exakt gleich hoch bleiben, unabhängig vom Spielstand.
 */
export function formatLiveStatLine(position: string | null | undefined, stats: Record<string, number> | undefined): string {
  const s = stats ?? {};
  const n = (key: string) => s[key] ?? 0;

  switch (position) {
    case 'QB':
      return `${n('pass_cmp')}/${n('pass_att')}, ${n('pass_yd')} Yds, ${n('pass_td')} TD, ${n('pass_int')} INT`;

    case 'RB':
      return `${n('rush_att')} Att, ${n('rush_yd')} Yds, ${n('rush_td')} TD · ${n('rec')} Rec, ${n('rec_yd')} Yds, ${n('rec_td')} TD`;

    case 'WR':
    case 'TE':
      return `${n('rec')} Rec, ${n('rec_yd')} Yds, ${n('rec_td')} TD`;

    case 'K':
      return `${n('fgm')}/${n('fga')} FG, ${n('xpm')}/${n('xpa')} XP`;

    case 'DEF':
      return `${n('sack')} Sck, ${n('int')} INT, ${n('fum_rec')} FR, ${n('pts_allow')} Pkt. zugelassen`;

    default:
      return '–';
  }
}
