import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { leagueAvatarUrl, initials } from '../lib/avatar';

export function Nav() {
  const { league, seasons, selectedLeagueId, selectSeason } = useLeagueData();
  const avatar = leagueAvatarUrl(league);
  const [open, setOpen] = useState(false);

  return (
    <header className="nav">
      <div className="nav-bar-top">
        <div className="nav-brand">
          {avatar ? (
            <img src={avatar} alt="" className="nav-avatar" />
          ) : (
            <div className="nav-avatar nav-avatar-fallback">{league ? initials(league.name) : '🏈'}</div>
          )}
          <div>
            <div className="nav-title">{league?.name ?? 'Sleeper Liga'}</div>
            {seasons.length > 1 ? (
              <select
                className="nav-season-select"
                value={selectedLeagueId ?? ''}
                onChange={(e) => selectSeason(e.target.value)}
                aria-label="Saison auswählen"
              >
                {seasons.map((s) => (
                  <option key={s.leagueId} value={s.leagueId}>
                    Saison {s.season}
                  </option>
                ))}
              </select>
            ) : (
              <div className="nav-subtitle">Saison {league?.season ?? ''}</div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="nav-burger"
          aria-label={open ? 'Menü schließen' : 'Menü öffnen'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`nav-burger-bar${open ? ' nav-burger-bar-open' : ''}`} />
        </button>
      </div>
      <nav className={`nav-links${open ? ' nav-links-open' : ''}`} onClick={() => setOpen(false)}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Rangliste
        </NavLink>
        <NavLink to="/spielplan" className={({ isActive }) => (isActive ? 'active' : '')}>
          Spielplan
        </NavLink>
        <NavLink to="/teilnehmer" className={({ isActive }) => (isActive ? 'active' : '')}>
          Teilnehmer:innen
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
