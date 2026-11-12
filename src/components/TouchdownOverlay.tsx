import { useEffect } from 'react';
import { TeamPill } from './TeamPill';
import type { BigPlay } from '../lib/bigPlays';
import type { PlayerLite, Team } from '../api/types';

const OVERLAY_DURATION_MS = 2600;

export function TouchdownOverlay({
  play,
  players,
  teamByPlayerId,
  onDone,
}: {
  play: BigPlay;
  players: Record<string, PlayerLite>;
  teamByPlayerId: Map<string, Team>;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDone, OVERLAY_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.id]);

  const playerId = play.matchedPlayerIds[0];
  const player = playerId ? players[playerId] : undefined;
  const team = playerId ? teamByPlayerId.get(playerId) : undefined;
  const points = playerId ? play.pointsByPlayerId[playerId] : undefined;

  return (
    <div className="touchdown-overlay">
      <div className="touchdown-overlay-text">TOUCHDOWN!</div>
      {(player || team) && (
        <div className="touchdown-overlay-sub">
          {player && (
            <span className="touchdown-overlay-player">
              {player.first_name} {player.last_name}
              {points != null && (
                <span className="touchdown-overlay-points">
                  ({points > 0 ? '+' : ''}
                  {points.toFixed(2)} Pkt.)
                </span>
              )}
            </span>
          )}
          {team && <TeamPill team={team} />}
        </div>
      )}
    </div>
  );
}
