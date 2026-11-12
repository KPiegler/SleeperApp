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
      {plays.map((play) => {
        const playerId = play.matchedPlayerIds[0];
        const player = playerId ? players[playerId] : undefined;
        const team = playerId ? teamByPlayerId.get(playerId) : undefined;

        return (
          <div className={`bigplay-item bigplay-item-${play.category.toLowerCase()}`} key={play.id}>
            <span className="bigplay-emoji">{CATEGORY_EMOJI[play.category]}</span>
            <div className="bigplay-body">
              <div className="bigplay-headline">
                <span className="bigplay-category">{CATEGORY_LABEL[play.category]}</span>
                {player && (
                  <span className="bigplay-player">
                    {player.first_name} {player.last_name}
                  </span>
                )}
                {team && <TeamPill team={team} />}
              </div>
              <div className="bigplay-text">{play.text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
