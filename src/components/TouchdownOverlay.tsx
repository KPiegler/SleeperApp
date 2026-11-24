import { useEffect, useState, type CSSProperties } from 'react';
import { TeamPill } from './TeamPill';
import { getTeamColors } from '../lib/nflTeamColors';
import { espnHeadshotUrl, espnTeamLogoUrl } from '../lib/espnMedia';
import type { BigPlay } from '../lib/bigPlays';
import type { PlayerLite, Team } from '../api/types';

const OVERLAY_DURATION_MS = 4000;

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
  const [logoFailed, setLogoFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(onDone, OVERLAY_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play.id]);

  useEffect(() => {
    setLogoFailed(false);
    setPhotoFailed(false);
  }, [play.id]);

  const playerId = play.matchedPlayerIds[0];
  const player = playerId ? players[playerId] : undefined;
  const fantasyTeam = playerId ? teamByPlayerId.get(playerId) : undefined;
  const points = playerId ? play.pointsByPlayerId[playerId] : undefined;

  const nflTeam = player?.team ?? null;
  const colors = getTeamColors(nflTeam);
  const logoUrl = !logoFailed ? espnTeamLogoUrl(nflTeam) : null;
  const photoUrl = !photoFailed ? espnHeadshotUrl(player?.espn_id) : null;

  return (
    <div
      className="touchdown-overlay"
      style={{
        '--td-color-1': colors.primary,
        '--td-color-2': colors.secondary,
      } as CSSProperties}
    >
      {logoUrl && (
        <img className="touchdown-overlay-logo" src={logoUrl} alt="" onError={() => setLogoFailed(true)} />
      )}

      {photoUrl && (
        <img
          className="touchdown-overlay-photo"
          src={photoUrl}
          alt=""
          onError={() => setPhotoFailed(true)}
        />
      )}

      <div className="touchdown-overlay-text">TOUCHDOWN!</div>
      {(player || fantasyTeam) && (
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
          {fantasyTeam && <TeamPill team={fantasyTeam} />}
        </div>
      )}
    </div>
  );
}
