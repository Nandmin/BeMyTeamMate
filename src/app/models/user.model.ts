import { Timestamp } from '@angular/fire/firestore';

export interface AppUser {
  uid: string;
  email?: string;
  displayName: string;
  photoURL?: string;
  elo: number;
  formFactor: number; // 0.0 - 2.0 multiplier based on recent performance
  bio?: string;
  role?: 'user' | 'siteadmin';
  lastGroupId?: string; // Optional field for firestore rule validation
  createdAt: Timestamp;
  lastActive: Timestamp;
  profileUpdatedAt?: Timestamp;
  lastModifiedFields?: string[];
}

export interface CreateUserDto {
  email: string;
  displayName: string;
  photoURL?: string;
}
