import { Link } from 'react-router-dom';
import { initials } from '../lib/avatar';
import type { Team } from '../api/types';

function Seed({ team, seed }: { team: Team; seed: number }) {
  return (
    <Link to={`/team/${team.rosterId}`} className="bracket-seed-row">
      <span className="playoff-seed bracket-seed-num">{seed}</span>
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="bracket-avatar" />
      ) : (
        <div className="bracket-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <span className="bracket-team-name">{team.teamName}</span>
    </Link>
  );
}

function Tbd({ label }: { label: string }) {
  return (
    <div className="bracket-seed-row bracket-tbd">
      <span className="playoff-seed bracket-seed-num bracket-seed-tbd">?</span>
      <span className="bracket-team-name muted">{label}</span>
    </div>
  );
}

function MatchBox({
  top,
  bottom,
}: {
  top: { team: Team; seed: number } | { label: string };
  bottom: { team: Team; seed: number } | { label: string };
}) {
  return (
    <div className="bracket-match">
      {'team' in top ? <Seed team={top.team} seed={top.seed} /> : <Tbd label={top.label} />}
      <div className="bracket-match-divider" />
      {'team' in bottom ? <Seed team={bottom.team} seed={bottom.seed} /> : <Tbd label={bottom.label} />}
    </div>
  );
}

/** Klassisches 6-Team Playoff-Bracket: Plätze 1+2 haben ein Freilos in Runde 1. */
export function PlayoffBracket({ seeds }: { seeds: Team[] }) {
  if (seeds.length < 6) {
    return <p className="muted">Für ein Bracket werden mindestens 6 Playoff-Teams benötigt.</p>;
  }

  const [s1, s2, s3, s4, s5, s6] = seeds;

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        <div className="bracket-round">
          <div className="bracket-round-title">Viertelfinale</div>
          <div className="bracket-matches bracket-col-2">
            <MatchBox top={{ team: s3, seed: 3 }} bottom={{ team: s6, seed: 6 }} />
            <MatchBox top={{ team: s4, seed: 4 }} bottom={{ team: s5, seed: 5 }} />
          </div>
        </div>

        <div className="bracket-round">
          <div className="bracket-round-title">Halbfinale</div>
          <div className="bracket-matches bracket-col-2-centered">
            <MatchBox top={{ team: s1, seed: 1 }} bottom={{ label: 'Sieger:in #4 / #5' }} />
            <MatchBox top={{ team: s2, seed: 2 }} bottom={{ label: 'Sieger:in #3 / #6' }} />
          </div>
        </div>

        <div className="bracket-round">
          <div className="bracket-round-title">Finale</div>
          <div className="bracket-matches bracket-col-1-centered">
            <MatchBox top={{ label: 'Sieger:in Halbfinale 1' }} bottom={{ label: 'Sieger:in Halbfinale 2' }} />
          </div>
        </div>
      </div>

      <div className="bracket-placements">
        <div className="bracket-placement-card">
          <div className="bracket-round-title">Spiel um Platz 3</div>
          <MatchBox top={{ label: 'Verlierer:in Halbfinale 1' }} bottom={{ label: 'Verlierer:in Halbfinale 2' }} />
        </div>
        <div className="bracket-placement-card">
          <div className="bracket-round-title">Spiel um Platz 5</div>
          <MatchBox top={{ label: 'Verlierer:in #3 / #6' }} bottom={{ label: 'Verlierer:in #4 / #5' }} />
        </div>
      </div>
    </div>
  );
}
