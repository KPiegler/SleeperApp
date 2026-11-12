import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { transactionWeeks } from '../lib/transactions';
import { buildRosterTimeline } from '../lib/rosterTimeline';
import { fetchTeamByWeek } from '../lib/nflTeamHistory';
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
  const [retryKey, setRetryKey] = useState(0);
  const [teamByWeekByPlayer, setTeamByWeekByPlayer] = useState<Map<string, Map<number, string>>>(new Map());
  const fetchedTeamHistoryIds = useRef<Set<string>>(new Set());

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
  }, [league, weeks, players, retryKey]);

  const allPlayers = useMemo(() => ({ ...players, ...extraPlayers }), [players, extraPlayers]);

  const draftTeamByPlayer = useMemo(() => {
    const map: Record<string, string> = {};
    for (const pick of draftPicks) {
      if (pick.metadata?.team) map[pick.player_id] = pick.metadata.team;
    }
    return map;
  }, [draftPicks]);

  const nflTeamFor = (id: string, week: number | null) => {
    const weekTeam = week != null ? teamByWeekByPlayer.get(id)?.get(week) : undefined;
    return weekTeam ?? (isPastSeason ? draftTeamByPlayer[id] : undefined) ?? allPlayers[id]?.team ?? null;
  };

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

  const currentStepIndex = stepIndex ?? 0;
  const step = timeline[currentStepIndex];

  // NFL-Team zur gerade angezeigten Woche per ESPN-Gamelog nachladen - deckt unterjährige
  // NFL-Trades ab, die Sleeper selbst nicht rückwirkend abbildet. Pro Spieler nur einmal geladen.
  // Bewusst ohne "cancelled"-Abbruch bei Schritt-Wechsel: die Daten sind spieler-, nicht
  // schritt-gebunden, ein später eintreffendes Ergebnis ist also immer noch gültig und darf nicht
  // verworfen werden - sonst bleibt der Spieler dauerhaft auf dem Fallback-Team hängen.
  useEffect(() => {
    if (!step) return;
    const idsNeeded = step.playerIds.filter((id) => {
      const espnId = allPlayers[id]?.espn_id;
      return espnId && !fetchedTeamHistoryIds.current.has(id);
    });
    if (idsNeeded.length === 0) return;
    for (const id of idsNeeded) fetchedTeamHistoryIds.current.add(id);

    Promise.all(
      idsNeeded.map((id) =>
        fetchTeamByWeek(allPlayers[id]!.espn_id!)
          .then((map) => ({ id, map }))
          .catch(() => {
            fetchedTeamHistoryIds.current.delete(id);
            return null;
          }),
      ),
    ).then((results) => {
      const successful = results.filter((r): r is { id: string; map: Map<number, string> } => r !== null);
      if (successful.length === 0) return;
      setTeamByWeekByPlayer((prev) => {
        const next = new Map(prev);
        for (const { id, map } of successful) next.set(id, map);
        return next;
      });
    });
  }, [step, allPlayers]);

  const team = teams.find((t) => t.rosterId === numericRosterId);

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
      {error && <ErrorState message={error} onRetry={() => setRetryKey((k) => k + 1)} />}

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
                nflTeam={nflTeamFor(id, step.week)}
              />
            ))}
          </div>

          <h2>Bank</h2>
          <div className="player-grid">
            {stepBench.length === 0 && <p className="muted">Keine Bankspieler.</p>}
            {stepBench.map((id) => (
              <PlayerCard key={id} playerId={id} player={allPlayers[id]} nflTeam={nflTeamFor(id, step.week)} />
            ))}
          </div>

          {stepReserve.length > 0 && (
            <>
              <h2>Verletztenliste (IR)</h2>
              <div className="player-grid">
                {stepReserve.map((id) => (
                  <PlayerCard key={id} playerId={id} player={allPlayers[id]} nflTeam={nflTeamFor(id, step.week)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
