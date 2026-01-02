import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  collectionData,
  serverTimestamp,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  docData,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { EloService } from './elo.service';
import { GroupMember } from './group.service';
import { Observable, firstValueFrom } from 'rxjs';
import { arrayUnion, increment } from '@angular/fire/firestore';

export interface PlayerStats {
  goals: number;
  assists: number;
}

export interface MatchEvent {
  type: 'goal';
  team: 'A' | 'B';
  scorerId: string;
  assistId?: string;
  timestamp: any;
}

export interface SportEvent {
  id?: string;
  groupId: string;
  title: string;
  sport: string;
  date: Timestamp;
  time: string;
  duration: number;
  location: string;
  locationDetails?: string;
  maxAttendees: number;
  currentAttendees: number;
  attendees: string[];
  creatorId: string;
  createdAt: any;
  recurrenceId?: string;
  status?: 'planned' | 'active' | 'finished';
  teamA?: string[];
  teamB?: string[];
  teamAEloAvg?: number;
  teamBEloAvg?: number;
  goalsA?: number;
  goalsB?: number;
  startedAt?: any;
  endedAt?: any;
  matchEvents?: MatchEvent[];
  playerStats?: { [userId: string]: PlayerStats };
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private eloService = inject(EloService);

  private getEventsCollection(groupId: string) {
    return collection(this.firestore, `groups/${groupId}/events`);
  }

  async createEvent(
    groupId: string,
    eventData: Omit<
      SportEvent,
      'id' | 'groupId' | 'creatorId' | 'createdAt' | 'currentAttendees' | 'attendees'
    >
  ) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in to create an event');

    const data: Omit<SportEvent, 'id'> = {
      ...eventData,
      groupId,
      creatorId: user.uid,
      createdAt: serverTimestamp(),
      currentAttendees: 1, // Creator is the first attendee? Or just set it to 1 and add creator to list
      attendees: [user.uid],
    };

    return addDoc(this.getEventsCollection(groupId), data);
  }

  async createRecurringEvents(
    groupId: string,
    eventData: Omit<
      SportEvent,
      'id' | 'groupId' | 'creatorId' | 'createdAt' | 'currentAttendees' | 'attendees'
    >,
    frequency: 'daily' | 'weekly' | 'monthly',
    endDate: Timestamp
  ) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const recurrenceId = (eventData as any).recurrenceId || crypto.randomUUID();
    const startDate = eventData.date.toDate();
    const end = endDate.toDate();
    const eventsToCreate: Omit<SportEvent, 'id'>[] = [];

    let currentDate = new Date(startDate);

    while (currentDate <= end) {
      eventsToCreate.push({
        ...eventData,
        date: Timestamp.fromDate(new Date(currentDate)),
        groupId,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        currentAttendees: 1,
        attendees: [user.uid],
        recurrenceId,
      });

      if (frequency === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (frequency === 'weekly') {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (frequency === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

      // Safeguard: don't create more than 366 events
      if (eventsToCreate.length > 366) break;
    }

    const promises = eventsToCreate.map((data) => addDoc(this.getEventsCollection(groupId), data));
    return Promise.all(promises);
  }

  async updateEvent(groupId: string, eventId: string, data: Partial<SportEvent>) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    return updateDoc(docRef, data);
  }

  async getEvent(groupId: string, eventId: string): Promise<SportEvent> {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const data = await firstValueFrom(docData(docRef, { idField: 'id' }));
    if (!data || Object.keys(data).length === 0) throw new Error('Event not found');
    return data as SportEvent;
  }

  getEvents(groupId: string): Observable<SportEvent[]> {
    const q = query(this.getEventsCollection(groupId), orderBy('date', 'asc'));
    return collectionData(q, { idField: 'id' }) as Observable<SportEvent[]>;
  }

  async deleteEvent(groupId: string, eventId: string) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    return deleteDoc(docRef);
  }

  async toggleRSVP(groupId: string, eventId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const eventRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const event = (await firstValueFrom(docData(eventRef, { idField: 'id' }))) as SportEvent | null;
    if (!event) throw new Error('Event not found');
    const attendees = event.attendees || [];
    const isJoining = !attendees.includes(user.uid);

    if (isJoining) {
      if (event.currentAttendees >= event.maxAttendees) {
        throw new Error('Sajnáljuk, az esemény betelt.');
      }
      attendees.push(user.uid);
    } else {
      const index = attendees.indexOf(user.uid);
      if (index > -1) attendees.splice(index, 1);
    }

    return updateDoc(eventRef, {
      attendees,
      currentAttendees: attendees.length,
    });
  }

  async startEvent(
    groupId: string,
    eventId: string,
    teamA: string[],
    teamB: string[],
    teamAEloAvg: number,
    teamBEloAvg: number
  ) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    return updateDoc(docRef, {
      status: 'active',
      teamA,
      teamB,
      teamAEloAvg,
      teamBEloAvg,
      startedAt: serverTimestamp(),
      goalsA: 0,
      goalsB: 0,
      matchEvents: [],
    });
  }

  async saveMatchResults(
    groupId: string,
    eventId: string,
    stats: { [userId: string]: PlayerStats },
    goalsA: number,
    goalsB: number,
    teamAData: GroupMember[],
    teamBData: GroupMember[]
  ) {
    const batch = writeBatch(this.firestore);

    // 1. Update Event
    const eventRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    batch.update(eventRef, {
      playerStats: stats,
      goalsA,
      goalsB,
      status: 'finished',
      endedAt: serverTimestamp(),
    });

    // 2. Calculate and Update Elo
    // We map GroupMember to the structure expected by EloService
    const eloTeamA = teamAData.map((m) => ({ userId: m.userId, elo: m.elo }));
    const eloTeamB = teamBData.map((m) => ({ userId: m.userId, elo: m.elo }));

    const newRatings = this.eloService.calculateRatingChanges(
      eloTeamA,
      eloTeamB,
      goalsA,
      goalsB,
      stats
    );

    // 3. Update Member Docs and Global User Docs
    const allPlayers = [...teamAData, ...teamBData];
    allPlayers.forEach((player) => {
      const newElo = newRatings.get(player.userId);
      if (newElo !== undefined) {
        // A. Update Global User Document (Requires the Firestore Rule change mentioned above)
        const userRef = doc(this.firestore, `users/${player.userId}`);
        batch.update(userRef, { elo: newElo });

        // B. Update Group Member Document
        if (player.id === 'owner-fallback') {
          const membersCollection = collection(this.firestore, `groups/${groupId}/members`);
          const newMemberRef = doc(membersCollection);
          batch.set(newMemberRef, {
            userId: player.userId,
            name: player.name,
            photo: player.photo || null,
            role: 'Csapatkapitány',
            isAdmin: true,
            joinedAt: player.joinedAt,
            skillLevel: player.skillLevel || 50,
            elo: newElo,
          });
        } else if (player.id) {
          const memberRef = doc(this.firestore, `groups/${groupId}/members/${player.id}`);
          batch.update(memberRef, { elo: newElo });
        }
      }
    });

    return batch.commit();
  }

  // Server-side filtered queries to reduce client data transfer
  getUpcomingEvents(groupId: string): Observable<SportEvent[]> {
    // Fetch events that are planned or active (exclude finished)
    const q = query(
      this.getEventsCollection(groupId),
      where('status', 'in', ['planned', 'active']),
      orderBy('date', 'asc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<SportEvent[]>;
  }

  getPastEvents(groupId: string): Observable<SportEvent[]> {
    const q = query(
      this.getEventsCollection(groupId),
      where('status', '==', 'finished'),
      orderBy('date', 'desc')
    );
    return collectionData(q, { idField: 'id' }) as Observable<SportEvent[]>;
  }
}
