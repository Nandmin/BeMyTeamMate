import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class EloService {
  private readonly K_FACTOR = 32;
  private readonly DEFAULT_RATING = 1200;

  constructor() {}

  /**
   * Calculates the new ratings for players in two teams.
   * Logic:
   * 1. Calculate average Elo for Team A and Team B.
   * 2. Calculate expected score for each team based on the averages.
   * 3. Determine actual score (1=win, 0=loss, 0.5=draw) based on goals.
   * 4. Calculate rating delta for each team.
   * 5. Apply the delta to each player in the team individually.
   */
  calculateRatingChanges(
    teamA: { userId: string; elo?: number }[],
    teamB: { userId: string; elo?: number }[],
    goalsA: number,
    goalsB: number,
    stats?: { [userId: string]: { goals: number; assists: number } }
  ): Map<string, number> {
    const changes = new Map<string, number>();

    // 1. Calculate Average Elos
    const avgEloA = this.calculateAverageElo(teamA);
    const avgEloB = this.calculateAverageElo(teamB);

    // 2. Expected Scores
    const expectedA = this.getExpectedScore(avgEloA, avgEloB);
    const expectedB = this.getExpectedScore(avgEloB, avgEloA);

    // 3. Actual Scores
    let actualA = 0.5;
    let actualB = 0.5;
    if (goalsA > goalsB) {
      actualA = 1;
      actualB = 0;
    } else if (goalsB > goalsA) {
      actualA = 0;
      actualB = 1;
    }

    // 4. Calculate Delta
    // We treat the team as a single entity to find the rating change,
    // then apply that change to every member.
    const deltaA = Math.round(this.K_FACTOR * (actualA - expectedA));
    const deltaB = Math.round(this.K_FACTOR * (actualB - expectedB));

    // 5. Apply to players (return the new absolute Elo) + Individual Performance Bonus
    const GOAL_BONUS = 3;
    const ASSIST_BONUS = 2;

    teamA.forEach((player) => {
      const currentElo = player.elo || this.DEFAULT_RATING;
      let bonus = 0;
      if (stats && stats[player.userId]) {
        bonus += (stats[player.userId].goals || 0) * GOAL_BONUS;
        bonus += (stats[player.userId].assists || 0) * ASSIST_BONUS;
      }
      changes.set(player.userId, Math.round(currentElo + deltaA + bonus));
    });

    teamB.forEach((player) => {
      const currentElo = player.elo || this.DEFAULT_RATING;
      let bonus = 0;
      if (stats && stats[player.userId]) {
        bonus += (stats[player.userId].goals || 0) * GOAL_BONUS;
        bonus += (stats[player.userId].assists || 0) * ASSIST_BONUS;
      }
      changes.set(player.userId, Math.round(currentElo + deltaB + bonus));
    });

    return changes;
  }

  private calculateAverageElo(team: { elo?: number }[]): number {
    if (team.length === 0) return this.DEFAULT_RATING;
    const total = team.reduce((sum, p) => sum + (p.elo || this.DEFAULT_RATING), 0);
    return total / team.length;
  }

  private getExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }
}
