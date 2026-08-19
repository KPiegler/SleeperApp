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
}: {
  playerId: string;
  player: PlayerLite | undefined;
  slot?: string;
  extra?: string;
}) {
  const injuryColor = player?.injury_status ? INJURY_COLORS[player.injury_status] : undefined;

  return (
    <div className="player-card">
      {slot && <div className="player-card-slot">{slot}</div>}
      <PositionBadge position={player?.position ?? undefined} />
      <div className="player-card-body">
        <div className="player-card-name">{playerName(player, playerId)}</div>
        <div className="player-card-meta">
          {player?.team ?? 'FA'}
          {player?.injury_status && (
            <span className="injury-tag" style={{ color: injuryColor }}>
              {' '}
              · {player.injury_status}
            </span>
          )}
        </div>
      </div>
      {extra && <div className="player-card-extra">{extra}</div>}
    </div>
  );
}
