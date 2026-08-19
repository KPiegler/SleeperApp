import { Link, useParams } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { PlayerCard } from '../components/PlayerCard';
import { initials } from '../lib/avatar';

export function TeamPage() {
  const { rosterId } = useParams<{ rosterId: string }>();
  const { teams, players, league } = useLeagueData();

  const team = teams.find((t) => t.rosterId === Number(rosterId));

  if (!team) {
    return (
      <div className="page">
        <p>Team nicht gefunden.</p>
        <Link to="/">Zurück zur Rangliste</Link>
      </div>
    );
  }

  const nonBenchSlots = (league?.roster_positions ?? []).filter((p) => p !== 'BN');
  const reserveSet = new Set(team.reserve);
  const starterSet = new Set(team.starters);
  const bench = team.players.filter((id) => !starterSet.has(id) && !reserveSet.has(id));

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Zurück zur Rangliste
      </Link>
      <div className="team-header">
        {team.avatarUrl ? (
          <img src={team.avatarUrl} alt="" className="team-header-avatar" />
        ) : (
          <div className="team-header-avatar table-avatar-fallback">{initials(team.teamName)}</div>
        )}
        <div>
          <h1>{team.teamName}</h1>
          <div className="owner-name">{team.ownerName}</div>
          <div className="team-header-record">
            {team.wins}-{team.losses}
            {team.ties > 0 ? `-${team.ties}` : ''} · {team.fpts.toFixed(2)} Punkte für ·{' '}
            {team.fptsAgainst.toFixed(2)} Punkte gegen
          </div>
        </div>
      </div>

      <h2>Starter</h2>
      <div className="player-grid">
        {team.starters.map((id, i) => (
          <PlayerCard key={`${id}-${i}`} playerId={id} player={players[id]} slot={nonBenchSlots[i] ?? '—'} />
        ))}
      </div>

      <h2>Bank</h2>
      <div className="player-grid">
        {bench.length === 0 && <p className="muted">Keine Bankspieler.</p>}
        {bench.map((id) => (
          <PlayerCard key={id} playerId={id} player={players[id]} />
        ))}
      </div>

      {team.reserve.length > 0 && (
        <>
          <h2>Verletztenliste (IR)</h2>
          <div className="player-grid">
            {team.reserve.map((id) => (
              <PlayerCard key={id} playerId={id} player={players[id]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
