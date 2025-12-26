import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  orderBy,
  collectionData,
  doc,
  docData,
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { Observable, switchMap, of } from 'rxjs';

export interface Group {
  id?: string;
  name: string;
  type: 'open' | 'closed';
  ownerId: string;
  ownerName: string;
  ownerPhoto?: string | null;
  createdAt: any;
  memberCount: number;
  description?: string;
  image?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GroupService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private groupsCollection = collection(this.firestore, 'groups');

  async createGroup(name: string, type: 'open' | 'closed', description: string = '') {
    const user = this.authService.currentUser();
    if (!user) throw new Error('User must be logged in to create a group');

    const groupData: Omit<Group, 'id'> = {
      name,
      type,
      description,
      ownerId: user.uid,
      ownerName: user.displayName || 'Ismeretlen',
      ownerPhoto: user.photoURL || null,
      createdAt: serverTimestamp(),
      memberCount: 1, // The owner is the first member
      image:
        'https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&q=80&w=800', // Default image
    };

    return addDoc(this.groupsCollection, groupData);
  }

  getGroups(): Observable<Group[]> {
    return collectionData(query(this.groupsCollection, orderBy('createdAt', 'desc')), {
      idField: 'id',
    }) as Observable<Group[]>;
  }

  getUserGroups(): Observable<Group[]> {
    return this.authService.user$.pipe(
      switchMap((user) => {
        if (!user) return of([]);
        const q = query(
          this.groupsCollection,
          where('ownerId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        return collectionData(q, { idField: 'id' }) as Observable<Group[]>;
      })
    );
  }

  getGroup(id: string): Observable<Group | undefined> {
    const docRef = doc(this.firestore, `groups/${id}`);
    return docData(docRef, { idField: 'id' }) as Observable<Group | undefined>;
  }
}
