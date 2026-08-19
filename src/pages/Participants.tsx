import { Link } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { initials } from '../lib/avatar';

export function Participants() {
  const { teams } = useLeagueData();

  return (
    <div className="page">
      <h1>Teilnehmer:innen</h1>
      <div className="card-grid">
        {teams.map((team) => (
          <Link to={`/team/${team.rosterId}`} key={team.rosterId} className="participant-card">
            {team.avatarUrl ? (
              <img src={team.avatarUrl} alt="" className="participant-avatar" />
            ) : (
              <div className="participant-avatar table-avatar-fallback">{initials(team.teamName)}</div>
            )}
            <div className="team-name">{team.teamName}</div>
            <div className="owner-name">{team.ownerName}</div>
            <div className="participant-record">
              {team.wins}-{team.losses}
              {team.ties > 0 ? `-${team.ties}` : ''} · {team.fpts.toFixed(1)} Pkt.
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
