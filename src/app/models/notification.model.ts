export type NotificationType = 'group_join' | 'group_leave' | 'event_created';

export interface AppNotification {
  id?: string;
  type: NotificationType;
  groupId: string;
  eventId?: string;
  title: string;
  body: string;
  link?: string;
  createdAt: any;
  read: boolean;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string | null;
}
