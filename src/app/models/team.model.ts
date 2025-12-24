import { Timestamp } from '@angular/fire/firestore';

export interface Team {
  id: string;
  eventId: string;
  team1: string[]; // User UIDs
  team2: string[];
  team1AvgElo: number;
  team2AvgElo: number;
  team1FormFactor: number;
  team2FormFactor: number;
  balanceScore: number; // Lower is better (closer to 0)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PlayerStats {
  userId: string;
  goals: number;
  points: number; // For sports requiring points instead of goals
  assists?: number;
}

export interface Match {
  id: string;
  eventId: string;
  teamId: string;
  team1Score: number;
  team2Score: number;
  team1Stats: PlayerStats[];
  team2Stats: PlayerStats[];
  matchPoints: {
    team1: number; // 3, 1, or 0
    team2: number; // 3, 1, or 0
  };
  completedAt: Timestamp;
}

export interface CreateMatchDto {
  eventId: string;
  teamId: string;
  team1Score: number;
  team2Score: number;
  team1Stats: PlayerStats[];
  team2Stats: PlayerStats[];
}
