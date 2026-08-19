import { useEffect, useMemo, useState } from 'react';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { completedRegularWeeks, sumFantasyPointsByPlayer } from '../lib/scoring';
import {
  mvpManager,
  lastPlace,
  benchWasteTotals,
  heartbreakCounts,
  computeDraftPerformance,
} from '../lib/seasonAwards';
import { PositionBadge } from '../components/PositionBadge';
import { StatCard } from '../components/StatCard';
import { TeamPill } from '../components/TeamPill';
import { LoadingState, ErrorState } from '../components/LoadingError';
import type { DraftPick, PlayerLite, SleeperMatchup, WeekStats } from '../api/types';

function pickPlayerName(pick: DraftPick): string {
  const m = pick.metadata;
  if (!m) return pick.player_id;
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || pick.player_id;
}

export function Awards() {
  const { league, nflState, teams, players, loading: leagueLoading, error: leagueError } = useLeagueData();
  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);
  const weeks = useMemo(() => completedRegularWeeks(nflState, league), [nflState, league]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [benchAward, setBenchAward] = useState<{ rosterId: number; total: number } | null>(null);
  const [heartbreakAward, setHeartbreakAward] = useState<{ rosterId: number; total: number } | null>(null);
  const [draftSteal, setDraftSteal] = useState<ReturnType<typeof computeDraftPerformance>[number] | null>(null);
  const [draftFlop, setDraftFlop] = useState<ReturnType<typeof computeDraftPerformance>[number] | null>(null);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, PlayerLite>>({});

  const mvp = useMemo(() => (weeks.length > 0 ? mvpManager(teams) : null), [teams, weeks.length]);
  const wornOutTeam = useMemo(() => (weeks.length > 0 ? lastPlace(teams) : null), [teams, weeks.length]);

  useEffect(() => {
    if (leagueLoading || !league) return;
    if (weeks.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      Promise.all(weeks.map((w) => sleeper.getMatchups(league.league_id, w))),
      Promise.all(weeks.map((w) => sleeper.getWeekStats(league.season, w))),
      league.draft_id ? sleeper.getDraftPicks(league.draft_id) : Promise.resolve<DraftPick[]>([]),
    ])
      .then(async ([matchupResults, weekStatsResults, draftPicks]) => {
        if (cancelled) return;
        const matchupsByWeek = new Map<number, SleeperMatchup[]>();
        weeks.forEach((w, i) => matchupsByWeek.set(w, matchupResults[i]));

        const bench = benchWasteTotals(weeks, matchupsByWeek);
        setBenchAward(bench[0] ?? null);

        const heartbreak = heartbreakCounts(weeks, matchupsByWeek);
        setHeartbreakAward(heartbreak[0] ?? null);

        if (draftPicks.length > 0) {
          const seasonPoints = sumFantasyPointsByPlayer(weekStatsResults as WeekStats[], league.scoring_settings);
          const performance = computeDraftPerformance(draftPicks, seasonPoints).filter((p) => p.seasonPoints > 0);
          if (performance.length > 0) {
            const bySteal = [...performance].sort((a, b) => b.value - a.value);
            const byFlop = [...performance].sort((a, b) => a.value - b.value);
            setDraftSteal(bySteal[0] ?? null);
            setDraftFlop(byFlop[0] ?? null);

            const missing = [bySteal[0], byFlop[0]]
              .filter(Boolean)
              .map((p) => p!.pick.player_id)
              .filter((id) => !players[id]);
            if (missing.length > 0) {
              const resolved = await getPlayersFor(missing);
              if (!cancelled) setExtraPlayers(resolved);
            }
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden der Season Awards.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [league, leagueLoading, weeks, players]);

  if (leagueLoading) return <LoadingState label="Lade Liga-Daten…" />;
  if (leagueError) return <ErrorState message={leagueError} />;

  return (
    <div className="page">
      <h1>Season Awards</h1>

      {weeks.length === 0 && (
        <div className="banner">
          Es wurde noch keine Woche der regulären Saison gespielt – die Awards werden erst spannend, sobald
          Ergebnisse da sind.
        </div>
      )}

      {loading && weeks.length > 0 && <LoadingState label="Werte die Saison aus…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && weeks.length > 0 && (
        <div className="fun-fact-grid">
          {mvp && (
            <StatCard emoji="🏆" title="MVP-Manager">
              <div className="fun-fact-headline">
                <TeamPill team={mvp} />
                <span className="fun-fact-points">{mvp.fpts.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">die meisten Gesamtpunkte der Liga bisher</div>
            </StatCard>
          )}

          {wornOutTeam && (
            <StatCard emoji="🪦" title="Rote Laterne">
              <div className="fun-fact-headline">
                <TeamPill team={wornOutTeam} />
                <span className="fun-fact-points">
                  {wornOutTeam.wins}-{wornOutTeam.losses}
                  {wornOutTeam.ties > 0 ? `-${wornOutTeam.ties}` : ''}
                </span>
              </div>
              <div className="fun-fact-sub">die schwächste Bilanz der Liga bisher</div>
            </StatCard>
          )}

          {benchAward && (
            <StatCard emoji="🪑" title="Bankwärmer-Award">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(benchAward.rosterId)} />
                <span className="fun-fact-points">{benchAward.total.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">insgesamt ungenutzt auf der Bank liegen gelassen</div>
            </StatCard>
          )}

          {heartbreakAward && heartbreakAward.total > 0 && (
            <StatCard emoji="💔" title="Herzschmerz-Award">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(heartbreakAward.rosterId)} />
                <span className="fun-fact-points">{heartbreakAward.total}×</span>
              </div>
              <div className="fun-fact-sub">Niederlagen mit weniger als 5 Punkten Unterschied</div>
            </StatCard>
          )}

          {draftSteal && (
            <StatCard emoji="💎" title="Draft-Steal des Jahres">
              {(() => {
                const player = players[draftSteal.pick.player_id] ?? extraPlayers[draftSteal.pick.player_id];
                return (
                  <>
                    <div className="fun-fact-headline">
                      <PositionBadge position={draftSteal.pick.metadata?.position} />
                      {player ? `${player.first_name} ${player.last_name}` : pickPlayerName(draftSteal.pick)}
                      <span className="fun-fact-points">Rang {draftSteal.finishRank}</span>
                    </div>
                    <div className="fun-fact-sub">
                      Pick {draftSteal.pick.pick_no} von <TeamPill team={teamByRosterId.get(draftSteal.pick.roster_id)} />{' '}
                      · {draftSteal.seasonPoints.toFixed(2)} Saisonpunkte
                    </div>
                  </>
                );
              })()}
            </StatCard>
          )}

          {draftFlop && draftFlop.pick.pick_no !== draftSteal?.pick.pick_no && (
            <StatCard emoji="🥴" title="Draft-Flop des Jahres">
              {(() => {
                const player = players[draftFlop.pick.player_id] ?? extraPlayers[draftFlop.pick.player_id];
                return (
                  <>
                    <div className="fun-fact-headline">
                      <PositionBadge position={draftFlop.pick.metadata?.position} />
                      {player ? `${player.first_name} ${player.last_name}` : pickPlayerName(draftFlop.pick)}
                      <span className="fun-fact-points">Rang {draftFlop.finishRank}</span>
                    </div>
                    <div className="fun-fact-sub">
                      Pick {draftFlop.pick.pick_no} von <TeamPill team={teamByRosterId.get(draftFlop.pick.roster_id)} />{' '}
                      · nur {draftFlop.seasonPoints.toFixed(2)} Saisonpunkte
                    </div>
                  </>
                );
              })()}
            </StatCard>
          )}
        </div>
      )}
    </div>
  );
}
