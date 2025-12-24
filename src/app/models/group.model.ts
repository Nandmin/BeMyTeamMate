import { Timestamp } from '@angular/fire/firestore';

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string; // User UID
  members: string[]; // User UIDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateGroupDto {
  name: string;
  description?: string;
  members: string[];
}
