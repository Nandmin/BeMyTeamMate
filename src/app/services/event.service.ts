import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  getDoc,
  limit,
  startAfter,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { EloService } from './elo.service';
import { GroupMember } from './group.service';
import { NotificationService } from './notification.service';
import { Observable, defer, from, of } from 'rxjs';
import { map, tap, switchMap, catchError } from 'rxjs/operators';

export interface PlayerStats {
  goals: number;
  assists: number;
  eloDelta?: number;
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
  private notificationService = inject(NotificationService);
  private cacheTtlMs = 5 * 60 * 1000;
  private eventCache = new Map<string, { data: SportEvent; ts: number }>();
  private eventsListCache = new Map<string, { data: SportEvent[]; ts: number }>();

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
      status: eventData.status ?? 'planned',
    };

    const docRef = await addDoc(this.getEventsCollection(groupId), data);
    this.invalidateEventCaches(groupId);

    const groupSnap = await getDoc(doc(this.firestore, `groups/${groupId}`));
    const groupName = groupSnap.exists() ? (groupSnap.data() as any).name : 'Csoport';
    await this.notificationService.notifyGroupMembers(
      {
        type: 'event_created',
        groupId,
        eventId: docRef.id,
        title: `${groupName} - uj esemeny`,
        body: `${eventData.title} letrehozva.`,
        link: `/groups/${groupId}/events/${docRef.id}`,
        actorId: user.uid,
        actorName: user.displayName || 'Ismeretlen',
        actorPhoto: user.photoURL || null,
      },
      [user.uid]
    );
    return docRef;
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
        status: (eventData as any).status ?? 'planned',
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
    const result = await Promise.all(promises);
    this.invalidateEventCaches(groupId);

    const groupSnap = await getDoc(doc(this.firestore, `groups/${groupId}`));
    const groupName = groupSnap.exists() ? (groupSnap.data() as any).name : 'Csoport';
    await this.notificationService.notifyGroupMembers(
      {
        type: 'event_created',
        groupId,
        title: `${groupName} - uj esemeny sorozat`,
        body: `${eventData.title} (${result.length} alkalom) letrehozva.`,
        link: `/groups/${groupId}`,
        actorId: user.uid,
        actorName: user.displayName || 'Ismeretlen',
        actorPhoto: user.photoURL || null,
      },
      [user.uid]
    );
    return result;
  }

  async updateEvent(groupId: string, eventId: string, data: Partial<SportEvent>) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const result = await updateDoc(docRef, data);
    this.invalidateEventCaches(groupId, eventId);
    return result;
  }

  async getEvent(groupId: string, eventId: string): Promise<SportEvent> {
    const cached = this.getCachedEvent(groupId, eventId);
    if (cached) return cached;
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error('Event not found');
    const event = { id: snap.id, ...(snap.data() as SportEvent) } as SportEvent;
    this.setCachedEvent(groupId, eventId, event);
    return event;
  }

  getEvents(groupId: string): Observable<SportEvent[]> {
    return this.getUpcomingEventsInternal(groupId, { daysAhead: 180, limit: 200 });
  }

  async deleteEvent(groupId: string, eventId: string) {
    const docRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const user = this.authService.currentUser();
    const [eventSnap, groupSnap] = await Promise.all([
      getDoc(docRef),
      getDoc(doc(this.firestore, `groups/${groupId}`)),
    ]);
    const event = eventSnap.exists() ? (eventSnap.data() as SportEvent) : null;
    const groupName = groupSnap.exists() ? ((groupSnap.data() as any).name as string) : 'Csoport';

    const result = await deleteDoc(docRef);
    this.invalidateEventCaches(groupId, eventId);

    if (event) {
      await this.notificationService.notifyGroupMembers(
        {
          type: 'event_cancelled',
          groupId,
          eventId,
          title: `${groupName} - esemeny lemondva`,
          body: `${event.title || 'Egy esemeny'} lemondva.`,
          link: `/groups/${groupId}`,
          actorId: user?.uid,
          actorName: user?.displayName || 'Ismeretlen',
          actorPhoto: user?.photoURL || null,
        },
        user?.uid ? [user.uid] : []
      );
    }
    return result;
  }

  async toggleRSVP(groupId: string, eventId: string) {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in');

    const eventRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    const snap = await getDoc(eventRef);
    if (!snap.exists()) throw new Error('Event not found');
    const event = { id: snap.id, ...(snap.data() as SportEvent) } as SportEvent;
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

    const result = await updateDoc(eventRef, {
      attendees,
      currentAttendees: attendees.length,
    });
    this.invalidateEventCaches(groupId, eventId);

    const groupSnap = await getDoc(doc(this.firestore, `groups/${groupId}`));
    const groupName = groupSnap.exists() ? ((groupSnap.data() as any).name as string) : 'Csoport';
    await this.notificationService.notifyGroupMembers(
      {
        type: isJoining ? 'event_rsvp_yes' : 'event_rsvp_no',
        groupId,
        eventId,
        title: `${groupName} - visszajelzes`,
        body: `${user.displayName || 'Ismeretlen'} ${
          isJoining ? 'reszt vesz' : 'nem vesz reszt'
        } az esemenyen: ${event.title}.`,
        link: `/groups/${groupId}/events/${eventId}`,
        actorId: user.uid,
        actorName: user.displayName || 'Ismeretlen',
        actorPhoto: user.photoURL || null,
      },
      [user.uid]
    );
    return result;
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
    const result = await updateDoc(docRef, {
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
    this.invalidateEventCaches(groupId, eventId);
    return result;
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
    const DEFAULT_ELO = 1200;

    // 1. Calculate and Update Elo
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

    const allPlayers = [...teamAData, ...teamBData];
    const statsWithElo: { [userId: string]: PlayerStats } = {};

    allPlayers.forEach((player) => {
      const currentElo = player.elo ?? DEFAULT_ELO;
      const newElo = newRatings.get(player.userId) ?? currentElo;
      const delta = Math.round(newElo - currentElo);
      const playerStats = stats[player.userId] || { goals: 0, assists: 0 };
      statsWithElo[player.userId] = {
        goals: playerStats.goals || 0,
        assists: playerStats.assists || 0,
        eloDelta: delta,
      };
    });

    // 2. Update Event
    const eventRef = doc(this.firestore, `groups/${groupId}/events/${eventId}`);
    batch.update(eventRef, {
      playerStats: statsWithElo,
      goalsA,
      goalsB,
      status: 'finished',
      endedAt: serverTimestamp(),
    });

    // 3. Update Member Docs and Global User Docs
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

    const result = await batch.commit();
    this.invalidateEventCaches(groupId, eventId);
    return result;
  }

  // Server-side filtered queries to reduce client data transfer
  getUpcomingEvents(groupId: string): Observable<SportEvent[]> {
    return this.getUpcomingEventsInternal(groupId, { daysAhead: 3650, limit: 500 });
  }

  getPastEvents(groupId: string): Observable<SportEvent[]> {
    return this.getPastEventsInternal(groupId, { daysBack: 3650, limit: 500 });
  }

  getUpcomingEventsInternal(
    groupId: string,
    options: { daysAhead: number; limit: number; startAfterDate?: Timestamp }
  ): Observable<SportEvent[]> {
    const cacheKey = this.eventsListCacheKey(groupId, 'upcoming', options);
    return defer(() =>
      this.authService.user$.pipe(
        switchMap((user: any) => {
          if (!user) return of([]);

          const cached = this.getCachedEventsList(cacheKey);
          if (cached) return of(cached);

          const now = new Date();
          const end = new Date();
          end.setDate(end.getDate() + options.daysAhead);

          let q = query(
            this.getEventsCollection(groupId),
            where('date', '>=', Timestamp.fromDate(now)),
            where('date', '<=', Timestamp.fromDate(end)),
            orderBy('date', 'asc'),
            limit(options.limit)
          );

          if (options.startAfterDate) {
            q = query(q, startAfter(options.startAfterDate));
          }

          return from(getDocs(q)).pipe(
            map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as SportEvent) }))),
            tap((events) => {
              this.setCachedEventsList(cacheKey, events);
              events.forEach((event) => event.id && this.setCachedEvent(groupId, event.id, event));
            }),
            catchError((err: any) => {
              console.error('getUpcomingEventsInternal error:', err);
              return of([]);
            })
          );
        })
      )
    );
  }

  getPastEventsInternal(
    groupId: string,
    options: { daysBack: number; limit: number; startAfterDate?: Timestamp }
  ): Observable<SportEvent[]> {
    const cacheKey = this.eventsListCacheKey(groupId, 'past', options);
    return defer(() =>
      this.authService.user$.pipe(
        switchMap((user: any) => {
          if (!user) return of([]);

          const cached = this.getCachedEventsList(cacheKey);
          if (cached) return of(cached);

          const now = new Date();
          const start = new Date();
          start.setDate(start.getDate() - options.daysBack);

          let q = query(
            this.getEventsCollection(groupId),
            where('date', '<', Timestamp.fromDate(now)),
            where('date', '>=', Timestamp.fromDate(start)),
            orderBy('date', 'desc'),
            limit(options.limit)
          );

          if (options.startAfterDate) {
            q = query(q, startAfter(options.startAfterDate));
          }

          return from(getDocs(q)).pipe(
            map((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as SportEvent) }))),
            tap((events) => {
              this.setCachedEventsList(cacheKey, events);
              events.forEach((event) => event.id && this.setCachedEvent(groupId, event.id, event));
            }),
            catchError((err: any) => {
              console.error('getPastEventsInternal error:', err);
              return of([]);
            })
          );
        })
      )
    );
  }

  private getCachedEvent(groupId: string, eventId: string): SportEvent | null {
    const key = this.eventCacheKey(groupId, eventId);
    const inMemory = this.eventCache.get(key);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) return inMemory.data;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: SportEvent; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(key);
        return null;
      }
      this.eventCache.set(key, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedEvent(groupId: string, eventId: string, event: SportEvent) {
    const key = this.eventCacheKey(groupId, eventId);
    const entry = { data: event, ts: Date.now() };
    this.eventCache.set(key, entry);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private getCachedEventsList(cacheKey: string): SportEvent[] | null {
    const inMemory = this.eventsListCache.get(cacheKey);
    if (inMemory && Date.now() - inMemory.ts < this.cacheTtlMs) return inMemory.data;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data: SportEvent[]; ts: number };
      if (!parsed?.data || !parsed?.ts) return null;
      if (Date.now() - parsed.ts > this.cacheTtlMs) {
        window.localStorage.removeItem(cacheKey);
        return null;
      }
      this.eventsListCache.set(cacheKey, { data: parsed.data, ts: parsed.ts });
      return parsed.data;
    } catch {
      return null;
    }
  }

  private setCachedEventsList(cacheKey: string, events: SportEvent[]) {
    const entry = { data: events, ts: Date.now() };
    this.eventsListCache.set(cacheKey, entry);
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(cacheKey, JSON.stringify(entry));
    } catch {
      // ignore cache errors
    }
  }

  private eventCacheKey(groupId: string, eventId: string) {
    return `event:${groupId}:${eventId}`;
  }

  private eventsListCacheKey(
    groupId: string,
    type: 'upcoming' | 'past',
    options: { daysAhead?: number; daysBack?: number; limit: number; startAfterDate?: Timestamp }
  ) {
    const windowSize = type === 'upcoming' ? options.daysAhead : options.daysBack;
    const startAfterKey = options.startAfterDate ? options.startAfterDate.toMillis() : 0;
    return `events:${groupId}:${type}:${windowSize}:${options.limit}:${startAfterKey}`;
  }

  private invalidateEventCaches(groupId: string, eventId?: string) {
    const listPrefix = `events:${groupId}:`;
    for (const key of this.eventsListCache.keys()) {
      if (!key.startsWith(listPrefix)) continue;
      this.eventsListCache.delete(key);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch {
        // ignore cache errors
      }
    }

    if (eventId) {
      const eventKey = this.eventCacheKey(groupId, eventId);
      this.eventCache.delete(eventKey);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(eventKey);
        }
      } catch {
        // ignore cache errors
      }
    }
  }
}
