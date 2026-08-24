import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { sleeper } from '../api/sleeper';
import { useLeagueData } from '../context/LeagueDataContext';
import { leagueAvatarUrl, initials } from '../lib/avatar';
import { LoadingState } from '../components/LoadingError';
import type { SleeperLeague } from '../api/types';

export function LeagueSearch() {
  const { chooseLeague, selectedLeagueId } = useLeagueData();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [season, setSeason] = useState('');
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SleeperLeague[] | null>(null);

  useEffect(() => {
    sleeper
      .getNflState()
      .then((state) => {
        const current = Number(state.season);
        setSeason(state.season);
        setSeasonOptions(Array.from({ length: 4 }, (_, i) => String(current - i)));
      })
      .catch(() => {
        const current = new Date().getFullYear();
        setSeason(String(current));
        setSeasonOptions(Array.from({ length: 4 }, (_, i) => String(current - i)));
      });
  }, []);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || !season) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const user = await sleeper.getUserByUsername(name);
      if (!user) {
        setError(`Kein Sleeper-Benutzer namens "${name}" gefunden.`);
        return;
      }
      const leagues = await sleeper.getUserLeagues(user.user_id, season);
      setResults(leagues);
      if (leagues.length === 0) {
        setError(`"${name}" hat keine Ligen in der Saison ${season}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler bei der Liga-Suche.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (league: SleeperLeague) => {
    chooseLeague(league.league_id);
    navigate('/');
  };

  return (
    <div className="page">
      <h1>Liga suchen</h1>
      <p className="muted playoff-picture-note">
        Gib deinen Sleeper-Benutzernamen ein, um deine Ligen zu finden und eine davon für die App auszuwählen.
      </p>

      <form className="league-search-form" onSubmit={handleSearch}>
        <input
          type="text"
          className="league-search-input"
          placeholder="Sleeper-Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <select className="week-select" value={season} onChange={(e) => setSeason(e.target.value)}>
          {seasonOptions.map((y) => (
            <option key={y} value={y}>
              Saison {y}
            </option>
          ))}
        </select>
        <button className="btn" type="submit" disabled={loading || !username.trim()}>
          {loading ? 'Suche…' : 'Suchen'}
        </button>
      </form>

      {loading && <LoadingState label="Suche Ligen…" />}
      {error && <div className="banner">{error}</div>}

      {results && results.length > 0 && (
        <div className="card-grid">
          {results.map((league) => {
            const avatar = leagueAvatarUrl(league);
            const active = league.league_id === selectedLeagueId;
            return (
              <button
                type="button"
                key={league.league_id}
                className={`participant-card league-search-card${active ? ' league-search-card-active' : ''}`}
                onClick={() => handleSelect(league)}
              >
                {avatar ? (
                  <img src={avatar} alt="" className="participant-avatar" />
                ) : (
                  <div className="participant-avatar table-avatar-fallback">{initials(league.name)}</div>
                )}
                <div className="team-name">{league.name}</div>
                <div className="owner-name">
                  Saison {league.season} · {league.total_rosters} Teams
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
