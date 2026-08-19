import { useEffect, useMemo, useState } from 'react';
import { useLeagueData } from '../context/LeagueDataContext';
import { sleeper } from '../api/sleeper';
import { getPlayersFor } from '../api/playersCache';
import { completedRegularWeeks } from '../lib/scoring';
import { computeFunFacts } from '../lib/funFacts';
import type { FunFacts as FunFactsResult } from '../lib/funFacts';
import { computeStreaks } from '../lib/streaks';
import type { TeamStreak } from '../lib/streaks';
import { computeWaiverLegend } from '../lib/waiverLegend';
import type { WaiverPickup } from '../lib/waiverLegend';
import { PositionBadge } from '../components/PositionBadge';
import { LoadingState, ErrorState } from '../components/LoadingError';
import { TeamPill } from '../components/TeamPill';
import { StatCard as FunFactCard } from '../components/StatCard';
import type { PlayerLite, SleeperMatchup, SleeperTransaction } from '../api/types';

export function FunFacts() {
  const {
    league,
    nflState,
    teams,
    players,
    loading: leagueLoading,
    error: leagueError,
  } = useLeagueData();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facts, setFacts] = useState<FunFactsResult | null>(null);
  const [streaks, setStreaks] = useState<TeamStreak[]>([]);
  const [waiverLegend, setWaiverLegend] = useState<WaiverPickup[]>([]);
  const [extraPlayers, setExtraPlayers] = useState<Record<string, PlayerLite>>({});

  const weeks = useMemo(() => completedRegularWeeks(nflState, league), [nflState, league]);
  const teamByRosterId = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams]);

  useEffect(() => {
    if (leagueLoading || !league) return;
    if (weeks.length === 0) {
      setFacts(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      Promise.all(weeks.map((w) => sleeper.getMatchups(league.league_id, w))),
      Promise.all(weeks.map((w) => sleeper.getTransactions(league.league_id, w))),
    ])
      .then(async ([matchupResults, transactionResults]) => {
        if (cancelled) return;
        const matchupsByWeek = new Map<number, SleeperMatchup[]>();
        weeks.forEach((w, i) => matchupsByWeek.set(w, matchupResults[i]));
        const transactionsByWeek = new Map<number, SleeperTransaction[]>();
        weeks.forEach((w, i) => transactionsByWeek.set(w, transactionResults[i]));

        const computed = computeFunFacts(weeks, matchupsByWeek);
        setFacts(computed);
        setStreaks(computeStreaks(weeks, matchupsByWeek));
        const legend = computeWaiverLegend(weeks, matchupsByWeek, transactionsByWeek);
        setWaiverLegend(legend);

        const missingIds = new Set<string>();
        const topId = computed.topPlayerPerformance?.playerId;
        if (topId && !players[topId]) missingIds.add(topId);
        for (const pickup of legend.slice(0, 3)) {
          if (!players[pickup.playerId]) missingIds.add(pickup.playerId);
        }
        if (missingIds.size > 0) {
          const resolved = await getPlayersFor(Array.from(missingIds));
          if (!cancelled) setExtraPlayers(resolved);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Fehler beim Laden der Fun Facts.');
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
      <h1>Fun Facts</h1>

      {weeks.length === 0 && (
        <div className="banner">
          Es wurde noch keine Woche der regulären Saison gespielt – hier gibt's noch nichts zu feiern
          (oder zu bereuen). Schau nach dem ersten Spieltag nochmal vorbei!
        </div>
      )}

      {loading && weeks.length > 0 && <LoadingState label="Werte alle Wochen aus…" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && facts && (
        <div className="fun-fact-grid">
          {facts.topPlayerPerformance && (
            <FunFactCard emoji="🔥" title="Beste Einzelperformance">
              {(() => {
                const f = facts.topPlayerPerformance;
                const player = players[f.playerId] ?? extraPlayers[f.playerId];
                const team = teamByRosterId.get(f.rosterId);
                return (
                  <>
                    <div className="fun-fact-headline">
                      {player && <PositionBadge position={player.position ?? undefined} />}
                      {player ? `${player.first_name} ${player.last_name}` : f.playerId}
                      <span className="fun-fact-points">{f.points.toFixed(2)} Pkt.</span>
                    </div>
                    <div className="fun-fact-sub">
                      Woche {f.week} · gehörte damals zu <TeamPill team={team} />
                    </div>
                  </>
                );
              })()}
            </FunFactCard>
          )}

          {facts.biggestBlowout && (
            <FunFactCard emoji="💥" title="Höchster Sieg">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.biggestBlowout.winnerRosterId)} />
                <span className="fun-fact-points">+{facts.biggestBlowout.margin.toFixed(2)}</span>
              </div>
              <div className="fun-fact-sub">
                schlug <TeamPill team={teamByRosterId.get(facts.biggestBlowout.loserRosterId)} /> mit{' '}
                {facts.biggestBlowout.winnerPoints.toFixed(2)} : {facts.biggestBlowout.loserPoints.toFixed(2)} in
                Woche {facts.biggestBlowout.week}
              </div>
            </FunFactCard>
          )}

          {facts.closestMatchup && (
            <FunFactCard emoji="😅" title="Knappstes Spiel">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.closestMatchup.winnerRosterId)} />
                <span className="fun-fact-points">+{facts.closestMatchup.margin.toFixed(2)}</span>
              </div>
              <div className="fun-fact-sub">
                knapp gegen <TeamPill team={teamByRosterId.get(facts.closestMatchup.loserRosterId)} /> mit{' '}
                {facts.closestMatchup.winnerPoints.toFixed(2)} : {facts.closestMatchup.loserPoints.toFixed(2)} in
                Woche {facts.closestMatchup.week}
              </div>
            </FunFactCard>
          )}

          {facts.highestTeamWeek && (
            <FunFactCard emoji="🚀" title="Beste Wochenpunktzahl">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.highestTeamWeek.rosterId)} />
                <span className="fun-fact-points">{facts.highestTeamWeek.points.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">in Woche {facts.highestTeamWeek.week}</div>
            </FunFactCard>
          )}

          {facts.lowestTeamWeek && (
            <FunFactCard emoji="🥶" title="Schwächste Wochenpunktzahl">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.lowestTeamWeek.rosterId)} />
                <span className="fun-fact-points">{facts.lowestTeamWeek.points.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">in Woche {facts.lowestTeamWeek.week}</div>
            </FunFactCard>
          )}

          {facts.mostBenchPoints && (
            <FunFactCard emoji="🪑" title="Meiste Punkte auf der Bank verschenkt">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.mostBenchPoints.rosterId)} />
                <span className="fun-fact-points">{facts.mostBenchPoints.benchPoints.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">
                blieben in Woche {facts.mostBenchPoints.week} ungenutzt auf der Bank
              </div>
            </FunFactCard>
          )}

          {facts.unluckiestLoss && (
            <FunFactCard emoji="💔" title="Pechvogel der Saison">
              <div className="fun-fact-headline">
                <TeamPill team={teamByRosterId.get(facts.unluckiestLoss.rosterId)} />
                <span className="fun-fact-points">{facts.unluckiestLoss.points.toFixed(2)} Pkt.</span>
              </div>
              <div className="fun-fact-sub">
                verlor in Woche {facts.unluckiestLoss.week} trotzdem – die höchste Punktzahl einer Woche,
                die am Ende nicht gereicht hat
              </div>
            </FunFactCard>
          )}
        </div>
      )}

      {!loading && !error && streaks.length > 0 && (
        <>
          <h2>Aktuelle Serien</h2>
          <div className="streak-board">
            {streaks.map((s) => (
              <div className="streak-row" key={s.rosterId}>
                <TeamPill team={teamByRosterId.get(s.rosterId)} />
                <span className={`streak-badge streak-${s.result}`}>
                  {s.result === 'W' ? `🔥 ${s.length} Siege` : s.result === 'L' ? `❄️ ${s.length} Niederlagen` : `➖ ${s.length} Remis`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && !error && weeks.length > 0 && (
        <>
          <h2>Waiver-Wire-Legende</h2>
          {waiverLegend.length === 0 ? (
            <p className="muted">Noch kein Waiver-Pickup hat sich bisher ausgezahlt.</p>
          ) : (
            <div className="fun-fact-grid">
              {(() => {
                const best = waiverLegend[0];
                const player = players[best.playerId] ?? extraPlayers[best.playerId];
                return (
                  <FunFactCard emoji="🕵️" title="Bester Waiver-Pickup">
                    <div className="fun-fact-headline">
                      {player && <PositionBadge position={player.position ?? undefined} />}
                      {player ? `${player.first_name} ${player.last_name}` : best.playerId}
                      <span className="fun-fact-points">{best.totalPoints.toFixed(2)} Pkt.</span>
                    </div>
                    <div className="fun-fact-sub">
                      seit Woche {best.addWeek} bei <TeamPill team={teamByRosterId.get(best.rosterId)} /> von der
                      Waiver Wire
                    </div>
                  </FunFactCard>
                );
              })()}

              {waiverLegend.length > 1 && (
                <div className="fun-fact-card">
                  <div className="fun-fact-header">
                    <span className="fun-fact-emoji">🥈</span>
                    <span className="fun-fact-title">Weitere gute Pickups</span>
                  </div>
                  <ul className="waiver-list">
                    {waiverLegend.slice(1, 4).map((p) => {
                      const player = players[p.playerId] ?? extraPlayers[p.playerId];
                      return (
                        <li key={`${p.playerId}-${p.rosterId}-${p.addWeek}`} className="waiver-list-row">
                          <div className="waiver-list-top">
                            {player && <PositionBadge position={player.position ?? undefined} />}
                            <span className="waiver-list-name">
                              {player ? `${player.first_name} ${player.last_name}` : p.playerId}
                            </span>
                            <span className="fun-fact-points">{p.totalPoints.toFixed(2)}</span>
                          </div>
                          <TeamPill team={teamByRosterId.get(p.rosterId)} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
