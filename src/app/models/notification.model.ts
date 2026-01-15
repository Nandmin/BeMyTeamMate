export type NotificationType =
  | 'group_join'
  | 'group_leave'
  | 'event_created'
  | 'event_cancelled'
  | 'event_rsvp_yes'
  | 'event_rsvp_no';

export interface AppNotification {
  id?: string;
  type: NotificationType;
  groupId: string;
  eventId?: string | null;
  title: string;
  body: string;
  link?: string;
  createdAt: any;
  read: boolean;
  actorId?: string | null;
  actorName?: string | null;
  actorPhoto?: string | null;
}
