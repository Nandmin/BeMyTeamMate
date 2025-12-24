import { Timestamp } from '@angular/fire/firestore';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  fcmTokens: string[]; // Multiple devices support
  elo: number;
  formFactor: number; // 0.0 - 2.0 multiplier based on recent performance
  createdAt: Timestamp;
  lastActive: Timestamp;
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  photoURL?: string;
}
