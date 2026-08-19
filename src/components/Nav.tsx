import { NavLink } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { leagueAvatarUrl, initials } from '../lib/avatar';

export function Nav() {
  const { league } = useLeagueData();
  const avatar = leagueAvatarUrl(league);

  return (
    <header className="nav">
      <div className="nav-brand">
        {avatar ? (
          <img src={avatar} alt="" className="nav-avatar" />
        ) : (
          <div className="nav-avatar nav-avatar-fallback">{league ? initials(league.name) : '🏈'}</div>
        )}
        <div>
          <div className="nav-title">{league?.name ?? 'Sleeper Liga'}</div>
          <div className="nav-subtitle">Saison {league?.season ?? ''}</div>
        </div>
      </div>
      <nav className="nav-links">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Rangliste
        </NavLink>
        <NavLink to="/spielplan" className={({ isActive }) => (isActive ? 'active' : '')}>
          Spielplan
        </NavLink>
        <NavLink to="/teilnehmer" className={({ isActive }) => (isActive ? 'active' : '')}>
          Teilnehmer
        </NavLink>
        <NavLink to="/top-spieler" className={({ isActive }) => (isActive ? 'active' : '')}>
          Top Spieler
        </NavLink>
        <NavLink to="/fun-facts" className={({ isActive }) => (isActive ? 'active' : '')}>
          Fun Facts
        </NavLink>
        <NavLink to="/draft" className={({ isActive }) => (isActive ? 'active' : '')}>
          Draft
        </NavLink>
        <NavLink to="/awards" className={({ isActive }) => (isActive ? 'active' : '')}>
          Awards
        </NavLink>
      </nav>
    </header>
  );
}
