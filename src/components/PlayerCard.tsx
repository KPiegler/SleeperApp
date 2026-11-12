import { PositionBadge } from './PositionBadge';
import type { PlayerLite } from '../api/types';

const INJURY_COLORS: Record<string, string> = {
  Questionable: '#eab308',
  Doubtful: '#f97316',
  Out: '#ef4444',
  IR: '#ef4444',
  PUP: '#ef4444',
  Sus: '#ef4444',
  NA: '#94a3b8',
};

const INJURY_ABBR: Record<string, string> = {
  Questionable: 'Q',
  Doubtful: 'D',
  Out: 'O',
  IR: 'IR',
  PUP: 'PUP',
  Sus: 'SUS',
  NA: 'NA',
};

function playerName(player: PlayerLite | undefined, fallbackId: string): string {
  if (!player) return fallbackId;
  if (player.position === 'DEF') return `${player.first_name} ${player.last_name}`.trim();
  const first = player.first_name?.[0] ? `${player.first_name[0]}.` : '';
  return `${first} ${player.last_name}`.trim() || fallbackId;
}

export function PlayerCard({
  playerId,
  player,
  slot,
  extra,
  nflTeam,
  live,
  projection,
}: {
  playerId: string;
  player: PlayerLite | undefined;
  slot?: string;
  extra?: string;
  nflTeam?: string | null;
  live?: boolean;
  projection?: number | null;
}) {
  const injuryColor = player?.injury_status ? INJURY_COLORS[player.injury_status] : undefined;
  const injuryAbbr = player?.injury_status ? INJURY_ABBR[player.injury_status] ?? player.injury_status : null;

  return (
    <div className={`player-card${live ? ' player-card-live' : ''}`}>
      {slot && <div className="player-card-slot">{slot}</div>}
      <PositionBadge position={player?.position ?? undefined} />
      <div className="player-card-body">
        <div className="player-card-name">
          {playerName(player, playerId)}
          {injuryAbbr && (
            <span className="injury-badge" style={{ color: injuryColor, borderColor: injuryColor }}>
              {injuryAbbr}
            </span>
          )}
        </div>
        <div className="player-card-meta">
          {(nflTeam ?? player?.team) ?? 'FA'}
          {projection != null && <span className="player-card-projection"> · Proj. {projection.toFixed(2)}</span>}
        </div>
      </div>
      {extra && <div className="player-card-extra">{extra}</div>}
    </div>
  );
}
