import { Link } from 'react-router-dom';
import { initials } from '../lib/avatar';
import type { Team } from '../api/types';

export function TeamPill({ team }: { team: Team | undefined }) {
  if (!team) return <span className="muted">Unbekanntes Team</span>;
  return (
    <Link to={`/team/${team.rosterId}`} className="fun-team-pill">
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="table-avatar" />
      ) : (
        <div className="table-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <span>{team.teamName}</span>
    </Link>
  );
}
