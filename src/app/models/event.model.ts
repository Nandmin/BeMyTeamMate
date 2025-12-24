import { Timestamp } from '@angular/fire/firestore';

export type RSVPResponse = 'attending' | 'cant' | 'not-interested';

export interface Event {
  id: string;
  createdBy: string; // User UID
  groupId: string;
  sportType: string; // e.g., 'Foci', 'Kosárlabda', 'Röplabda'
  location: string;
  dateTime: Timestamp;
  invitedUsers: string[]; // User UIDs
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RSVP {
  id: string;
  eventId: string;
  userId: string;
  response: RSVPResponse;
  timestamp: Timestamp;
}

export interface CreateEventDto {
  groupId: string;
  sportType: string;
  location: string;
  dateTime: Date;
  invitedUsers: string[];
}
