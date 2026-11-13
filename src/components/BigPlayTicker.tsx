import { TeamPill } from './TeamPill';
import type { BigPlay, BigPlayCategory } from '../lib/bigPlays';
import type { PlayerLite, Team } from '../api/types';

const CATEGORY_EMOJI: Record<BigPlayCategory, string> = {
  TD: '🏈',
  INT: '🔁',
  FUMBLE_LOST: '💥',
  LONG_PLAY: '📈',
};

const CATEGORY_LABEL: Record<BigPlayCategory, string> = {
  TD: 'Touchdown',
  INT: 'Interception',
  FUMBLE_LOST: 'Fumble',
  LONG_PLAY: 'Großer Raumgewinn',
};

export function BigPlayTicker({
  plays,
  teamByPlayerId,
  players,
}: {
  plays: BigPlay[];
  teamByPlayerId: Map<string, Team>;
  players: Record<string, PlayerLite>;
}) {
  if (plays.length === 0) return null;

  return (
    <div className="bigplay-ticker">
      {plays.map((play) => (
        <div className={`bigplay-item bigplay-item-${play.category.toLowerCase()}`} key={play.id}>
          <div className="bigplay-top-row">
            <div className="bigplay-headline">
              {play.matchedPlayerIds.map((playerId) => {
                const player = players[playerId];
                const team = teamByPlayerId.get(playerId);
                const points = play.pointsByPlayerId[playerId];
                if (!player && !team) return null;
                return (
                  <span className="bigplay-player-group" key={playerId}>
                    {player && (
                      <span className="bigplay-player">
                        {player.first_name} {player.last_name}
                        {points != null && (
                          <span className={`bigplay-points ${points < 0 ? 'bigplay-points-negative' : ''}`}>
                            {points > 0 ? '+' : ''}
                            {points.toFixed(2)} Pkt.
                          </span>
                        )}
                      </span>
                    )}
                    {team && <TeamPill team={team} />}
                  </span>
                );
              })}
            </div>
            <div className="bigplay-category-row">
              <span className="bigplay-emoji">{CATEGORY_EMOJI[play.category]}</span>
              <span className="bigplay-category">{CATEGORY_LABEL[play.category]}</span>
            </div>
          </div>
          <div className="bigplay-text">{play.text}</div>
        </div>
      ))}
    </div>
  );
}
