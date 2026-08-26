import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { transactionWeeks } from '../lib/transactions';
import { buildRosterTimeline } from '../lib/rosterTimeline';
import { PlayerCard } from '../components/PlayerCard';
import { LoadingState, ErrorState } from '../components/LoadingError';
import { initials } from '../lib/avatar';
import type { DraftPick, PlayerLite, SleeperMatchup, SleeperTransaction } from '../api/types';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF'];

function positionRank(position: string | null | undefined): number {
  const idx = POSITION_ORDER.indexOf(position ?? '');
  return idx === -1 ? POSITION_ORDER.length : idx;
}

export function TeamPage() {
  const { rosterId } = useParams<{ rosterId: string }>();
  const { teams, players, league, nflState } = useLeagueData();
  const isPastSeason = league?.status === 'complete';
  const numericRosterId = Number(rosterId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftPicks, setDraftPicks] = useState<DraftPick[]>([]);
  const [transactions, setTransactions] = useState<(SleeperTransaction & { week: number })[]>([]);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, PlayerLite>>({});
  const [matchupsByWeek, setMatchupsByWeek] = useState<Map<number, SleeperMatchup[]>>(new Map());
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  const weeks = useMemo(() => transactionWeeks(nflState, league), [nflState, league]);

  useEffect(() => {
    setStepIndex(null);
  }, [numericRosterId, league?.league_id]);

  useEffect(() => {
    if (!league) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      league.draft_id ? sleeper.getDraftPicks(league.draft_id) : Promise.resolve<DraftPick[]>([]),
      Promise.all(weeks.map((w) => sleeper.getTransactions(league.league_id, w))),
      Promise.all(weeks.map((w) => sleeper.getMatchups(league.league_id, w))),
    ])
      .then(async ([picks, transactionResults, matchupResults]) => {
        if (cancelled) return;
        const flatTxns: (SleeperTransaction & { week: number })[] = [];
        weeks.forEach((w, i) => {
          for (const t of transactionResults[i]) flatTxns.push({ ...t, week: w });
        });
        setDraftPicks(picks);
        setTransactions(flatTxns);

        const matchupMap = new Map<number, SleeperMatchup[]>();
        weeks.forEach((w, i) => matchupMap.set(w, matchupResults[i]));
        setMatchupsByWeek(matchupMap);

        const missingIds = new Set<string>();
        for (const p of picks) {
          if (!players[p.player_id]) missingIds.add(p.player_id);
        }
        for (const t of flatTxns) {
          for (const id of [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]) {
            if (!players[id]) missingIds.add(id);
          }
        }
        if (missingIds.size > 0) {
          const resolved = await getPlayersFor(Array.from(missingIds));
          if (!cancelled) setExtraPlayers(resolved);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden des Kader-Verlaufs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, weeks, players]);

  const allPlayers = useMemo(() => ({ ...players, ...extraPlayers }), [players, extraPlayers]);

  const draftTeamByPlayer = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pick of draftPicks) {
      if (pick.metadata?.team) map[pick.player_id] = pick.metadata.team;
    }
    return map;
  }, [draftPicks]);

  const nflTeamFor = (id: string) =>
    (isPastSeason ? draftTeamByPlayer[id] : undefined) ?? allPlayers[id]?.team ?? null;

  const timeline = useMemo(
    () => buildRosterTimeline(numericRosterId, draftPicks, transactions),
    [numericRosterId, draftPicks, transactions],
  );

  const weekMatchupForRoster = useMemo(() => {
    const map = new Map<number, SleeperMatchup>();
    for (const [week, matchups] of matchupsByWeek) {
      const entry = matchups.find((m) => m.roster_id === numericRosterId);
      if (entry && entry.players && entry.players.length > 0) map.set(week, entry);
    }
    return map;
  }, [matchupsByWeek, numericRosterId]);

  useEffect(() => {
    if (loading || stepIndex !== null || timeline.length === 0) return;
    setStepIndex(timeline.length - 1);
  }, [timeline, stepIndex, loading]);

  const team = teams.find((t) => t.rosterId === numericRosterId);

  if (!team) {
    return (
      <div className="page">
        <p>Team nicht gefunden.</p>
        <Link to="/">Zurück zur Rangliste</Link>
      </div>
    );
  }

  const currentStepIndex = stepIndex ?? 0;
  const step = timeline[currentStepIndex];

  const nonBenchSlots = (league?.roster_positions ?? []).filter((p) => p !== 'BN');
  const reserveSet = new Set(team.reserve);
  const starterSet = new Set(team.starters);
  const starterSlotById = new Map(team.starters.map((id, i) => [id, nonBenchSlots[i] ?? '—']));

  const weekMatchup = step?.week != null ? weekMatchupForRoster.get(step.week) : undefined;
  const weekStarterIds = weekMatchup
    ? weekMatchup.starters?.filter((id): id is string => !!id && id !== '0') ?? []
    : undefined;

  const starterIdsForStep = weekStarterIds ? new Set(weekStarterIds) : starterSet;
  const starterSlotForStep = weekStarterIds
    ? new Map(weekStarterIds.map((id, i) => [id, nonBenchSlots[i] ?? '—']))
    : starterSlotById;
  const displayPlayerIds = weekMatchup ? (weekMatchup.players ?? []) : (step?.playerIds ?? []);

  const stepStarters = displayPlayerIds
    .filter((id) => starterIdsForStep.has(id))
    .sort((a, b) => positionRank(starterSlotForStep.get(a)) - positionRank(starterSlotForStep.get(b)));
  const stepReserve = displayPlayerIds
    .filter((id) => reserveSet.has(id) && !starterIdsForStep.has(id))
    .sort((a, b) => positionRank(allPlayers[a]?.position) - positionRank(allPlayers[b]?.position));
  const stepBench = displayPlayerIds
    .filter((id) => !starterIdsForStep.has(id) && !reserveSet.has(id))
    .sort((a, b) => positionRank(allPlayers[a]?.position) - positionRank(allPlayers[b]?.position));

  const stepDateLabel = (s: typeof step) => {
    if (!s) return '';
    if (s.week == null) return 'Vor Saisonbeginn';
    const date = s.date ? new Date(s.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
    return `Woche ${s.week}${date ? ` · ${date}` : ''}`;
  };

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

      {loading && <LoadingState label="Lade Kader-Verlauf…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && step && (
        <>
          <h2>Kader-Verlauf</h2>
          <div className="week-picker">
            <button
              className="btn btn-ghost"
              onClick={() => setStepIndex((i) => Math.max(0, (i ?? 0) - 1))}
              disabled={currentStepIndex <= 0}
            >
              ← Vorher
            </button>
            <select
              className="week-select"
              value={currentStepIndex}
              onChange={(e) => setStepIndex(Number(e.target.value))}
            >
              {timeline.map((s, i) => (
                <option key={s.key} value={i}>
                  {i === 0 ? 'Draft-Kader' : stepDateLabel(s)}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost"
              onClick={() => setStepIndex((i) => Math.min(timeline.length - 1, (i ?? 0) + 1))}
              disabled={currentStepIndex >= timeline.length - 1}
            >
              Danach →
            </button>
          </div>

          {currentStepIndex === 0 ? (
            <p className="muted playoff-picture-note">Kader direkt nach dem Draft, noch vor jeder Änderung.</p>
          ) : (
            <p className="muted playoff-picture-note">
              Stand nach: {stepDateLabel(step)}
              {step.added.length > 0 && (
                <>
                  {' '}
                  ·{' '}
                  {step.added.map((id) => (
                    <span className="txn-player txn-player-add" key={`add-${id}`}>
                      {allPlayers[id] ? `${allPlayers[id].first_name} ${allPlayers[id].last_name}` : id}
                    </span>
                  ))}
                </>
              )}
              {step.dropped.length > 0 && (
                <>
                  {' '}
                  {step.dropped.map((id) => (
                    <span className="txn-player txn-player-drop" key={`drop-${id}`}>
                      {allPlayers[id] ? `${allPlayers[id].first_name} ${allPlayers[id].last_name}` : id}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}

          <h2>Starter</h2>
          <div className="player-grid">
            {stepStarters.length === 0 && <p className="muted">Keine Starter.</p>}
            {stepStarters.map((id) => (
              <PlayerCard
                key={id}
                playerId={id}
                player={allPlayers[id]}
                slot={starterSlotForStep.get(id) ?? '—'}
                nflTeam={nflTeamFor(id)}
              />
            ))}
          </div>

          <h2>Bank</h2>
          <div className="player-grid">
            {stepBench.length === 0 && <p className="muted">Keine Bankspieler.</p>}
            {stepBench.map((id) => (
              <PlayerCard key={id} playerId={id} player={allPlayers[id]} nflTeam={nflTeamFor(id)} />
            ))}
          </div>

          {stepReserve.length > 0 && (
            <>
              <h2>Verletztenliste (IR)</h2>
              <div className="player-grid">
                {stepReserve.map((id) => (
                  <PlayerCard key={id} playerId={id} player={allPlayers[id]} nflTeam={nflTeamFor(id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
