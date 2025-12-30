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
  getDoc,
  deleteDoc,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';

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
  goalsA?: number;
  goalsB?: number;
  startedAt?: any;
}

@Injectable({
  providedIn: 'root',
})
export class EventService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

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
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Event not found');
    return { id: docSnap.id, ...docSnap.data() } as SportEvent;
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
    const eventSnap = await getDoc(eventRef);
    if (!eventSnap.exists()) throw new Error('Event not found');

    const event = eventSnap.data() as SportEvent;
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

  async startEvent(groupId: string, eventId: string, teamA: string[], teamB: string[]) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    return updateDoc(docRef, {
      status: 'active',
      teamA,
      teamB,
      startedAt: serverTimestamp(),
      goalsA: 0,
      goalsB: 0,
    });
  }
}
