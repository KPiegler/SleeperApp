import type { SleeperMatchup } from '../api/types';

export interface PlayerPerformanceFact {
  week: number;
  rosterId: number;
  playerId: string;
  points: number;
}

export interface MatchupFact {
  week: number;
  winnerRosterId: number;
  loserRosterId: number;
  winnerPoints: number;
  loserPoints: number;
  margin: number;
}

export interface TeamWeekFact {
  week: number;
  rosterId: number;
  points: number;
}

export interface BenchFact {
  week: number;
  rosterId: number;
  benchPoints: number;
}

export interface LineupFact {
  week: number;
  rosterId: number;
  efficiency: number;
  starterPoints: number;
  benchPoints: number;
}

export interface FunFacts {
  topPlayerPerformance: PlayerPerformanceFact | null;
  biggestBlowout: MatchupFact | null;
  closestMatchup: MatchupFact | null;
  highestTeamWeek: TeamWeekFact | null;
  lowestTeamWeek: TeamWeekFact | null;
  mostBenchPoints: BenchFact | null;
  unluckiestLoss: TeamWeekFact | null;
  bestLineup: LineupFact | null;
}

export function computeFunFacts(weeks: number[], matchupsByWeek: Map<number, SleeperMatchup[]>): FunFacts {
  let topPlayerPerformance: PlayerPerformanceFact | null = null;
  let highestTeamWeek: TeamWeekFact | null = null;
  let lowestTeamWeek: TeamWeekFact | null = null;
  let mostBenchPoints: BenchFact | null = null;
  let biggestBlowout: MatchupFact | null = null;
  let closestMatchup: MatchupFact | null = null;
  let unluckiestLoss: TeamWeekFact | null = null;
  let bestLineup: LineupFact | null = null;

  for (const week of weeks) {
    const entries = matchupsByWeek.get(week) ?? [];

    for (const m of entries) {
      if (m.players_points) {
        for (const [playerId, pts] of Object.entries(m.players_points)) {
          if (pts > 0 && (!topPlayerPerformance || pts > topPlayerPerformance.points)) {
            topPlayerPerformance = { week, rosterId: m.roster_id, playerId, points: pts };
          }
        }
      }

      if (m.points > 0 && (!highestTeamWeek || m.points > highestTeamWeek.points)) {
        highestTeamWeek = { week, rosterId: m.roster_id, points: m.points };
      }
      if (m.points > 0 && (!lowestTeamWeek || m.points < lowestTeamWeek.points)) {
        lowestTeamWeek = { week, rosterId: m.roster_id, points: m.points };
      }

      if (m.starters && m.players && m.players_points) {
        const starterSet = new Set(m.starters);
        const benchIds = m.players.filter((id) => !starterSet.has(id));
        const benchPoints = benchIds.reduce((sum, id) => sum + (m.players_points?.[id] ?? 0), 0);
        if (benchPoints > 0 && (!mostBenchPoints || benchPoints > mostBenchPoints.benchPoints)) {
          mostBenchPoints = { week, rosterId: m.roster_id, benchPoints };
        }

        const starterPoints = m.starters.reduce((sum, id) => sum + (m.players_points?.[id] ?? 0), 0);
        const total = starterPoints + benchPoints;
        if (total > 0) {
          const efficiency = (starterPoints / total) * 100;
          if (!bestLineup || efficiency > bestLineup.efficiency) {
            bestLineup = { week, rosterId: m.roster_id, efficiency, starterPoints, benchPoints };
          }
        }
      }
    }

    const byMatchupId = new Map<number, SleeperMatchup[]>();
    for (const m of entries) {
      if (m.matchup_id == null) continue;
      const list = byMatchupId.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchupId.set(m.matchup_id, list);
    }

    for (const pair of byMatchupId.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      if (a.points === 0 && b.points === 0) continue;

      const winner = a.points >= b.points ? a : b;
      const loser = a.points >= b.points ? b : a;
      const margin = winner.points - loser.points;
      const fact: MatchupFact = {
        week,
        winnerRosterId: winner.roster_id,
        loserRosterId: loser.roster_id,
        winnerPoints: winner.points,
        loserPoints: loser.points,
        margin,
      };

      if (!biggestBlowout || margin > biggestBlowout.margin) biggestBlowout = fact;
      if (!closestMatchup || margin < closestMatchup.margin) closestMatchup = fact;
      if (!unluckiestLoss || loser.points > unluckiestLoss.points) {
        unluckiestLoss = { week, rosterId: loser.roster_id, points: loser.points };
      }
    }
  }

  return {
    topPlayerPerformance,
    biggestBlowout,
    closestMatchup,
    highestTeamWeek,
    lowestTeamWeek,
    mostBenchPoints,
    unluckiestLoss,
    bestLineup,
  };
}
