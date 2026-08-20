import { Link } from 'react-router-dom';
import { initials } from '../lib/avatar';
import type { BracketMatch, Team } from '../api/types';

type Slot = { team: Team; seed?: number; winner?: boolean } | { label: string };

function Seed({ team, seed, winner }: { team: Team; seed?: number; winner?: boolean }) {
  return (
    <Link to={`/team/${team.rosterId}`} className={`bracket-seed-row${winner ? ' bracket-seed-row-winner' : ''}`}>
      {seed != null && <span className="playoff-seed bracket-seed-num">{seed}</span>}
      {team.avatarUrl ? (
        <img src={team.avatarUrl} alt="" className="bracket-avatar" />
      ) : (
        <div className="bracket-avatar table-avatar-fallback">{initials(team.teamName)}</div>
      )}
      <span className="bracket-team-name">{team.teamName}</span>
      {winner && (
        <span className="bracket-winner-icon" aria-label="Sieger:in">
          🏆
        </span>
      )}
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

function MatchBox({ top, bottom }: { top: Slot; bottom: Slot }) {
  return (
    <div className="bracket-match">
      {'team' in top ? <Seed team={top.team} seed={top.seed} winner={top.winner} /> : <Tbd label={top.label} />}
      <div className="bracket-match-divider" />
      {'team' in bottom ? (
        <Seed team={bottom.team} seed={bottom.seed} winner={bottom.winner} />
      ) : (
        <Tbd label={bottom.label} />
      )}
    </div>
  );
}

/** 4-Team Playoff-Bracket: Halbfinale 1 vs. 4 und 2 vs. 3, dann Finale + Spiel um Platz 3. */
function FourTeamBracket({ seeds }: { seeds: Team[] }) {
  const [s1, s2, s3, s4] = seeds;

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        <div className="bracket-round">
          <div className="bracket-round-title">Halbfinale</div>
          <div className="bracket-matches bracket-col-2-centered">
            <MatchBox top={{ team: s1, seed: 1 }} bottom={{ team: s4, seed: 4 }} />
            <MatchBox top={{ team: s2, seed: 2 }} bottom={{ team: s3, seed: 3 }} />
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
      </div>
    </div>
  );
}

/** Klassisches 6-Team Playoff-Bracket: Plätze 1+2 haben ein Freilos in Runde 1. */
function SixTeamBracket({ seeds }: { seeds: Team[] }) {
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

/** Löst den Roster einer Bracket-Slot-Referenz auf: direkt gesetzt oder aus einem Vorgänger-Match. */
function slotRosterId(match: BracketMatch, slot: 't1' | 't2', byMatchId: Map<number, BracketMatch>): number | null {
  const direct = match[slot];
  if (direct != null) return direct;
  const from = slot === 't1' ? match.t1_from : match.t2_from;
  const sourceMatchId = from?.w ?? from?.l;
  if (sourceMatchId == null) return null;
  const source = byMatchId.get(sourceMatchId);
  if (!source) return null;
  return from?.w != null ? source.w : source.l;
}

function roundTitle(roundIndex: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundIndex;
  if (fromEnd === 1) return 'Finale';
  if (fromEnd === 2) return 'Halbfinale';
  if (fromEnd === 3) return 'Viertelfinale';
  return `Runde ${roundIndex + 1}`;
}

/** Echtes Playoff-Bracket auf Basis der tatsächlichen Sleeper-Ergebnisse (winners_bracket). */
function ResultsBracket({
  matches,
  teamByRosterId,
  seedByRosterId,
}: {
  matches: BracketMatch[];
  teamByRosterId: Map<number, Team>;
  seedByRosterId: Map<number, number>;
}) {
  const byMatchId = new Map(matches.map((m) => [m.m, m]));
  const championship = matches.filter((m) => !m.p || m.p === 1).sort((a, b) => a.r - b.r || a.m - b.m);
  const placements = [...matches]
    .filter((m) => m.p != null && m.p !== 1)
    .sort((a, b) => (a.p ?? 0) - (b.p ?? 0));

  const rounds = Array.from(new Set(championship.map((m) => m.r))).sort((a, b) => a - b);

  const slot = (match: BracketMatch, s: 't1' | 't2'): Slot => {
    const rosterId = slotRosterId(match, s, byMatchId);
    if (rosterId == null) {
      const from = s === 't1' ? match.t1_from : match.t2_from;
      return { label: from?.w != null ? 'Sieger:in offen' : from?.l != null ? 'Verlierer:in offen' : 'TBD' };
    }
    const team = teamByRosterId.get(rosterId);
    if (!team) return { label: `Team ${rosterId}` };
    return { team, seed: seedByRosterId.get(rosterId), winner: match.w != null && match.w === rosterId };
  };

  return (
    <div className="bracket-wrap">
      <div className="bracket">
        {rounds.map((r, idx) => {
          const roundMatches = championship.filter((m) => m.r === r);
          return (
            <div className="bracket-round" key={r}>
              <div className="bracket-round-title">{roundTitle(idx, rounds.length)}</div>
              <div
                className={`bracket-matches ${roundMatches.length > 1 ? 'bracket-col-2-centered' : 'bracket-col-1-centered'}`}
              >
                {roundMatches.map((m) => (
                  <MatchBox key={m.m} top={slot(m, 't1')} bottom={slot(m, 't2')} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {placements.length > 0 && (
        <div className="bracket-placements">
          {placements.map((m) => (
            <div className="bracket-placement-card" key={m.m}>
              <div className="bracket-round-title">Spiel um Platz {m.p}</div>
              <MatchBox top={slot(m, 't1')} bottom={slot(m, 't2')} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlayoffBracket({
  seeds,
  results,
  teamByRosterId,
}: {
  seeds: Team[];
  results?: BracketMatch[];
  teamByRosterId?: Map<number, Team>;
}) {
  if (results && results.length > 0 && teamByRosterId) {
    const seedByRosterId = new Map(seeds.map((t, i) => [t.rosterId, i + 1]));
    return <ResultsBracket matches={results} teamByRosterId={teamByRosterId} seedByRosterId={seedByRosterId} />;
  }
  if (seeds.length >= 6) return <SixTeamBracket seeds={seeds} />;
  if (seeds.length === 4) return <FourTeamBracket seeds={seeds} />;
  return <p className="muted">Für ein Bracket werden mindestens 4 Playoff-Teams benötigt.</p>;
}
