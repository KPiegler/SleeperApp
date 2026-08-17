import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { initials } from '../lib/avatar';
import { PlayoffBracket } from '../components/PlayoffBracket';
import type { Team } from '../api/types';

function TeamRow({ team }: { team: Team }) {
  return (
    <Link to={`/team/${team.rosterId}`} className="team-link">
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="table-avatar" />
      ) : (
        <div className="table-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <div>
        <div className="team-name">{team.teamName}</div>
        <div className="owner-name">{team.ownerName}</div>
      </div>
    </Link>
  );
}

export function Standings() {
  const { teams, nflState, league } = useLeagueData();

  const sorted = [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.fpts - a.fpts;
  });

  const seasonNotStarted = nflState?.season_type === 'pre' || nflState?.season_type === 'off';
  const playoffSpots = league?.settings?.playoff_teams ?? 6;
  const playoffTeams = sorted.slice(0, playoffSpots);
  const toiletBowlTeams = sorted.slice(playoffSpots);

  return (
    <div className="page">
      <h1>Rangliste</h1>
      {seasonNotStarted && (
        <div className="banner">
          Die Saison hat noch nicht begonnen – Bilanz und Punkte stehen daher noch bei 0.
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>S-N-U</th>
              <th>Punkte</th>
              <th>Gegner-Punkte</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((team, i) => (
              <tr key={team.rosterId} className={i < playoffSpots ? 'row-playoff' : 'row-toilet'}>
                <td className="rank-cell">{i + 1}</td>
                <td>
                  <TeamRow team={team} />
                </td>
                <td>
                  {team.wins}-{team.losses}
                  {team.ties > 0 ? `-${team.ties}` : ''}
                </td>
                <td>{team.fpts.toFixed(2)}</td>
                <td>{team.fptsAgainst.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-legend">
          <span>
            <i className="legend-dot legend-dot-playoff" /> Playoff-Platz
          </span>
          <span>
            <i className="legend-dot legend-dot-toilet" /> Toilet Bowl
          </span>
        </div>
      </div>

      <h2>Playoff Picture (Stand heute)</h2>
      {seasonNotStarted ? (
        <div className="banner">
          Da noch keine Spiele stattgefunden haben, ist diese Einteilung rein alphabetisch/nach Draft-Reihenfolge
          und wird sich mit dem ersten Spieltag ändern.
        </div>
      ) : (
        <p className="muted playoff-picture-note">
          So sähe es aus, wenn die Saison heute enden würde. Tiebreaker: Siege, dann Gesamtpunkte.
        </p>
      )}
      <div className="playoff-picture">
        <div className="playoff-picture-col">
          <div className="playoff-picture-title playoff-picture-title-playoff">🏆 Playoffs</div>
          {playoffTeams.map((team, i) => (
            <div className="playoff-picture-row" key={team.rosterId}>
              <span className="playoff-seed">{i + 1}</span>
              <TeamRow team={team} />
            </div>
          ))}
        </div>
        <div className="playoff-picture-col">
          <div className="playoff-picture-title playoff-picture-title-toilet">🚽 Toilet Bowl</div>
          {toiletBowlTeams.map((team, i) => (
            <div className="playoff-picture-row" key={team.rosterId}>
              <span className="playoff-seed playoff-seed-toilet">{playoffSpots + i + 1}</span>
              <TeamRow team={team} />
            </div>
          ))}
        </div>
      </div>

      <h2>Playoff-Bracket (Projektion)</h2>
      <p className="muted playoff-picture-note">
        Format der Liga: Plätze 1 &amp; 2 erhalten ein Freilos in Runde 1. So würde das Bracket auf Basis der
        aktuellen Rangliste starten – die Runden ab dem Viertelfinale hängen vom tatsächlichen Spielausgang ab.
      </p>
      <PlayoffBracket seeds={playoffTeams} />
    </div>
  );
}
