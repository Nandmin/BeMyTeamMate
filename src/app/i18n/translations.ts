export const SUPPORTED_LANGUAGES = ['hu', 'en'] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export type TranslationEntry = Record<AppLanguage, string>;

export const TRANSLATIONS = {
  'common.ok': { hu: 'Rendben', en: 'OK' },
  'common.cancel': { hu: 'Mégse', en: 'Cancel' },
  'common.confirm': { hu: 'Igen', en: 'Yes' },
  'common.close': { hu: 'Bezárás', en: 'Close' },
  'common.refresh': { hu: 'Frissítés', en: 'Refresh' },
  'common.refreshing': { hu: 'Frissítés...', en: 'Refreshing...' },
  'common.profile': { hu: 'Profil', en: 'Profile' },
  'common.error.authRequired': {
    hu: 'A művelethez bejelentkezés szükséges.',
    en: 'You must be signed in to perform this action.',
  },
  'common.error.unexpected': {
    hu: 'Váratlan hiba történt. Kérlek próbáld újra később.',
    en: 'An unexpected error occurred. Please try again later.',
  },
  'common.loading': { hu: 'Folyamatban...', en: 'Processing...' },
  'common.attention': { hu: 'Figyelem', en: 'Attention' },
  'common.confirmation': { hu: 'Megerősítés', en: 'Confirmation' },
  'common.defaultNotificationTitle': { hu: 'Értesítés', en: 'Notification' },
  'common.justNow': { hu: 'Most', en: 'Just now' },
  'common.minutesAgo': { hu: '{{count}} perce', en: '{{count}} minutes ago' },
  'common.hoursAgo': { hu: '{{count}} órája', en: '{{count}} hours ago' },
  'common.daysAgo': { hu: '{{count}} napja', en: '{{count}} days ago' },
  'common.allRightsReserved': {
    hu: '©{{year}} BeMyTeamMate - Minden jog fenntartva',
    en: '©{{year}} BeMyTeamMate - All rights reserved',
  },
  'common.actions.ok': { hu: 'Rendben', en: 'OK' },
  'common.actions.cancel': { hu: 'Mégse', en: 'Cancel' },
  'common.actions.confirm': { hu: 'Megerősítés', en: 'Confirm' },
  'common.actions.delete': { hu: 'Törlés', en: 'Delete' },
  'common.modal.alertTitle': { hu: 'Figyelem', en: 'Attention' },
  'common.modal.confirmTitle': { hu: 'Megerősítés', en: 'Confirmation' },
  'common.labels.notification': { hu: 'Értesítés', en: 'Notification' },
  'common.labels.notifications': { hu: 'Értesítések', en: 'Notifications' },
  'common.labels.adminDashboard': { hu: 'Admin felület', en: 'Admin dashboard' },
  'common.labels.filterByEvent': { hu: 'Szűrés eseményre', en: 'Filter by event' },
  'common.labels.allEvents': { hu: 'Összes esemény', en: 'All events' },
  'common.labels.noNotifications': { hu: 'Nincs új értesítés.', en: 'There are no new notifications.' },
  'common.labels.player': { hu: 'Játékos', en: 'Player' },
  'common.roles.member': { hu: 'Csapattag', en: 'Member' },
  'common.roles.admin': { hu: 'Admin', en: 'Admin' },
  'common.roles.captain': { hu: 'Csapatkapitány', en: 'Captain' },
  'common.theme.switchToLight': { hu: 'Váltás világos módra', en: 'Switch to light mode' },
  'common.theme.switchToDark': { hu: 'Váltás sötét módra', en: 'Switch to dark mode' },
  'common.theme.dark': { hu: 'Sötét', en: 'Dark' },
  'common.theme.light': { hu: 'Világos', en: 'Light' },
  'common.language.switchToEn': { hu: 'Váltás angolra', en: 'Switch to English' },
  'common.language.switchToHu': { hu: 'Váltás magyarra', en: 'Switch to Hungarian' },
  'common.nav.home': { hu: 'Kezdőlap', en: 'Home' },
  'common.nav.events': { hu: 'Események', en: 'Events' },
  'common.nav.groups': { hu: 'Tagságaim', en: 'My groups' },
  'common.nav.results': { hu: 'Eredmények', en: 'Results' },
  'common.nav.contact': { hu: 'Kapcsolat', en: 'Contact' },
  'common.nav.faq': { hu: 'GYIK', en: 'FAQ' },
  'common.nav.login': { hu: 'Bejelentkezés', en: 'Sign in' },
  'common.nav.register': { hu: 'Regisztráció', en: 'Register' },
  'common.nav.logout': { hu: 'Kijelentkezés', en: 'Sign out' },
  'common.footer.tagline': {
    hu: 'A modern sportközösségek nélkülözhetetlen eszköze Szervezz, játssz és fejlődj velünk',
    en: 'The essential tool for modern sports communities. Organize, play, and improve with us.',
  },
  'common.footer.privacyPolicy': { hu: 'Adatvédelmi nyilatkozat', en: 'Privacy policy' },
  'common.footer.termsOfUse': { hu: 'Felhasználási feltételek', en: 'Terms of use' },
  'common.unknownUser': { hu: 'Ismeretlen', en: 'Unknown' },
  'common.systemActor': { hu: 'Rendszer', en: 'System' },
  'common.group.defaultName': { hu: 'Csoport', en: 'Group' },
  'common.event.defaultName': { hu: 'Esemény', en: 'Event' },
  'common.relativeTime.justNow': { hu: 'Most', en: 'Just now' },
  'common.relativeTime.minuteAgo': { hu: '1 perce', en: '1 minute ago' },
  'common.relativeTime.minutesAgo': { hu: '{{count}} perce', en: '{{count}} minutes ago' },
  'common.relativeTime.hourAgo': { hu: '1 órája', en: '1 hour ago' },
  'common.relativeTime.hoursAgo': { hu: '{{count}} órája', en: '{{count}} hours ago' },
  'common.relativeTime.dayAgo': { hu: '1 napja', en: '1 day ago' },
  'common.relativeTime.daysAgo': { hu: '{{count}} napja', en: '{{count}} days ago' },

  'app.update.available': { hu: 'Új verzió érhető el.', en: 'A new version is available.' },

  'event.error.capacityFull': {
    hu: 'Sajnáljuk, az esemény betelt.',
    en: 'Sorry, the event is full.',
  },
  'event.error.notFound': {
    hu: 'Az esemény nem található.',
    en: 'Event not found.',
  },
  'event.error.mvpVotingInactive': {
    hu: 'Az MVP szavazás nem aktív ennél az eseménynél.',
    en: 'MVP voting is not active for this event.',
  },
  'event.error.invalidDate': {
    hu: 'Érvénytelen esemény dátum!',
    en: 'Invalid event date.',
  },
  'event.error.mvpVotingNotReady': {
    hu: 'Még nem lehet MVP-re szavazni.',
    en: 'MVP voting is not available yet.',
  },
  'event.error.onlyAttendeesCanVote': {
    hu: 'Csak a résztvevők szavazhatnak.',
    en: 'Only attendees can vote.',
  },
  'event.error.onlyAttendeePlayerCanVote': {
    hu: 'Csak résztvevő játékosra lehet szavazni.',
    en: 'You can only vote for a participating player.',
  },
  'event.error.selfVoteNotAllowed': {
    hu: 'Magadra nem szavazhatsz.',
    en: 'You cannot vote for yourself.',
  },
  'event.error.voteAlreadyCast': {
    hu: 'Már leadtad a szavazatodat.',
    en: 'You have already cast your vote.',
  },
  'event.error.votingExpired': {
    hu: 'Lejárt a szavazási időszak.',
    en: 'The voting period has expired.',
  },
  'event.error.workerConfig': {
    hu: 'A Cloudflare Worker URL nincs megfelelően beállítva.',
    en: 'The Cloudflare Worker URL is not configured correctly.',
  },
  'event.error.mvpFinalizeFailed': {
    hu: 'Az MVP véglegesítése nem sikerült.',
    en: 'Failed to finalize MVP voting.',
  },
  'event.notification.createdTitle': {
    hu: '{{groupName}} - Új esemény',
    en: '{{groupName}} - New event',
  },
  'event.notification.createdBody': {
    hu: '{{eventTitle}} létrehozva.',
    en: '{{eventTitle}} has been created.',
  },
  'event.notification.createdSeriesTitle': {
    hu: '{{groupName}} - Új esemény sorozat',
    en: '{{groupName}} - New event series',
  },
  'event.notification.createdSeriesBody': {
    hu: '{{eventTitle}} ({{count}} alkalom) létrehozva.',
    en: '{{eventTitle}} ({{count}} occurrences) created.',
  },
  'event.notification.cancelledTitle': {
    hu: '{{groupName}} - esemény lemondva',
    en: '{{groupName}} - event cancelled',
  },
  'event.notification.cancelledBody': {
    hu: '{{eventTitle}} lemondva.',
    en: '{{eventTitle}} has been cancelled.',
  },
  'event.notification.rsvpJoinedBody': {
    hu: '{{userName}} részt vesz az eseményen ({{attendeeCount}} / {{capacity}})',
    en: '{{userName}} is attending the event ({{attendeeCount}} / {{capacity}})',
  },
  'event.notification.rsvpDeclinedBody': {
    hu: '{{userName}} nem vesz részt az eseményen ({{attendeeCount}} / {{capacity}})',
    en: '{{userName}} is not attending the event ({{attendeeCount}} / {{capacity}})',
  },

  'group.error.nameRequired': {
    hu: 'A csoport neve kötelező.',
    en: 'Group name is required.',
  },
  'group.error.nameTooLong': {
    hu: 'A csoport neve legfeljebb {{max}} karakter lehet.',
    en: 'Group name can be at most {{max}} characters long.',
  },
  'group.error.descriptionTooLong': {
    hu: 'A leírás legfeljebb {{max}} karakter lehet.',
    en: 'Description can be at most {{max}} characters long.',
  },
  'group.error.idMissing': {
    hu: 'Csoport azonosító hiányzik.',
    en: 'Group ID is missing.',
  },
  'group.error.invalidUser': {
    hu: 'Érvénytelen felhasználó.',
    en: 'Invalid user.',
  },
  'group.error.multipleUsersFound': {
    hu: 'Több felhasználó is található ezzel az azonosítóval.',
    en: 'Multiple users were found with this identifier.',
  },
  'group.error.cannotInviteSelf': {
    hu: 'Saját magadat nem hívhatod meg.',
    en: 'You cannot invite yourself.',
  },
  'group.error.notFound': {
    hu: 'Csoport nem található.',
    en: 'Group not found.',
  },
  'group.error.alreadyMember': {
    hu: 'A felhasználó már tagja a csoportnak.',
    en: 'The user is already a member of the group.',
  },
  'group.error.alreadyJoined': {
    hu: 'Már tag vagy ebben a csoportban.',
    en: 'You are already a member of this group.',
  },
  'group.error.joinRequestExists': {
    hu: 'Már elküldted a csatlakozási kérelmet.',
    en: 'You have already sent a join request.',
  },
  'group.error.pendingInviteExists': {
    hu: 'Már van függő meghívó ehhez a felhasználóhoz.',
    en: 'There is already a pending invite for this user.',
  },
  'group.error.legalAcceptanceRequired': {
    hu: 'A jogi nyilatkozat elfogadása kötelező.',
    en: 'Accepting the legal statement is required.',
  },
  'group.error.inviteNotFound': {
    hu: 'A meghívó nem található.',
    en: 'Invite not found.',
  },
  'group.error.inviteUnauthorized': {
    hu: 'Nincs jogosultságod ehhez a meghívóhoz.',
    en: 'You are not allowed to access this invite.',
  },
  'group.error.inviteInactive': {
    hu: 'A meghívó már nem aktív.',
    en: 'The invite is no longer active.',
  },
  'group.error.ownerCannotLeave': {
    hu: 'A csoport tulajdonosa nem léphet ki.',
    en: 'The group owner cannot leave the group.',
  },
  'group.notification.memberCountChangedTitle': {
    hu: '{{groupName}} - Taglétszám változás',
    en: '{{groupName}} - Member count changed',
  },
  'group.notification.memberJoinedBody': {
    hu: '{{userName}} csatlakozott a csoporthoz.',
    en: '{{userName}} joined the group.',
  },
  'group.notification.memberLeftBody': {
    hu: '{{userName}} kilépett a csoportból.',
    en: '{{userName}} left the group.',
  },
  'group.notification.joinRequestTitle': {
    hu: 'Csatlakozási kérelem',
    en: 'Join request',
  },
  'group.notification.joinRequestBody': {
    hu: '{{userName}} csatlakozni szeretne a(z) {{groupName}} csoporthoz.',
    en: '{{userName}} would like to join the {{groupName}} group.',
  },
  'group.notification.inviteTitle': {
    hu: 'Meghívás csoportba',
    en: 'Group invitation',
  },
  'group.notification.inviteBody': {
    hu: '{{userName}} meghívott a(z) {{groupName}} csoportba.',
    en: '{{userName}} invited you to the {{groupName}} group.',
  },
  'group.notification.inviteAcceptedTitle': {
    hu: 'Meghívó elfogadva',
    en: 'Invitation accepted',
  },
  'group.notification.inviteAcceptedBody': {
    hu: '{{userName}} elfogadta a meghívásodat a(z) {{groupName}} csoportba.',
    en: '{{userName}} accepted your invitation to the {{groupName}} group.',
  },
  'group.notification.inviteDeclinedTitle': {
    hu: 'Meghívó elutasítva',
    en: 'Invitation declined',
  },
  'group.notification.inviteDeclinedBody': {
    hu: '{{userName}} elutasította a meghívásodat a(z) {{groupName}} csoportba.',
    en: '{{userName}} declined your invitation to the {{groupName}} group.',
  },
  'group.notification.joinApprovedTitle': {
    hu: 'Csatlakozási kérelem elfogadva',
    en: 'Join request approved',
  },
  'group.notification.joinApprovedBody': {
    hu: 'Csatlakoztál a csoporthoz!',
    en: 'You joined the group.',
  },
  'group.notification.joinRejectedTitle': {
    hu: 'Csatlakozási kérelem elutasítva',
    en: 'Join request rejected',
  },
  'group.notification.joinRejectedBody': {
    hu: 'Sajnos a(z) {{groupName}} csatlakozási kérelmedet elutasították.',
    en: 'Unfortunately, your join request to {{groupName}} was rejected.',
  },

  'admin.messages.header.badge': { hu: 'Üzenetek', en: 'Messages' },
  'admin.messages.header.title': { hu: 'Beérkezett üzenetek', en: 'Incoming messages' },
  'admin.messages.header.description': {
    hu: 'A kapcsolat oldalon keresztül küldött üzenetek listája. A lekérdezés a gombnyomás után indul.',
    en: 'List of messages sent through the contact page. The query starts after you press the button.',
  },
  'admin.messages.actions.query': { hu: 'Lekérdezés', en: 'Query' },
  'admin.messages.actions.back': { hu: 'Áttekintés', en: 'Overview' },
  'admin.messages.actions.markRead': { hu: 'Olvasott', en: 'Mark as read' },
  'admin.messages.actions.archive': { hu: 'Archiválás', en: 'Archive' },
  'admin.messages.actions.delete': { hu: 'Törlés', en: 'Delete' },
  'admin.messages.actions.open': { hu: 'Megnyitás', en: 'Open' },
  'admin.messages.table.title': { hu: 'Üzenetek', en: 'Messages' },
  'admin.messages.meta.total': { hu: 'Összesen: {{count}}', en: 'Total: {{count}}' },
  'admin.messages.meta.pageSize': { hu: 'Oldal méret', en: 'Page size' },
  'admin.messages.meta.page': { hu: 'Oldal: {{page}} / {{total}}', en: 'Page: {{page}} / {{total}}' },
  'admin.messages.table.sender': { hu: 'Küldő', en: 'Sender' },
  'admin.messages.table.date': { hu: 'Dátum', en: 'Date' },
  'admin.messages.table.message': { hu: 'Üzenet szövege', en: 'Message' },
  'admin.messages.table.status': { hu: 'Státusz', en: 'Status' },
  'admin.messages.table.readAt': { hu: 'Olvasás ideje', en: 'Read at' },
  'admin.messages.table.actions': { hu: 'Műveletek', en: 'Actions' },
  'admin.messages.status.read': { hu: 'Olvasott', en: 'Read' },
  'admin.messages.status.pending': { hu: 'Várakozik', en: 'Pending' },
  'admin.messages.empty.queriedTitle': {
    hu: 'Nincs találat a lekérdezett üzenetek között.',
    en: 'No results were found among the queried messages.',
  },
  'admin.messages.empty.idleTitle': {
    hu: 'Nincs betöltött adat, indíts új lekérdezést.',
    en: 'There is no loaded data yet. Start a new query.',
  },
  'admin.messages.empty.queriedDescription': {
    hu: 'Próbáld meg újra később vagy várj a cache lejáratára.',
    en: 'Try again later or wait for the cache to expire.',
  },
  'admin.messages.empty.idleDescription': {
    hu: 'A cache csak a Lekérdezés gombbal frissül.',
    en: 'The cache only refreshes when you press the Query button.',
  },
  'admin.messages.modal.title': { hu: 'Üzenet', en: 'Message' },
  'admin.messages.modal.titleWithSender': {
    hu: 'Üzenet - {{sender}}',
    en: 'Message - {{sender}}',
  },
  'admin.messages.modal.close': { hu: 'Bezárás', en: 'Close' },
  'admin.messages.confirm.archiveMessage': {
    hu: 'Biztosan archiválod ezt az üzenetet?',
    en: 'Are you sure you want to archive this message?',
  },
  'admin.messages.confirm.archiveTitle': {
    hu: 'Archiválás megerősítése',
    en: 'Confirm archive',
  },
  'admin.messages.confirm.deleteMessage': {
    hu: 'Biztosan törlöd ezt az üzenetet?',
    en: 'Are you sure you want to delete this message?',
  },
  'admin.messages.confirm.deleteTitle': {
    hu: 'Törlés megerősítése',
    en: 'Confirm deletion',
  },

  'admin.dashboard.meta.title': {
    hu: 'Admin felület – BeMyTeamMate',
    en: 'Admin dashboard - BeMyTeamMate',
  },
  'admin.dashboard.meta.description': {
    hu: 'Adminisztrációs vezérlőpult csoportokhoz, üzenetekhez és statisztikákhoz.',
    en: 'Administrative dashboard for groups, messages, and statistics.',
  },
  'admin.dashboard.brand.title': { hu: 'Admin', en: 'Admin' },
  'admin.dashboard.brand.subtitle': { hu: 'Vezérlőpult', en: 'Control panel' },
  'admin.dashboard.sidebar.aria': { hu: 'Oldalsáv', en: 'Sidebar' },
  'admin.dashboard.nav.groups': { hu: 'Csoportok', en: 'Groups' },
  'admin.dashboard.nav.users': { hu: 'Felhasználók', en: 'Users' },
  'admin.dashboard.nav.stats': { hu: 'Statisztikák', en: 'Statistics' },
  'admin.dashboard.nav.messages': { hu: 'Üzenetek', en: 'Messages' },
  'admin.dashboard.reminder.title': { hu: 'Emlékeztető', en: 'Reminder' },
  'admin.dashboard.reminder.lastLogin': { hu: 'Legutóbbi belépés: --', en: 'Last sign-in: --' },
  'admin.dashboard.hero.badge': { hu: 'Site Admin', en: 'Site Admin' },
  'admin.dashboard.hero.title': { hu: 'Admin irányítópult', en: 'Admin dashboard' },
  'admin.dashboard.hero.description': {
    hu: 'Zárt terület. Itt készülnek az új admin modulok és áttekintések.',
    en: 'Restricted area. New admin modules and overviews are being built here.',
  },
  'admin.dashboard.hero.verify': { hu: 'Ellenőrzés', en: 'Verify' },
  'admin.dashboard.stats.users': { hu: 'Felhasználók', en: 'Users' },
  'admin.dashboard.stats.usersHint': { hu: 'Aktív regisztrációk', en: 'Active registrations' },
  'admin.dashboard.stats.groups': { hu: 'Csoportok', en: 'Groups' },
  'admin.dashboard.stats.groupsHint': { hu: 'Kiemelt közösségek', en: 'Featured communities' },
  'admin.dashboard.stats.statistics': { hu: 'Statisztikák', en: 'Statistics' },
  'admin.dashboard.stats.statisticsHint': { hu: 'Frissítés alatt', en: 'Updating' },
  'admin.dashboard.stats.messages': { hu: 'Üzenetek', en: 'Messages' },
  'admin.dashboard.stats.messagesHint': { hu: 'Beérkező csatornák', en: 'Incoming channels' },
  'admin.dashboard.quickActions.title': { hu: 'Gyors műveletek', en: 'Quick actions' },
  'admin.dashboard.quickActions.placeholder': { hu: 'Placeholder', en: 'Placeholder' },
  'admin.dashboard.quickActions.moderation': { hu: 'Moderációs listák', en: 'Moderation queues' },
  'admin.dashboard.quickActions.systemMessages': { hu: 'Rendszer Üzenetek', en: 'System messages' },
  'admin.dashboard.quickActions.blockUser': { hu: 'Felhasználó tiltás', en: 'Block user' },
  'admin.dashboard.quickActions.auditExport': { hu: 'Audit napló export', en: 'Export audit log' },
  'admin.dashboard.access.title': { hu: 'Hozzáférés', en: 'Access' },
  'admin.dashboard.access.description': {
    hu: 'Ez a panel a site-admin flag alapján érhető el a profil dokumentumban.',
    en: 'This panel is available based on the site-admin flag in the profile document.',
  },
  'admin.dashboard.access.requiredField': {
    hu: 'Kötelező mező:',
    en: 'Required field:',
  },

  'admin.groups.header.badge': { hu: 'Csoportok', en: 'Groups' },
  'admin.groups.header.title': { hu: 'Aktív csoportok', en: 'Active groups' },
  'admin.groups.header.description': {
    hu: 'Itt látod a jelenlegi közösségeket és kezelheted a csoport adatlapokat.',
    en: 'Here you can see the current communities and manage group profiles.',
  },
  'admin.groups.actions.query': { hu: 'Lekérdezés', en: 'Query' },
  'admin.groups.actions.back': { hu: 'Áttekintés', en: 'Overview' },
  'admin.groups.actions.edit': { hu: 'Szerkesztés', en: 'Edit' },
  'admin.groups.actions.delete': { hu: 'Törlés', en: 'Delete' },
  'admin.groups.listTitle': { hu: 'Csoport lista', en: 'Group list' },
  'admin.groups.meta.total': { hu: 'Összesen: {{count}}', en: 'Total: {{count}}' },
  'admin.groups.meta.pageSize': { hu: 'Oldal méret', en: 'Page size' },
  'admin.groups.meta.page': { hu: 'Oldal: {{page}} / {{total}}', en: 'Page: {{page}} / {{total}}' },
  'admin.groups.table.name': { hu: 'Csoport neve', en: 'Group name' },
  'admin.groups.table.creator': { hu: 'Létrehozó', en: 'Creator' },
  'admin.groups.table.createdAt': { hu: 'Létrehozva', en: 'Created at' },
  'admin.groups.table.members': { hu: 'Tagok', en: 'Members' },
  'admin.groups.table.events': { hu: 'Események', en: 'Events' },
  'admin.groups.table.lastEvent': { hu: 'Utolsó esemény', en: 'Last event' },
  'admin.groups.table.actions': { hu: 'Műveletek', en: 'Actions' },
  'admin.groups.card.creator': { hu: 'Létrehozó: {{creator}}', en: 'Creator: {{creator}}' },
  'admin.groups.card.createdAt': { hu: 'Létrehozva: {{date}}', en: 'Created at: {{date}}' },
  'admin.groups.card.members': { hu: 'Tagok:', en: 'Members:' },
  'admin.groups.card.events': { hu: 'Események:', en: 'Events:' },
  'admin.groups.card.last': { hu: 'Utolsó:', en: 'Last:' },
  'admin.groups.empty.queriedTitle': {
    hu: 'Nincs találat a lekért adatok között.',
    en: 'No results were found among the fetched data.',
  },
  'admin.groups.empty.idleTitle': {
    hu: 'Nincs betöltött adat, indíts új lekérdezést.',
    en: 'There is no loaded data yet. Start a new query.',
  },
  'admin.groups.empty.queriedDescription': {
    hu: 'Próbálj meg új lekérdezést később.',
    en: 'Try another query later.',
  },
  'admin.groups.empty.idleDescription': {
    hu: 'A cache csak a Lekérdezés gombbal frissül.',
    en: 'The cache only refreshes when you press the Query button.',
  },
  'admin.groups.confirm.deleteMessage': {
    hu: 'Biztosan törlöd a(z) "{{groupName}}" csoportot?',
    en: 'Are you sure you want to delete the "{{groupName}}" group?',
  },
  'admin.groups.confirm.deleteTitle': {
    hu: 'Törlés megerősítése',
    en: 'Confirm deletion',
  },
  'admin.groups.alert.deleteSuccessMessage': {
    hu: 'A csoport törlése sikeres volt.',
    en: 'The group was deleted successfully.',
  },
  'admin.groups.alert.deleteSuccessTitle': { hu: 'Kész', en: 'Done' },
  'admin.groups.alert.deleteErrorMessage': {
    hu: 'Hiba történt a csoport törlésekor. Próbáld újra.',
    en: 'An error occurred while deleting the group. Please try again.',
  },
  'admin.groups.alert.deleteErrorTitle': { hu: 'Hiba', en: 'Error' },

  'createEvent.meta.createTitle': {
    hu: 'Új esemény – BeMyTeamMate',
    en: 'New event - BeMyTeamMate',
  },
  'createEvent.meta.editTitle': {
    hu: 'Esemény szerkesztése – BeMyTeamMate',
    en: 'Edit event - BeMyTeamMate',
  },
  'createEvent.meta.createDescription': {
    hu: 'Hozz létre új eseményt, állítsd be az időpontot és a részleteket.',
    en: 'Create a new event and set the time and details.',
  },
  'createEvent.meta.editDescription': {
    hu: 'Szerkeszd az esemény részleteit, időpontot, helyszínt és résztvevőket.',
    en: 'Edit the event details, time, location, and attendees.',
  },
  'createEvent.sport.soccer': { hu: 'Foci', en: 'Soccer' },
  'createEvent.sport.basketball': { hu: 'Kosárlabda', en: 'Basketball' },
  'createEvent.sport.handball': { hu: 'Kézilabda', en: 'Handball' },
  'createEvent.sport.tennis': { hu: 'Tenisz', en: 'Tennis' },
  'createEvent.sport.volleyball': { hu: 'Röplabda', en: 'Volleyball' },
  'createEvent.sport.hockey': { hu: 'Jégkorong', en: 'Hockey' },
  'createEvent.sport.squash': { hu: 'Squash', en: 'Squash' },
  'createEvent.sport.bowling': { hu: 'Bowling', en: 'Bowling' },
  'createEvent.sport.other': { hu: 'Egyéb', en: 'Other' },
  'createEvent.sport.running': { hu: 'Futás', en: 'Running' },
  'createEvent.header.createTitle': { hu: 'Új esemény létrehozása', en: 'Create a new event' },
  'createEvent.header.editTitle': { hu: 'Esemény szerkesztése', en: 'Edit event' },
  'createEvent.header.createSubtitle': {
    hu: 'Töltsd ki az űrlapot és hívd meg a barátaidat a következő meccsre.',
    en: 'Fill in the form and invite your friends to the next match.',
  },
  'createEvent.header.editSubtitle': {
    hu: 'Módosítsd az esemény részleteit.',
    en: 'Update the event details.',
  },
  'createEvent.section.sport': { hu: 'Mit játszunk?', en: 'What are we playing?' },
  'createEvent.section.when': { hu: 'Mikor?', en: 'When?' },
  'createEvent.field.title': { hu: 'Esemény neve', en: 'Event name' },
  'createEvent.field.duration': { hu: 'Időtartam: {{minutes}} perc', en: 'Duration: {{minutes}} minutes' },
  'createEvent.field.minutesShort': { hu: '{{minutes}} perc', en: '{{minutes}} min' },
  'createEvent.section.where': { hu: 'Hol?', en: 'Where?' },
  'createEvent.field.locationPlaceholder': { hu: 'Helyszín...', en: 'Location...' },
  'createEvent.map.zoomIn': { hu: 'Nagyítás', en: 'Zoom in' },
  'createEvent.map.zoomOut': { hu: 'Kicsinyítés', en: 'Zoom out' },
  'createEvent.map.fullscreen': { hu: 'Teljes képernyő', en: 'Fullscreen' },
  'createEvent.map.enterLocation': {
    hu: 'Add meg a helyszínt a térkép megjelenítéséhez',
    en: 'Enter a location to display the map.',
  },
  'createEvent.section.recurrence': { hu: 'Ismétlődés', en: 'Recurrence' },
  'createEvent.field.frequency': { hu: 'Gyakoriság', en: 'Frequency' },
  'createEvent.frequency.daily': { hu: 'Naponta', en: 'Daily' },
  'createEvent.frequency.weekly': { hu: 'Hetente', en: 'Weekly' },
  'createEvent.frequency.monthly': { hu: 'Havonta', en: 'Monthly' },
  'createEvent.field.recurringUntil': { hu: 'Meddig ismétlődjön? (max. 1 év)', en: 'Repeat until? (max. 1 year)' },
  'createEvent.recurrence.single': {
    hu: 'Ez egy egyszeri alkalommal megrendezett esemény lesz.',
    en: 'This event will take place only once.',
  },
  'createEvent.section.mvpVoting': { hu: 'MVP szavazás', en: 'MVP voting' },
  'createEvent.mvpVoting.enabled': {
    hu: 'A meccs után a résztvevők szavazhatnak a mérkőzés legjobbjára.',
    en: 'After the match, attendees can vote for the best player of the game.',
  },
  'createEvent.mvpVoting.disabled': {
    hu: 'Az MVP szavazás ki van kapcsolva ennél az eseménynél.',
    en: 'MVP voting is disabled for this event.',
  },
  'createEvent.section.capacity': { hu: 'Létszámkorlát', en: 'Capacity limit' },
  'createEvent.capacity.max': { hu: '{{count}} fő max', en: '{{count}} people max' },
  'createEvent.capacity.minLabel': { hu: '2 fő', en: '2 people' },
  'createEvent.capacity.maxLabel': { hu: '30 fő', en: '30 people' },
  'createEvent.capacity.inviteInfo': {
    hu: 'Meghívókat a csoport tagjai kapnak majd az esemény létrehozása után.',
    en: 'Group members will receive invitations after the event is created.',
  },
  'createEvent.actions.delete': { hu: 'Törlés', en: 'Delete' },
  'createEvent.actions.deleteConfirm': {
    hu: 'Biztosan törölni szeretnéd ezt az eseményt?',
    en: 'Are you sure you want to delete this event?',
  },
  'createEvent.actions.cancel': { hu: 'Mégse', en: 'Cancel' },
  'createEvent.actions.save': { hu: 'Mentés', en: 'Save' },
  'createEvent.actions.saving': { hu: 'Mentés...', en: 'Saving...' },
  'createEvent.actions.create': { hu: 'Létrehozás', en: 'Create' },
  'createEvent.actions.creating': { hu: 'Létrehozás...', en: 'Creating...' },
  'createEvent.modal.locationTitle': { hu: 'Helyszín', en: 'Location' },
  'createEvent.modal.close': { hu: 'Bezárás', en: 'Close' },
  'createEvent.map.unsupportedFormat': {
    hu: 'A helyszín formátuma nem támogatott a térképhez',
    en: 'The location format is not supported for the map.',
  },
  'createEvent.error.noEditPermission': {
    hu: 'Nincs jogosultságod az esemény szerkesztéséhez.',
    en: 'You do not have permission to edit this event.',
  },
  'createEvent.error.invalidDate': {
    hu: 'Hibás esemény dátum.',
    en: 'Invalid event date.',
  },
  'createEvent.error.loadFailed': {
    hu: 'Hiba történt az esemény betöltésekor.',
    en: 'An error occurred while loading the event.',
  },
  'createEvent.error.saveFailed': {
    hu: 'Hiba történt az esemény mentésekor.',
    en: 'An error occurred while saving the event.',
  },
  'createEvent.error.deleteFailed': {
    hu: 'Hiba történt az esemény törlésekor.',
    en: 'An error occurred while deleting the event.',
  },

  'eventDetail.meta.title': {
    hu: 'Esemény részletei - BeMyTeamMate',
    en: 'Event details - BeMyTeamMate',
  },
  'eventDetail.meta.description': {
    hu: 'Csapatok, részvétel, eredmények és MVP szavazás egy nézetben.',
    en: 'Teams, attendance, results, and MVP voting in one view.',
  },
  'eventDetail.flow.overview': { hu: 'Áttekintés', en: 'Overview' },
  'eventDetail.flow.teams': { hu: 'Csapatok', en: 'Teams' },
  'eventDetail.flow.record': { hu: 'Eredmény', en: 'Result' },
  'eventDetail.flow.mvp': { hu: 'MVP', en: 'MVP' },
  'eventDetail.mobile.defaultTitle': { hu: 'Meccs', en: 'Match' },
  'eventDetail.mobile.planned': { hu: 'Sorsolás', en: 'Draw' },
  'eventDetail.mobile.record': { hu: 'Rögzítés', en: 'Recording' },
  'eventDetail.mobile.active': { hu: 'Folyamatban', en: 'In progress' },
  'eventDetail.mobile.finished': { hu: 'Lezárva', en: 'Finished' },
  'eventDetail.actions.join': { hu: 'Jelentkezés', en: 'Join' },
  'eventDetail.actions.cancel': { hu: 'Lemondás', en: 'Cancel attendance' },
  'eventDetail.actions.settings': { hu: 'Esemény beállítás', en: 'Event settings' },
  'eventDetail.actions.draw': { hu: 'Sorsolás', en: 'Draw teams' },
  'eventDetail.actions.start': { hu: 'Kezdés', en: 'Start' },
  'eventDetail.actions.next': { hu: 'Tovább', en: 'Continue' },
  'eventDetail.actions.backToTeams': { hu: 'Vissza: Csapatok', en: 'Back: Teams' },
  'eventDetail.actions.saveResult': { hu: 'Eredmény mentése', en: 'Save result' },
  'eventDetail.actions.submitVote': { hu: 'Szavazat leadása', en: 'Submit vote' },
  'eventDetail.actions.finish': { hu: 'Lezárás', en: 'Finish' },
  'eventDetail.actions.editResults': { hu: 'Eredmény módosítása', en: 'Edit result' },
  'eventDetail.actions.recordResults': { hu: 'Eredmények rögzítése', en: 'Record results' },
  'eventDetail.alert.stepUnavailableMessage': {
    hu: 'Ehhez a lépéshez előbb csapatokra van szükség. Készítsd el a sorsolást a Csapatok lépésben.',
    en: 'This step requires teams first. Create the draw in the Teams step.',
  },
  'eventDetail.alert.stepUnavailableTitle': {
    hu: 'Lépés nem elérhető',
    en: 'Step unavailable',
  },
  'eventDetail.alert.membersOnlyMessage': {
    hu: 'Csak csoporttagok jelentkezhetnek az eseményekre.',
    en: 'Only group members can join events.',
  },
  'eventDetail.alert.membersOnlyTitle': { hu: 'Figyelem!', en: 'Attention!' },
  'eventDetail.alert.eventExpiredMessage': {
    hu: 'Már nem jelentkezhetsz erre az eseményre, vagy nem mondhatod le a részvételt, mivel az időpontja elmúlt.',
    en: 'You can no longer join or cancel attendance for this event because it has already passed.',
  },
  'eventDetail.alert.eventExpiredTitle': {
    hu: 'Esemény lejárt',
    en: 'Event expired',
  },
  'eventDetail.alert.teamsFinalizedMessage': {
    hu: 'Már nem mondhatod le a részvételt, mivel a csapatok már véglegesítve lettek.',
    en: 'You can no longer cancel attendance because the teams have already been finalized.',
  },
  'eventDetail.alert.teamsFinalizedTitle': {
    hu: 'Nem lehetséges',
    en: 'Not possible',
  },
  'eventDetail.alert.genericErrorMessage': {
    hu: 'Hiba történt.',
    en: 'An error occurred.',
  },
  'eventDetail.alert.genericErrorTitle': { hu: 'Hiba', en: 'Error' },
  'eventDetail.alert.mvpVoteSavedMessage': {
    hu: 'Szavazatodat rögzítettük!',
    en: 'Your vote has been recorded.',
  },
  'eventDetail.alert.mvpVoteSavedTitle': { hu: 'Siker', en: 'Success' },
  'eventDetail.start.notEnoughAttendees': {
    hu: 'Nincs elég jelentkező a játék indításához.',
    en: 'There are not enough applicants to start the game.',
  },
  'eventDetail.start.missingTeamsMessage': {
    hu: 'Előbb kattints a Sorsolás gombra a csapatok összeállításához.',
    en: 'Click the Draw teams button first to build the teams.',
  },
  'eventDetail.start.missingTeamsTitle': {
    hu: 'Hiányzó csapatok',
    en: 'Missing teams',
  },
  'eventDetail.start.confirmMessage': {
    hu: 'Biztosan elindítod a játékot? Ezután az összeállítások rögzítésre kerülnek és nem módosíthatók.',
    en: 'Are you sure you want to start the game? After this, the lineups will be locked and can no longer be changed.',
  },
  'eventDetail.start.confirmTitle': { hu: 'Játék indítása', en: 'Start game' },
  'eventDetail.start.errorMessage': {
    hu: 'Hiba történt a játék indításakor!',
    en: 'An error occurred while starting the game.',
  },
  'eventDetail.start.errorTitle': { hu: 'Hiba', en: 'Error' },
  'eventDetail.results.confirmMessage': {
    hu: 'Biztosan mented a mérkőzés végredményét? Az esemény státusza "Befejezett"-re változik.',
    en: 'Are you sure you want to save the final score? The event status will change to "Finished".',
  },
  'eventDetail.results.confirmTitle': {
    hu: 'Eredmények mentése',
    en: 'Save results',
  },
  'eventDetail.results.savedMessage': {
    hu: 'Az eredmények sikeresen mentve!',
    en: 'The results were saved successfully.',
  },
  'eventDetail.results.savedTitle': { hu: 'Siker', en: 'Success' },
  'eventDetail.labels.recurring': { hu: 'Ismétlődő', en: 'Recurring' },
  'eventDetail.labels.teamSuffix': { hu: 'csapat', en: 'team' },
  'eventDetail.labels.balanceIndicator': { hu: 'Erőegyensúly mutató', en: 'Balance indicator' },
  'eventDetail.labels.averageAtStart': { hu: 'Átlag (kezdéskor)', en: 'Average (at kickoff)' },
  'eventDetail.labels.average': { hu: 'Átlag', en: 'Average' },
  'eventDetail.labels.dropPlayerHere': { hu: 'Húzz ide játékost', en: 'Drop a player here' },
  'eventDetail.labels.goal': { hu: 'Gól', en: 'Goal' },
  'eventDetail.labels.assist': { hu: 'Gólpassz', en: 'Assist' },
  'eventDetail.labels.selectedPlayer': { hu: 'Kiválasztott játékos', en: 'Selected player' },
  'eventDetail.labels.selectPlayerHint': {
    hu: 'Válassz játékost a fenti listából a rögzítéshez.',
    en: 'Choose a player from the list above to record stats.',
  },
  'eventDetail.labels.managementTitle': { hu: 'Kezelés', en: 'Management' },
  'eventDetail.labels.managementSubtitle': {
    hu: 'Csapatok és sorsolás vezérlése',
    en: 'Control teams and the draw',
  },
  'eventDetail.labels.voteEnds': { hu: 'Szavazás vége:', en: 'Voting ends:' },
  'eventDetail.labels.voteClosedAt': { hu: 'Szavazás lezárult:', en: 'Voting closed:' },
  'eventDetail.labels.winner': { hu: 'Győztes', en: 'Winner' },
  'eventDetail.labels.voteParticipantsOnly': {
    hu: 'Csak a résztvevők szavazhatnak és csak egyetlen játékosra.',
    en: 'Only attendees can vote, and only for a single player.',
  },
  'eventDetail.labels.votingClosed': {
    hu: 'A szavazási időszak lezárult.',
    en: 'The voting period has ended.',
  },
  'eventDetail.labels.responses': { hu: 'Visszajelzések', en: 'Responses' },
  'eventDetail.labels.attendees': { hu: 'Résztvevők', en: 'Attendees' },
  'eventDetail.labels.applicantSingular': { hu: 'Jelentkező', en: 'Applicant' },
  'eventDetail.labels.applicants': { hu: 'Jelentkezők', en: 'Applicants' },
  'eventDetail.labels.noApplicants': { hu: 'Nincs még jelentkező', en: 'There are no applicants yet' },
  'eventDetail.labels.noResponseOrDeclined': {
    hu: 'Nincs válasz / Nem jön',
    en: 'No response / Not attending',
  },
  'eventDetail.labels.everyoneResponded': {
    hu: 'Mindenki visszajelzett!',
    en: 'Everyone has responded!',
  },
  'eventDetail.labels.peopleCount': { hu: '{{count}} fő', en: '{{count}} people' },
  'eventDetail.labels.applicantCount': { hu: '{{count}} Jelentkező', en: '{{count}} applicants' },
  'eventDetail.labels.durationMinutes': { hu: '({{count}} perc)', en: '({{count}} min)' },
  'eventDetail.labels.goalCount': { hu: 'Gól: {{count}}', en: 'Goals: {{count}}' },
  'eventDetail.labels.teamA': { hu: '"A" csapat', en: 'Team "A"' },
  'eventDetail.labels.teamB': { hu: '"B" csapat', en: 'Team "B"' },
  'eventDetail.labels.attendeeCapacity': {
    hu: '{{current}} / {{max}} fő',
    en: '{{current}} / {{max}} people',
  },
  'eventDetail.labels.mvpSubtitle': {
    hu: 'Szavazhatsz a mérkőzés legjobbjára',
    en: 'You can vote for the best player of the match',
  },
  'eventDetail.labels.notInTeam': {
    hu: 'Nincs játékos a csapatban.',
    en: 'There are no players in this team.',
  },
  'eventDetail.labels.notInSelectedTeam': {
    hu: 'Nincs játékos a kiválasztott csapatban.',
    en: 'There are no players in the selected team.',
  },
  'eventDetail.labels.quickOverview': { hu: 'Gyors áttekintés', en: 'Quick overview' },
  'eventDetail.labels.participants': { hu: 'Résztvevők', en: 'Participants' },
  'eventDetail.labels.noResponse': { hu: 'Nincs válasz', en: 'No response' },
  'eventDetail.labels.winnerAnnounced': {
    hu: 'Győztes kihirdetve',
    en: 'Winner announced',
  },
  'eventDetail.labels.voteSubmitted': {
    hu: 'Leadott szavazat: {{name}}',
    en: 'Submitted vote: {{name}}',
  },
  'eventDetail.teams.balance': { hu: 'Erőegyensúly', en: 'Balance' },
  'eventDetail.teams.averageInfoAria': { hu: 'ELO átlag magyarázat', en: 'ELO average explanation' },
  'eventDetail.teams.averageInfoText': {
    hu: 'A csapat játékosainak adott pillanatban érvényes ELO értékeinek átlaga',
    en: 'The average of the team players\' currently effective ELO ratings',
  },
  'eventDetail.teams.noPlayers': { hu: 'Még nincs játékos.', en: 'There are no players yet.' },
  'eventDetail.record.teamsRequired': {
    hu: 'Először csapatokat kell rögzíteni.',
    en: 'You need to set up the teams first.',
  },
  'eventDetail.record.title': { hu: 'Eredmény rögzítése', en: 'Record result' },
  'eventDetail.feedback.voteAfterFinish': {
    hu: 'Az MVP szavazás a meccs lezárása után érhető el.',
    en: 'MVP voting becomes available after the match is finished.',
  },
  'eventDetail.feedback.disabled': {
    hu: 'Ennél az eseménynél az MVP szavazás nincs bekapcsolva.',
    en: 'MVP voting is not enabled for this event.',
  },
  'eventDetail.feedback.winnerUpper': { hu: 'GYŐZTES', en: 'WINNER' },

  'groups.meta.title': { hu: 'Csoportok - BeMyTeamMate', en: 'Groups - BeMyTeamMate' },
  'groups.meta.description': {
    hu: 'Hozz létre csoportokat, kezeld a tagságot, és szervezd a közös meccseket.',
    en: 'Create groups, manage membership, and organize matches together.',
  },
  'groups.header.title': { hu: 'Tagságaim', en: 'My groups' },
  'groups.header.subtitle': {
    hu: 'Kezeld a csoportjaidat, vagy csatlakozz újakhoz.',
    en: 'Manage your groups or join new ones.',
  },
  'groups.panel.title': { hu: 'Új kalandot keresel?', en: 'Looking for a new adventure?' },
  'groups.panel.description': {
    hu: 'Hozz létre egy új baráti kört a sportoláshoz, vagy csatlakozz egy meglévőhöz.',
    en: 'Create a new group for sports or join an existing one.',
  },
  'groups.actions.create': { hu: 'Új csoport', en: 'New group' },
  'groups.actions.join': { hu: 'Csatlakozás', en: 'Join' },
  'groups.actions.createLoginRequired': {
    hu: 'Jelentkezz be a csoport létrehozásához!',
    en: 'Sign in to create a group!',
  },
  'groups.actions.joinLoginRequired': {
    hu: 'Jelentkezz be a csatlakozáshoz!',
    en: 'Sign in to join a group!',
  },
  'groups.card.noDescription': {
    hu: 'Nincs leírás megadva.',
    en: 'No description provided.',
  },
  'groups.card.open': { hu: 'Nyílt', en: 'Open' },
  'groups.card.closed': { hu: 'Zárt', en: 'Closed' },
  'groups.loading': { hu: 'Betöltés...', en: 'Loading...' },
  'groups.createModal.title': { hu: 'Új csoport létrehozása', en: 'Create a new group' },
  'groups.form.nameLabel': { hu: 'Csoport neve', en: 'Group name' },
  'groups.form.namePlaceholder': {
    hu: 'Pl. Szerdai Foci (max. {{max}} karakter)',
    en: 'E.g. Wednesday Football (max {{max}} characters)',
  },
  'groups.form.nameRequired': {
    hu: 'A csoport név megadása kötelező.',
    en: 'The group name is required.',
  },
  'groups.form.nameMaxLength': {
    hu: 'A csoport név legfeljebb {{max}} karakter lehet.',
    en: 'The group name can be at most {{max}} characters long.',
  },
  'groups.form.typeLabel': { hu: 'Csoport típusa', en: 'Group type' },
  'groups.form.typeClosed': { hu: 'Zárt', en: 'Closed' },
  'groups.form.typeOpen': { hu: 'Nyílt', en: 'Open' },
  'groups.form.descriptionLabel': { hu: 'Leírás (opcionális)', en: 'Description (optional)' },
  'groups.form.descriptionPlaceholder': {
    hu: 'Miről szól ez a csoport? (max. {{max}} karakter)',
    en: 'What is this group about? (max {{max}} characters)',
  },
  'groups.form.descriptionMaxLength': {
    hu: 'A leírás legfeljebb {{max}} karakter lehet.',
    en: 'The description can be at most {{max}} characters long.',
  },
  'groups.form.create': { hu: 'Csoport létrehozása', en: 'Create group' },
  'groups.form.creating': { hu: 'Létrehozás...', en: 'Creating...' },
  'groups.joinModal.title': { hu: 'Csatlakozás csoporthoz', en: 'Join a group' },
  'groups.joinModal.nameLabel': { hu: 'Csoport neve', en: 'Group name' },
  'groups.joinModal.namePlaceholder': {
    hu: 'Írd be a keresett csoport nevét',
    en: 'Enter the name of the group you are looking for',
  },
  'groups.joinModal.nameRequired': {
    hu: 'A csoport név megadása kötelező.',
    en: 'The group name is required.',
  },
  'groups.joinModal.info': {
    hu: 'A csatlakozáshoz a csoport adminisztrátorának jóváhagyása szükséges.',
    en: 'Joining requires approval from a group administrator.',
  },
  'groups.joinModal.consent': {
    hu: 'Tudomásul veszem, hogy csatlakozás után a csoport tagjai láthatják a megjelenített nevemet, profilomat és a részvételi jelzéseimet, valamint nyilvános csoport esetén a csoport alapadatai a csoporton kívül is megjelenhetnek.',
    en: 'I acknowledge that after joining, group members can see my displayed name, profile, and attendance responses, and in the case of a public group, the group basics may also be visible outside the group.',
  },
  'groups.joinModal.consentRequired': {
    hu: 'A csatlakozás csak a tájékoztatás elfogadásával indítható.',
    en: 'You can only start joining after accepting the notice.',
  },
  'groups.joinModal.search': { hu: 'Keresés...', en: 'Searching...' },
  'groups.joinModal.request': { hu: 'Csatlakozás kérése', en: 'Request to join' },
  'groups.alert.createErrorMessage': {
    hu: 'Hiba történt a csoport létrehozása közben. Ellenőrizd a jogosultságokat!',
    en: 'An error occurred while creating the group. Check your permissions.',
  },
  'groups.alert.createErrorTitle': { hu: 'Hiba', en: 'Error' },
  'groups.alert.notFoundMessage': {
    hu: 'Nem található csoport ezzel a névvel.',
    en: 'No group was found with this name.',
  },
  'groups.alert.notFoundTitle': { hu: 'Hiba', en: 'Error' },
  'groups.alert.joinRequestedMessage': {
    hu: 'Csatlakozási kérelem elküldve!',
    en: 'Join request sent!',
  },
  'groups.alert.joinRequestedTitle': { hu: 'Siker', en: 'Success' },
  'groups.alert.joinErrorFallback': {
    hu: 'Hiba történt a csatlakozás során.',
    en: 'An error occurred while joining.',
  },
  'groups.alert.joinErrorTitle': { hu: 'Hiba', en: 'Error' },
  'eventsList.meta.title': {
    hu: 'Események és meccsek - BeMyTeamMate',
    en: 'Events and matches - BeMyTeamMate',
  },
  'eventsList.meta.description': {
    hu: 'Kövesd a közelgő eseményeket, nézd meg a következő meccset és kezeld a részvételt.',
    en: 'Track upcoming events, see your next match, and manage attendance.',
  },
  'eventsList.header.title': { hu: 'Vezérlőpult', en: 'Dashboard' },
  'eventsList.hero.badge': { hu: 'KÖVETKEZŐ MECCS', en: 'NEXT MATCH' },
  'eventsList.hero.emptyTitle': { hu: 'Nincs közelgő esemény', en: 'No upcoming event' },
  'eventsList.countdown.hours': { hu: 'Óra', en: 'Hours' },
  'eventsList.countdown.minutes': { hu: 'Perc', en: 'Minutes' },
  'eventsList.countdown.seconds': { hu: 'Mp', en: 'Sec' },
  'eventsList.rsvp.statusLabel': { hu: 'Jelenléted:', en: 'Your attendance:' },
  'eventsList.rsvp.notAnswered': { hu: 'Még nem jeleztél', en: 'No response yet' },
  'eventsList.rsvp.yes': { hu: 'Ott leszek', en: 'I will be there' },
  'eventsList.rsvp.no': { hu: 'Nem', en: 'No' },
  'eventsList.filters.allEvents': { hu: 'Összes esemény', en: 'All events' },
  'eventsList.sections.upcoming': { hu: 'Közelgő események', en: 'Upcoming events' },
  'eventsList.empty.upcoming': { hu: 'Nincs közelgő esemény.', en: 'There are no upcoming events.' },
  'eventsList.attendance.label': { hu: 'Létszám', en: 'Attendance' },
  'eventsList.attendance.value': { hu: '{{current}}/{{max}} fő', en: '{{current}}/{{max}} people' },
  'eventsList.calendar.prevMonth': { hu: 'Előző hónap', en: 'Previous month' },
  'eventsList.calendar.nextMonth': { hu: 'Következő hónap', en: 'Next month' },
  'eventsList.calendar.weekday.mon': { hu: 'H', en: 'M' },
  'eventsList.calendar.weekday.tue': { hu: 'K', en: 'T' },
  'eventsList.calendar.weekday.wed': { hu: 'Sz', en: 'W' },
  'eventsList.calendar.weekday.thu': { hu: 'Cs', en: 'T' },
  'eventsList.calendar.weekday.fri': { hu: 'P', en: 'F' },
  'eventsList.calendar.weekday.sat': { hu: 'Sz', en: 'S' },
  'eventsList.calendar.weekday.sun': { hu: 'V', en: 'S' },
  'eventsList.sections.myEvents': { hu: 'Eseményeim', en: 'My events' },
  'eventsList.empty.day': { hu: 'Erre a napra nincs eseményed.', en: 'You have no events on this day.' },
  'results.meta.title': { hu: 'Eredmények - BeMyTeamMate', en: 'Results - BeMyTeamMate' },
  'results.meta.description': {
    hu: 'Legutóbbi meccsek, statisztikák és ELO változások áttekintése.',
    en: 'Overview of recent matches, stats, and ELO changes.',
  },
  'results.filters.periodAria': { hu: 'Idősáv szűrő', en: 'Period filter' },
  'results.filters.moreAria': { hu: 'További szűrők', en: 'More filters' },
  'results.filters.title': { hu: 'Szűrők', en: 'Filters' },
  'results.filters.closeAria': { hu: 'Szűrők bezárása', en: 'Close filters' },
  'results.filters.sportAria': { hu: 'Sportág szűrő', en: 'Sport filter' },
  'results.filters.teamAria': { hu: 'Csapat szűrő', en: 'Team filter' },
  'results.filters.reset': { hu: 'Alaphelyzet', en: 'Reset' },
  'results.filters.done': { hu: 'Kész', en: 'Done' },
  'results.header.title': { hu: 'Eredmények és elemzés', en: 'Results and analysis' },
  'results.header.subtitle': {
    hu: 'Részletes statisztikák, teljesítmény áttekintés és meccstörténet',
    en: 'Detailed stats, performance overview, and match history',
  },
  'results.filters.allSports': { hu: 'Minden sportág', en: 'All sports' },
  'results.filters.allTeams': { hu: 'Minden csapatom', en: 'All my teams' },
  'results.filters.periodDefault': { hu: 'Időszak', en: 'Period' },
  'results.filters.sportDefault': { hu: 'Sportág', en: 'Sport' },
  'results.filters.teamDefault': { hu: 'Csapat', en: 'Team' },
  'results.filters.period.all': { hu: 'Teljes időszak', en: 'Entire period' },
  'results.filters.period.1w': { hu: 'Elmúlt 1 hét', en: 'Last 1 week' },
  'results.filters.period.1m': { hu: 'Elmúlt 1 hónap', en: 'Last 1 month' },
  'results.filters.period.3m': { hu: 'Elmúlt 3 hónap', en: 'Last 3 months' },
  'results.filters.period.6m': { hu: 'Elmúlt 6 hónap', en: 'Last 6 months' },
  'results.filters.period.1y': { hu: 'Elmúlt 1 év', en: 'Last 1 year' },
  'results.kpi.matches': { hu: 'Lejátszott mérkőzések', en: 'Matches played' },
  'results.kpi.winRate': { hu: 'Győzelmi arány', en: 'Win rate' },
  'results.kpi.totalPoints': { hu: 'Összes pont', en: 'Total points' },
  'results.kpi.mvpWins': { hu: 'MVP győztes', en: 'MVP wins' },
  'results.tooltip.totalPointsAria': { hu: 'Összes pont magyarázat', en: 'Total points explanation' },
  'results.tooltip.totalPointsBody': {
    hu: 'Az „Összes pont” a kiválasztott időszakban és szűrők mellett elért ELO-változások összege. A pozitív érték növekedést, a negatív csökkenést jelent.',
    en: '“Total points” is the sum of ELO changes within the selected period and filters. Positive means growth, negative means decline.',
  },
  'results.chart.elo.title': { hu: 'Pontszám alakulása', en: 'Score progression' },
  'results.chart.elo.aria': { hu: 'Pontszám alakulása magyarázat', en: 'Score progression explanation' },
  'results.chart.elo.body': {
    hu: 'A görbe az egyes hónapok nettó ELO-változását mutatja. A zöld érték nyereség, a piros veszteség a kiválasztott szűrők szerint.',
    en: 'The curve shows the net ELO change for each month. Green means gain, red means loss for the selected filters.',
  },
  'results.chart.elo.subtitle': { hu: 'Utolsó 6 hónap teljesítménye', en: 'Performance over the last 6 months' },
  'results.chart.legend.gain': { hu: 'Nyereség', en: 'Gain' },
  'results.chart.legend.loss': { hu: 'Veszteség', en: 'Loss' },
  'results.chart.winLoss.title': { hu: 'Győzelem / Vereség', en: 'Win / Loss' },
  'results.chart.winLoss.subtitle': {
    hu: 'Utolsó 6 hónap győzelem és vereség darabszám',
    en: 'Wins and losses over the last 6 months',
  },
  'results.table.title': { hu: 'Legutóbbi eredmények', en: 'Recent results' },
  'results.table.toggleAria': { hu: 'Táblázat nyitása vagy zárása', en: 'Open or close table' },
  'results.table.open': { hu: 'Táblázat megnyitása', en: 'Open table' },
  'results.table.close': { hu: 'Táblázat bezárása', en: 'Close table' },
  'results.table.downloadAria': { hu: 'Adatok letöltése', en: 'Download data' },
  'results.table.empty': { hu: 'Nincs lejátszott meccs.', en: 'There are no played matches.' },
  'results.table.mobileMatchDetails': { hu: 'Meccs részletek: {{date}}', en: 'Match details: {{date}}' },
  'results.table.mobile.details': { hu: 'Részletek', en: 'Details' },
  'results.table.mobile.loadMore': { hu: 'További eredmények', en: 'More results' },
  'results.table.header.date': { hu: 'Dátum', en: 'Date' },
  'results.table.header.sport': { hu: 'Sportág', en: 'Sport' },
  'results.table.header.result': { hu: 'Eredmény', en: 'Result' },
  'results.table.header.goals': { hu: 'Szerzett gólok', en: 'Goals scored' },
  'results.table.header.assists': { hu: 'Assists', en: 'Assists' },
  'results.table.header.elo': { hu: 'ELO változás', en: 'ELO change' },
  'results.table.header.details': { hu: 'Részletek', en: 'Details' },
  'results.table.pageSize': { hu: 'Megjelenítés oldalanként:', en: 'Items per page:' },
  'results.table.prevPage': { hu: 'Előző oldal', en: 'Previous page' },
  'results.table.nextPage': { hu: 'Következő oldal', en: 'Next page' },
  'results.export.sheet': { hu: 'Legutóbbi_eredmények', en: 'Recent_results' },
  'results.export.filePrefix': { hu: 'Legutóbbi_eredmények', en: 'Recent_results' },
  'results.export.column.date': { hu: 'Dátum', en: 'Date' },
  'results.export.column.team': { hu: 'Csapat', en: 'Team' },
  'results.export.column.sport': { hu: 'Sportág', en: 'Sport' },
  'results.export.column.result': { hu: 'Eredmény', en: 'Result' },
  'results.export.column.goals': { hu: 'Szerzett gólok', en: 'Goals scored' },
  'results.export.column.assists': { hu: 'Assists', en: 'Assists' },
  'results.export.column.elo': { hu: 'ELO változás', en: 'ELO change' },
  'results.export.column.outcome': { hu: 'Kimenetel', en: 'Outcome' },
  'results.export.outcome.unknown': { hu: 'Ismeretlen', en: 'Unknown' },
  'results.export.outcome.win': { hu: 'Győzelem', en: 'Win' },
  'results.export.outcome.draw': { hu: 'Döntetlen', en: 'Draw' },
  'results.export.outcome.loss': { hu: 'Vereség', en: 'Loss' },
  'results.defaults.unknownSport': { hu: 'Ismeretlen', en: 'Unknown' },
  'results.defaults.teamA': { hu: 'A csapat', en: 'Team A' },
  'results.defaults.teamB': { hu: 'B csapat', en: 'Team B' },
  'groupDetail.meta.title': {
    hu: 'Csoport részletei - BeMyTeamMate',
    en: 'Group details - BeMyTeamMate',
  },
  'groupDetail.meta.description': {
    hu: 'Csoport események, tagok és statisztikák egy helyen.',
    en: 'Group events, members, and statistics in one place.',
  },
  'groupDetail.breadcrumb.home': { hu: 'Kezdőlap', en: 'Home' },
  'groupDetail.breadcrumb.groups': { hu: 'Csoportok', en: 'Groups' },
  'groupDetail.mobile.backToGroups': { hu: 'Vissza a csoportokhoz', en: 'Back to groups' },
  'groupDetail.mobile.title': { hu: 'Csoport részletek', en: 'Group details' },
  'groupDetail.mobile.tabs.overview': { hu: 'Áttekintés', en: 'Overview' },
  'groupDetail.mobile.tabs.events': { hu: 'Események', en: 'Events' },
  'groupDetail.mobile.tabs.members': { hu: 'Tagok', en: 'Members' },
  'groupDetail.mobile.tabs.settings': { hu: 'Beállítások', en: 'Settings' },
  'groupDetail.common.noDescription': {
    hu: 'Nincs leírás megadva.',
    en: 'No description provided.',
  },
  'groupDetail.common.open': { hu: 'Nyílt', en: 'Open' },
  'groupDetail.common.closed': { hu: 'Zárt', en: 'Closed' },
  'groupDetail.common.groupType': { hu: '{{type}} csoport', en: '{{type}} group' },
  'groupDetail.hero.location': { hu: 'Budapest, Magyarország', en: 'Budapest, Hungary' },
  'groupDetail.overview.title': { hu: 'Áttekintés', en: 'Overview' },
  'groupDetail.overview.membersCount': { hu: 'Tagok száma', en: 'Member count' },
  'groupDetail.overview.playedMatches': { hu: 'Lejátszott mérkőzések', en: 'Matches played' },
  'groupDetail.overview.pendingEvents': { hu: 'Várakozó események', en: 'Upcoming events' },
  'groupDetail.overview.type': { hu: 'Típus', en: 'Type' },
  'groupDetail.quickActions.title': { hu: 'Gyors műveletek', en: 'Quick actions' },
  'groupDetail.quickActions.moreAria': { hu: 'További műveletek', en: 'More actions' },
  'groupDetail.quickActions.createEventUnavailableJoin': {
    hu: 'Csatlakozás után tudsz új eseményt létrehozni.',
    en: 'You can create a new event after joining.',
  },
  'groupDetail.quickActions.createEventUnavailableAdmin': {
    hu: 'Csak adminisztrátor hozhat létre eseményt.',
    en: 'Only an administrator can create events.',
  },
  'groupDetail.settings.title': { hu: 'Beállítások', en: 'Settings' },
  'groupDetail.settings.open': {
    hu: 'Csoport beállítások megnyitása',
    en: 'Open group settings',
  },
  'groupDetail.settings.adminOnly': {
    hu: 'Csak adminisztrátor tud csoport beállításokat módosítani.',
    en: 'Only an administrator can modify group settings.',
  },
  'groupDetail.actions.title': { hu: 'Műveletek', en: 'Actions' },
  'groupDetail.actions.createEvent': { hu: 'Esemény létrehozása', en: 'Create event' },
  'groupDetail.actions.inviteMember': { hu: 'Tag meghívása', en: 'Invite member' },
  'groupDetail.actions.join': { hu: 'Csatlakozás', en: 'Join' },
  'groupDetail.actions.joining': { hu: 'Csatlakozás...', en: 'Joining...' },
  'groupDetail.actions.requestJoin': { hu: 'Jelentkezés', en: 'Request to join' },
  'groupDetail.actions.requestingJoin': { hu: 'Jelentkezés...', en: 'Requesting...' },
  'groupDetail.actions.settings': { hu: 'Beállítások', en: 'Settings' },
  'groupDetail.actions.cancel': { hu: 'Mégse', en: 'Cancel' },
  'groupDetail.actions.leave': { hu: 'Kilépés', en: 'Leave' },
  'groupDetail.stats.members': { hu: 'Csapattag', en: 'Member' },
  'groupDetail.stats.playedMatches': { hu: 'Lejátszott meccs', en: 'Played match' },
  'groupDetail.stats.pendingMatches': { hu: 'Várakozó meccs', en: 'Upcoming match' },
  'groupDetail.sections.events': { hu: 'Események', en: 'Events' },
  'groupDetail.sections.members': { hu: 'Csapattagok', en: 'Members' },
  'groupDetail.filters.upcoming': { hu: 'Közelgő', en: 'Upcoming' },
  'groupDetail.filters.previous': { hu: 'Korábbi', en: 'Previous' },
  'groupDetail.pagination.aria': { hu: 'Lapozás', en: 'Pagination' },
  'groupDetail.events.retry': { hu: 'Újrapróbálás', en: 'Retry' },
  'groupDetail.events.makeRecurring': { hu: 'Ismétlődővé tétel', en: 'Make recurring' },
  'groupDetail.events.edit': { hu: 'Szerkesztés', en: 'Edit' },
  'groupDetail.events.durationMinutes': { hu: '{{count}} perc', en: '{{count}} min' },
  'groupDetail.events.capacity': { hu: '{{current}}/{{max}} fő', en: '{{current}}/{{max}} people' },
  'groupDetail.events.rsvp.cancel': { hu: 'Lemondás', en: 'Cancel attendance' },
  'groupDetail.events.rsvp.join': { hu: 'Jelentkezés', en: 'Join' },
  'groupDetail.events.emptyUpcoming': {
    hu: 'Nincsenek közelgő események ebben a csoportban.',
    en: 'There are no upcoming events in this group.',
  },
  'groupDetail.events.emptyPrevious': {
    hu: 'Nincsenek korábbi események ebben a csoportban.',
    en: 'There are no previous events in this group.',
  },
  'groupDetail.events.loadMore': {
    hu: 'További események betöltése',
    en: 'Load more events',
  },
  'groupDetail.events.createNew': { hu: 'Új esemény létrehozása', en: 'Create a new event' },
  'groupDetail.members.count': { hu: '{{count}} fő', en: '{{count}} people' },
  'groupDetail.members.viewAll': { hu: 'Összes tag megtekintése', en: 'View all members' },
  'groupDetail.accessChecking': { hu: 'Hozzáférés ellenőrzése...', en: 'Checking access...' },
  'groupDetail.inviteModal.title': { hu: 'Tag meghívása', en: 'Invite member' },
  'groupDetail.inviteModal.description': {
    hu: 'Adj meg felhasználónevet vagy e-mail címet.',
    en: 'Enter a username or email address.',
  },
  'groupDetail.inviteModal.inputPlaceholder': {
    hu: 'pl. KovacsJanos vagy user@email.com',
    en: 'e.g. JohnDoe or user@email.com',
  },
  'groupDetail.inviteModal.check': { hu: 'Ellenőrzés', en: 'Check' },
  'groupDetail.inviteModal.found': { hu: 'Rendben', en: 'Found' },
  'groupDetail.inviteModal.send': { hu: 'Meghívó küldése', en: 'Send invite' },
  'groupDetail.inviteDecision.title': { hu: 'Meghívás csoportba', en: 'Group invitation' },
  'groupDetail.inviteDecision.description': {
    hu: 'Meghívót kaptál a(z) {{groupName}} csoportba {{inviterName}} felhasználótól.',
    en: 'You received an invitation to the {{groupName}} group from {{inviterName}}.',
  },
  'groupDetail.inviteDecision.unknownInviter': { hu: 'Ismeretlen', en: 'Unknown' },
  'groupDetail.inviteDecision.legal': {
    hu: 'Tudomásul veszem és elfogadom, hogy csatlakozás után a csoport tagjai láthatják a megjelenített nevemet, profilomat, részvételi jelzéseimet, valamint nyilvános csoport esetén a csoport alapadatai a csoporton kívül is megjelenhetnek.',
    en: 'I acknowledge and accept that after joining, group members can see my displayed name, profile, attendance responses, and in the case of a public group, the group basics may also be visible outside the group.',
  },
  'groupDetail.inviteDecision.decline': { hu: 'Elutasítom', en: 'Decline' },
  'groupDetail.inviteDecision.accept': { hu: 'Elfogadom', en: 'Accept' },
  'groupDetail.recurrence.title': { hu: 'Esemény ismétlődővé tétele', en: 'Make event recurring' },
  'groupDetail.recurrence.description': {
    hu: '"{{title}}" automatikus másolása.',
    en: 'Create automatic copies of "{{title}}".',
  },
  'groupDetail.recurrence.frequency': { hu: 'Gyakoriság', en: 'Frequency' },
  'groupDetail.recurrence.daily': { hu: 'Naponta', en: 'Daily' },
  'groupDetail.recurrence.weekly': { hu: 'Hetente', en: 'Weekly' },
  'groupDetail.recurrence.monthly': { hu: 'Havonta', en: 'Monthly' },
  'groupDetail.recurrence.until': {
    hu: 'Utolsó alkalom (max. 1 év)',
    en: 'Last occurrence (max. 1 year)',
  },
  'groupDetail.recurrence.confirm': { hu: 'Úgy legyen', en: 'Confirm' },
  'groupDetail.danger.title': { hu: 'Veszélyes művelet', en: 'Dangerous action' },
  'groupDetail.danger.description': {
    hu: 'A csoport elhagyása után az eseményeken történő részvételhez újra meghívó kellhet.',
    en: 'After leaving the group, participating in events may require a new invitation.',
  },
  'groupDetail.danger.confirmPrompt': {
    hu: 'A kilépéshez írd be, hogy {{token}}.',
    en: 'To leave, type {{token}}.',
  },
  'groupDetail.danger.confirmToken': { hu: 'KILÉPEK', en: 'LEAVE' },
  'groupDetail.alert.inviteMissingMessage': {
    hu: 'A meghívó már nem aktív vagy nem található.',
    en: 'The invitation is no longer active or could not be found.',
  },
  'groupDetail.alert.inviteMissingTitle': { hu: 'Meghívó', en: 'Invitation' },
  'groupDetail.alert.closedGroupMessage': {
    hu: 'Ez a csoport zárt. Meghívó nélkül nem tekinthető meg.',
    en: 'This group is closed. It cannot be viewed without an invitation.',
  },
  'groupDetail.alert.closedGroupTitle': { hu: 'Hozzáférés megtagadva', en: 'Access denied' },
  'groupDetail.alert.viewDeniedMessage': {
    hu: 'Nincs jogosultságod a csoport megtekintéséhez.',
    en: 'You do not have permission to view this group.',
  },
  'groupDetail.alert.viewDeniedTitle': { hu: 'Hozzáférés megtagadva', en: 'Access denied' },
  'groupDetail.alert.eventsLoadError': {
    hu: 'Hiba történt az események betöltésekor.',
    en: 'An error occurred while loading events.',
  },
  'groupDetail.alert.settingsDeniedMessage': {
    hu: 'Csak adminisztrátor nyithatja meg a csoport beállításokat.',
    en: 'Only an administrator can open group settings.',
  },
  'groupDetail.alert.settingsDeniedTitle': { hu: 'Nincs jogosultság', en: 'Permission denied' },
  'groupDetail.alert.coverSaveError': {
    hu: 'Hiba történt a borítókép mentésekor.',
    en: 'An error occurred while saving the cover image.',
  },
  'groupDetail.alert.genericErrorTitle': { hu: 'Hiba', en: 'Error' },
  'groupDetail.inviteLookup.empty': {
    hu: 'Add meg a felhasználónevet vagy e-mail címet.',
    en: 'Enter a username or email address.',
  },
  'groupDetail.inviteLookup.notFound': {
    hu: 'Nem található ilyen felhasználó.',
    en: 'No such user was found.',
  },
  'groupDetail.inviteLookup.self': {
    hu: 'Saját magadat nem hívhatod meg.',
    en: 'You cannot invite yourself.',
  },
  'groupDetail.inviteLookup.alreadyMember': {
    hu: 'A felhasználó már tagja a csoportnak.',
    en: 'This user is already a member of the group.',
  },
  'groupDetail.inviteLookup.error': {
    hu: 'Hiba történt a keresés közben.',
    en: 'An error occurred while searching.',
  },
  'groupDetail.invite.alert.sentMessage': { hu: 'Meghívó elküldve.', en: 'Invitation sent.' },
  'groupDetail.invite.alert.sentTitle': { hu: 'Kész', en: 'Done' },
  'groupDetail.invite.alert.sendError': {
    hu: 'Hiba történt a meghívó küldésekor.',
    en: 'An error occurred while sending the invitation.',
  },
  'groupDetail.inviteDecision.error.legalRequired': {
    hu: 'A jogi nyilatkozat elfogadása kötelező.',
    en: 'Accepting the legal notice is required.',
  },
  'groupDetail.inviteDecision.alert.acceptedMessage': {
    hu: 'Sikeresen csatlakoztál a csoporthoz.',
    en: 'You joined the group successfully.',
  },
  'groupDetail.inviteDecision.alert.acceptedTitle': { hu: 'Kész', en: 'Done' },
  'groupDetail.inviteDecision.error.acceptFailed': {
    hu: 'Hiba történt a meghívó elfogadásakor.',
    en: 'An error occurred while accepting the invitation.',
  },
  'groupDetail.inviteDecision.alert.declinedMessage': {
    hu: 'A meghívót elutasítottad.',
    en: 'You declined the invitation.',
  },
  'groupDetail.inviteDecision.alert.declinedTitle': { hu: 'Kész', en: 'Done' },
  'groupDetail.inviteDecision.error.declineFailed': {
    hu: 'Hiba történt a meghívó elutasításakor.',
    en: 'An error occurred while declining the invitation.',
  },
  'groupDetail.recurrence.error': {
    hu: 'Hiba történt.',
    en: 'An error occurred.',
  },
  'groupDetail.join.alert.requestSentMessage': {
    hu: 'A csatlakozási kérelmed elküldtük. Az adminok értesítést kapnak.',
    en: 'Your join request has been sent. The admins will be notified.',
  },
  'groupDetail.join.alert.requestSentTitle': { hu: 'Kész', en: 'Done' },
  'groupDetail.join.alert.error': {
    hu: 'Hiba történt a csatlakozáskor.',
    en: 'An error occurred while joining.',
  },
  'groupDetail.leave.alert.ownerMessage': {
    hu: 'A csoport tulajdonosa nem léphet ki.\\nElőbb add át a tulajdonjogot, vagy töröld a csoportot.',
    en: 'The group owner cannot leave.\\nTransfer ownership first or delete the group.',
  },
  'groupDetail.leave.alert.ownerTitle': { hu: 'Nem lehetséges', en: 'Not possible' },
  'groupDetail.leave.confirmMessage': {
    hu: 'Biztosan kilépsz a csoportból? Ezután nem láthatod az eseményeket.',
    en: 'Are you sure you want to leave the group? You will no longer see its events.',
  },
  'groupDetail.leave.confirmTitle': { hu: 'Kilépés', en: 'Leave group' },
  'groupDetail.leave.alert.successMessage': {
    hu: 'Sikeresen kiléptél a csoportból.',
    en: 'You left the group successfully.',
  },
  'groupDetail.leave.alert.successTitle': { hu: 'Kész', en: 'Done' },
  'groupDetail.leave.alert.error': {
    hu: 'Hiba történt a kilépés során.',
    en: 'An error occurred while leaving the group.',
  },
  'groupSettings.meta.title': {
    hu: 'Csoport beállítások – BeMyTeamMate',
    en: 'Group settings - BeMyTeamMate',
  },
  'groupSettings.meta.description': {
    hu: 'Kezeld a csoport adatait, tagokat és jogosultságokat.',
    en: 'Manage group details, members, and permissions.',
  },
  'groupSettings.breadcrumb.home': { hu: 'Kezdőlap', en: 'Home' },
  'groupSettings.breadcrumb.groups': { hu: 'Csoportok', en: 'Groups' },
  'groupSettings.breadcrumb.settings': { hu: 'Beállítások', en: 'Settings' },
  'groupSettings.header.title': { hu: 'Csoport beállítások', en: 'Group settings' },
  'groupSettings.header.subtitle': {
    hu: '{{groupName}} - Tagok és beállítások kezelése',
    en: '{{groupName}} - Manage members and settings',
  },
  'groupSettings.actions.backToGroup': {
    hu: 'Vissza a csoporthoz',
    en: 'Back to group',
  },
  'groupSettings.loading': { hu: 'Adatok betöltése...', en: 'Loading data...' },
  'groupSettings.accessDenied.title': { hu: 'Nincs jogosultságod', en: 'Access denied' },
  'groupSettings.accessDenied.description': {
    hu: 'Csak a csoport tulajdonosa vagy adminisztrátorai férhetnek hozzá ehhez az oldalhoz.',
    en: 'Only the group owner or administrators can access this page.',
  },
  'groupSettings.tabs.members': { hu: 'Tagok kezelése', en: 'Manage members' },
  'groupSettings.tabs.settings': { hu: 'Csoport adatok', en: 'Group details' },
  'groupSettings.members.title': { hu: 'Csoporttagok ({{count}})', en: 'Group members ({{count}})' },
  'groupSettings.members.empty': { hu: 'Nincsenek tagok a csoportban.', en: 'There are no members in the group.' },
  'groupSettings.members.roleBadge.owner': { hu: 'Tulajdonos', en: 'Owner' },
  'groupSettings.members.roleBadge.admin': { hu: 'Admin', en: 'Admin' },
  'groupSettings.members.roleBadge.member': { hu: 'Csapattag', en: 'Member' },
  'groupSettings.members.actions.changeRole': { hu: 'Szerep módosítása', en: 'Change role' },
  'groupSettings.members.actions.remove': { hu: 'Tag eltávolítása', en: 'Remove member' },
  'groupSettings.joinRequests.title': {
    hu: 'Felvételre váró tagok ({{count}})',
    en: 'Pending join requests ({{count}})',
  },
  'groupSettings.joinRequests.appliedAt': { hu: 'Jelentkezett: {{date}}', en: 'Applied: {{date}}' },
  'groupSettings.joinRequests.actions.approve': { hu: 'Jelentkezés elfogadása', en: 'Approve request' },
  'groupSettings.joinRequests.actions.reject': { hu: 'Jelentkezés elutasítása', en: 'Reject request' },
  'groupSettings.invites.title': { hu: 'Meghívók ({{count}})', en: 'Invites ({{count}})' },
  'groupSettings.invites.table.sentAt': { hu: 'Küldés időpont', en: 'Sent at' },
  'groupSettings.invites.table.sender': { hu: 'Küldő', en: 'Sender' },
  'groupSettings.invites.table.username': { hu: 'Felhasználónév', en: 'Username' },
  'groupSettings.invites.table.email': { hu: 'E-mail cím', en: 'Email address' },
  'groupSettings.invites.table.status': { hu: 'Állapot', en: 'Status' },
  'groupSettings.invites.table.respondedAt': { hu: 'Válasz időpont', en: 'Responded at' },
  'groupSettings.invites.table.action': { hu: 'Művelet', en: 'Action' },
  'groupSettings.invites.actions.revoke': { hu: 'Visszavonás', en: 'Revoke' },
  'groupSettings.invites.status.pending': { hu: 'Függőben', en: 'Pending' },
  'groupSettings.invites.status.accepted': { hu: 'Elfogadva', en: 'Accepted' },
  'groupSettings.invites.status.declined': { hu: 'Elutasítva', en: 'Declined' },
  'groupSettings.invites.status.revoked': { hu: 'Visszavonva', en: 'Revoked' },
  'groupSettings.invites.status.unknown': { hu: 'Ismeretlen', en: 'Unknown' },
  'groupSettings.leave.title': { hu: 'Veszélyes művelet', en: 'Dangerous action' },
  'groupSettings.leave.description': {
    hu: 'A csoport elhagyása után az eseményeken történő részvételhez újra meghívó kellhet.',
    en: 'After leaving the group, you may need a new invitation to attend events again.',
  },
  'groupSettings.leave.action': { hu: 'Kilépés a csoportból', en: 'Leave group' },
  'groupSettings.form.title': { hu: 'Csoport adatainak szerkesztése', en: 'Edit group details' },
  'groupSettings.form.nameLabel': { hu: 'Csoport neve *', en: 'Group name *' },
  'groupSettings.form.namePlaceholder': {
    hu: 'Add meg a csoport nevét (max. {{max}} karakter)',
    en: 'Enter the group name (max. {{max}} characters)',
  },
  'groupSettings.form.descriptionLabel': { hu: 'Leírás', en: 'Description' },
  'groupSettings.form.descriptionPlaceholder': {
    hu: 'Rövid leírás a csoportról... (max. {{max}} karakter)',
    en: 'Short description of the group... (max. {{max}} characters)',
  },
  'groupSettings.form.typeLabel': { hu: 'Csoport típusa', en: 'Group type' },
  'groupSettings.form.type.openTitle': { hu: 'Nyílt', en: 'Open' },
  'groupSettings.form.type.openDescription': { hu: 'Bárki csatlakozhat', en: 'Anyone can join' },
  'groupSettings.form.type.closedTitle': { hu: 'Zárt', en: 'Closed' },
  'groupSettings.form.type.closedDescription': { hu: 'Csak meghívóval', en: 'Invite only' },
  'groupSettings.form.coverLabel': { hu: 'Borítókép', en: 'Cover image' },
  'groupSettings.form.coverModify': { hu: 'Módosítás', en: 'Change' },
  'groupSettings.form.coverSelect': { hu: 'Borítókép kiválasztása', en: 'Select cover image' },
  'groupSettings.form.save': { hu: 'Mentés', en: 'Save' },
  'groupSettings.form.saving': { hu: 'Mentés...', en: 'Saving...' },
  'groupSettings.dangerZone.title': { hu: 'Veszélyes műveletek', en: 'Danger zone' },
  'groupSettings.dangerZone.deleteTitle': { hu: 'Csoport törlése', en: 'Delete group' },
  'groupSettings.dangerZone.deleteDescription': {
    hu: 'A csoport és minden hozzátartozó adat véglegesen törlődik.',
    en: 'The group and all related data will be permanently deleted.',
  },
  'groupSettings.dangerZone.deleteAction': { hu: 'Csoport törlése', en: 'Delete group' },
  'groupSettings.modal.deleteMember.title': { hu: 'Csapattag eltávolítása', en: 'Remove member' },
  'groupSettings.modal.deleteMember.description': { hu: 'Ez a művelet nem vonható vissza.', en: 'This action cannot be undone.' },
  'groupSettings.modal.deleteMember.body': {
    hu: 'Biztosan el szeretnéd törölni {{memberName}} tagot a csoportból?',
    en: 'Are you sure you want to remove {{memberName}} from the group?',
  },
  'groupSettings.modal.updateRole.title': { hu: 'Szerepkör módosítása', en: 'Change role' },
  'groupSettings.modal.updateRole.adminTitle': { hu: 'Csoport adminisztrátor', en: 'Group administrator' },
  'groupSettings.modal.updateRole.adminDescription': {
    hu: 'Tagokat kezelhet, eseményeket hozhat létre',
    en: 'Can manage members and create events',
  },
  'groupSettings.modal.updateRole.memberTitle': { hu: 'Csapattag', en: 'Member' },
  'groupSettings.modal.updateRole.memberDescription': {
    hu: 'Részt vehet eseményeken',
    en: 'Can participate in events',
  },
  'groupSettings.modal.rejectRequest.title': { hu: 'Jelentkezés elutasítása', en: 'Reject request' },
  'groupSettings.modal.rejectRequest.body': {
    hu: 'Biztosan el szeretnéd utasítani {{userName}} csatlakozási kérelmét?',
    en: 'Are you sure you want to reject {{userName}}\'s join request?',
  },
  'groupSettings.modal.deleteGroup.title': { hu: 'Csoport törlése', en: 'Delete group' },
  'groupSettings.modal.deleteGroup.description': { hu: 'Biztosan törölni szeretnéd a csoportot?', en: 'Are you sure you want to delete the group?' },
  'groupSettings.modal.deleteGroup.warning': {
    hu: 'A művelet végleges és nem visszavonható!',
    en: 'This action is permanent and cannot be undone!',
  },
  'groupSettings.modal.deleteGroup.details': {
    hu: 'A csoport minden adata, bejegyzése és eseménye törlésre fog kerülni.',
    en: 'All group data, posts, and events will be deleted.',
  },
  'groupSettings.modal.deleteGroup.note': {
    hu: '(A felhasználói fiókokat ez a művelet nem érinti.)',
    en: '(User accounts are not affected by this action.)',
  },
  'groupSettings.modal.deleteGroup.deleting': { hu: 'Törlés folyamatban...', en: 'Deleting...' },
  'groupSettings.modal.deleteGroup.confirm': { hu: 'Végleges törlés', en: 'Delete permanently' },
  'groupSettings.error.loadPrefix': {
    hu: 'Hiba a csoport betöltésekor: {{message}}',
    en: 'Error loading group: {{message}}',
  },
  'groupSettings.error.ownerCannotDelete': {
    hu: 'A csoport tulajdonosát nem lehet törölni.',
    en: 'The group owner cannot be removed.',
  },
  'groupSettings.error.memberRemove': {
    hu: 'Hiba történt a tag eltávolításakor.',
    en: 'An error occurred while removing the member.',
  },
  'groupSettings.success.memberRemoved': {
    hu: '{{memberName}} sikeresen eltávolítva a csoportból.',
    en: '{{memberName}} was removed from the group successfully.',
  },
  'groupSettings.error.ownerRoleImmutable': {
    hu: 'A csoport tulajdonosának szerepét nem lehet módosítani.',
    en: 'The group owner role cannot be changed.',
  },
  'groupSettings.success.roleUpdated': {
    hu: '{{memberName}} szerepe sikeresen módosítva.',
    en: '{{memberName}}\'s role was updated successfully.',
  },
  'groupSettings.error.roleUpdate': {
    hu: 'Hiba történt a szerep módosításakor.',
    en: 'An error occurred while updating the role.',
  },
  'groupSettings.success.saved': {
    hu: 'A csoport beállításai sikeresen mentve.',
    en: 'Group settings were saved successfully.',
  },
  'groupSettings.error.save': { hu: 'Hiba történt a mentéskor.', en: 'An error occurred while saving.' },
  'groupSettings.success.inviteRevoked': {
    hu: '{{userName}} meghívója visszavonva.',
    en: '{{userName}}\'s invitation was revoked.',
  },
  'groupSettings.error.inviteRevoke': {
    hu: 'Hiba történt a meghívó visszavonásakor.',
    en: 'An error occurred while revoking the invitation.',
  },
  'groupSettings.leave.ownerAlert': {
    hu: 'A csoport tulajdonosa nem léphet ki.\nElőbb add át a tulajdonjogot, vagy töröld a csoportot.',
    en: 'The group owner cannot leave.\nTransfer ownership first or delete the group.',
  },
  'groupSettings.leave.ownerAlertTitle': { hu: 'Nem lehetséges', en: 'Not possible' },
  'groupSettings.leave.confirmMessage': {
    hu: 'Biztosan kilépsz a csoportból? Ezután nem láthatod az eseményeket.',
    en: 'Are you sure you want to leave the group? You will no longer see its events.',
  },
  'groupSettings.leave.confirmTitle': { hu: 'Kilépés', en: 'Leave group' },
  'groupSettings.leave.success': { hu: 'Sikeresen kiléptél a csoportból.', en: 'You have left the group successfully.' },
  'groupSettings.leave.error': { hu: 'Hiba történt a kilépés során.', en: 'An error occurred while leaving the group.' },
  'groupSettings.success.requestApproved': {
    hu: '{{userName}} csatlakozása jóváhagyva.',
    en: '{{userName}}\'s request was approved.',
  },
  'groupSettings.error.requestApprove': {
    hu: 'Hiba történt a jóváhagyás során.',
    en: 'An error occurred while approving the request.',
  },
  'groupSettings.success.requestRejected': {
    hu: '{{userName}} jelentkezése elutasítva.',
    en: '{{userName}}\'s request was rejected.',
  },
  'groupSettings.error.requestReject': {
    hu: 'Hiba történt az elutasítás során.',
    en: 'An error occurred while rejecting the request.',
  },
  'groupSettings.error.deleteGroup': {
    hu: 'Hiba történt a csoport törlésekor.',
    en: 'An error occurred while deleting the group.',
  },

  'notification.error.unsupportedBrowser': {
    hu: 'A böngésződ nem támogatja a push értesítéseket.',
    en: 'Your browser does not support push notifications.',
  },
  'notification.error.permissionBlocked': {
    hu: 'Az értesítések engedélyezése le van tiltva a böngészőben.',
    en: 'Notification permissions are blocked in the browser.',
  },
  'notification.error.permissionDefault': {
    hu: 'Az értesítési engedély nincs megadva.',
    en: 'Notification permission has not been granted.',
  },
  'notification.error.invalidVapidKey': {
    hu: 'Értesítési beállítási hiba történt.',
    en: 'There is a notification configuration error.',
  },
  'notification.error.invalidRegistrationToken': {
    hu: 'Érvénytelen értesítési token.',
    en: 'Invalid notification token.',
  },
  'notification.error.pushUnsupported': {
    hu: 'Ez a böngésző nem támogatja a push értesítéseket.',
    en: 'This browser does not support push notifications.',
  },
  'notification.error.pushPermissionDenied': {
    hu: 'A push értesítési engedélyt megtagadtad.',
    en: 'Push notification permission was denied.',
  },
  'notification.error.fcmTokenUnavailable': {
    hu: 'Nem sikerült lekérni az értesítési tokent.',
    en: 'Failed to get the notification token.',
  },
  'notification.error.vapidMissing': {
    hu: 'Hiányzik a VAPID kulcs beállítása.',
    en: 'The VAPID key configuration is missing.',
  },
  'notification.error.serviceWorkerInactive': {
    hu: 'A push service worker nem aktiválódott.',
    en: 'The push service worker did not activate.',
  },
  'notification.error.tokenRecreateFailed': {
    hu: 'Nem sikerült újra létrehozni az értesítési tokent.',
    en: 'Failed to recreate the notification token.',
  },
  'notification.error.tokenCreateFailed': {
    hu: 'Nem sikerült létrehozni az értesítési tokent.',
    en: 'Failed to create the notification token.',
  },
  'notification.error.tokenUnsubscribeFailed': {
    hu: 'Nem sikerült frissíteni az értesítési tokent.',
    en: 'Failed to refresh the notification token.',
  },
  'notification.error.network': {
    hu: 'Hálózati hiba. Ellenőrizd a kapcsolatot.',
    en: 'Network error. Check your connection.',
  },
  'notification.error.permissionDenied': {
    hu: 'Nincs jogosultságod ehhez a művelethez.',
    en: 'You do not have permission for this action.',
  },
  'notification.error.challengeIssueFailed': {
    hu: 'Nem sikerült kiadni az értesítési challenge-et.',
    en: 'Failed to issue the notification challenge.',
  },
  'notification.error.challengeApi': {
    hu: 'A challenge API hibát adott vissza.',
    en: 'The challenge API returned an error.',
  },
  'notification.error.tooManyRequests': {
    hu: 'Túl sok kérés. Kérlek próbáld újra később.',
    en: 'Too many requests. Please try again later.',
  },
  'notification.error.tokenRegisterFailed': {
    hu: 'Nem sikerült regisztrálni az értesítési tokent: {{statusText}}',
    en: 'Failed to register the notification token: {{statusText}}',
  },
  'notification.error.registrationApi': {
    hu: 'A tokenregisztrációs API hibát adott vissza.',
    en: 'The token registration API returned an error.',
  },
  'notification.error.unauthenticated': {
    hu: 'Bejelentkezés szükséges.',
    en: 'Sign-in is required.',
  },
  'notification.error.unavailable': {
    hu: 'A szolgáltatás jelenleg nem érhető el.',
    en: 'The service is currently unavailable.',
  },

  'cookie.title': { hu: 'Süti (Cookie) Tájékoztató', en: 'Cookie Notice' },
  'cookie.description': {
    hu: 'Az oldal használatával elfogadja, hogy sütiket (cookie-kat) használunk a felhasználói élmény javítása és az oldal látogatottságának mérése érdekében, a Google Analytics segítségével anonim statisztikákat gyűjtünk.',
    en: 'By using the site, you accept that we use cookies to improve the user experience and measure traffic. We collect anonymous statistics with Google Analytics.',
  },
  'cookie.details.prefix': { hu: 'Részletes információk az', en: 'Detailed information is available on the' },
  'cookie.details.middle': { hu: 'és a', en: 'and the' },
  'cookie.details.suffix': { hu: 'oldalon.', en: 'pages.' },
  'cookie.privacyPolicyLabel': { hu: 'Adatvédelmi irányelvek', en: 'Privacy policy' },
  'cookie.termsOfUseLabel': { hu: 'Felhasználási feltételek', en: 'Terms of use' },
  'cookie.accept': { hu: 'Elfogadom', en: 'Accept' },
  'cookie.decline': { hu: 'Elutasítom', en: 'Decline' },

  'login.meta.title': { hu: 'Bejelentkezés – BeMyTeamMate', en: 'Sign in - BeMyTeamMate' },
  'login.meta.description': {
    hu: 'Lépj be, szervezd a következő meccset és kezeld a csapatodat egy helyen.',
    en: 'Sign in, organize the next match, and manage your team in one place.',
  },
  'login.title': { hu: 'Üdv újra a pályán!', en: 'Welcome back to the pitch!' },
  'login.subtitle': {
    hu: 'Jelentkezz be, és állítsd össze a győztes csapatot',
    en: 'Sign in and build the winning team',
  },
  'login.resendVerification': {
    hu: 'Nem kaptad meg az aktiváló e-mailt? Küldd újra itt.',
    en: 'Did not receive the activation email? Resend it here.',
  },
  'login.emailLabel': { hu: 'Email cím', en: 'Email address' },
  'login.emailPlaceholder': { hu: 'pelda@email.hu', en: 'name@example.com' },
  'login.passwordLabel': { hu: 'Jelszó', en: 'Password' },
  'login.passwordPlaceholder': { hu: 'Jelszavad megadása', en: 'Enter your password' },
  'login.forgotPassword': { hu: 'Elfelejtett jelszó?', en: 'Forgot password?' },
  'login.submit': { hu: 'Belépés', en: 'Sign in' },
  'login.noAccount': { hu: 'Még nincs fiókod?', en: 'Do you not have an account yet?' },
  'login.googleFailed': { hu: 'Google bejelentkezés sikertelen.', en: 'Google sign-in failed.' },
  'login.emailRequiredForReset': {
    hu: 'Kérlek add meg az email címedet az elfelejtett jelszóhoz.',
    en: 'Please enter your email address to reset your password.',
  },
  'login.resetEmailSent': {
    hu: 'Jelszó-visszaállító email elküldve! Ellenőrizd a postaládád.',
    en: 'Password reset email sent. Check your inbox.',
  },
  'login.resetFailed': {
    hu: 'Sikertelen jelszó-visszaállítás. Kérlek próbáld újra.',
    en: 'Password reset failed. Please try again.',
  },

  'resend.meta.title': {
    hu: 'Email hitelesítés újraküldése – BeMyTeamMate',
    en: 'Resend verification email - BeMyTeamMate',
  },
  'resend.meta.description': {
    hu: 'Ha nem kaptad meg az aktivációs emailed, innen újra küldheted.',
    en: 'Request a new verification email if the original link expired or never arrived.',
  },
  'resend.title': { hu: 'Verifikációs e-mail újraküldése', en: 'Resend verification email' },
  'resend.subtitle': {
    hu: 'Add meg az e-mail címed és jelszavad, és újra elküldjük az aktivációs e-mailt.',
    en: 'Enter your sign-in details and we will send the activation email again.',
  },
  'resend.emailLabel': { hu: 'Email cím', en: 'Email address' },
  'resend.emailPlaceholder': { hu: 'pelda@email.hu', en: 'example@email.com' },
  'resend.passwordLabel': { hu: 'Jelszó', en: 'Password' },
  'resend.passwordPlaceholder': { hu: 'Jelszavad', en: 'Enter your password' },
  'resend.submit': { hu: 'E-mail újraküldése', en: 'Resend email' },
  'resend.backToLogin': { hu: 'Bejelentkezés', en: 'Back to sign in' },
  'resend.registeredSuccess': {
    hu: 'Sikeres regisztráció. Ellenőrizd az emailed, vagy küldd újra innen az aktivációs levelet.',
    en: 'Registration was successful. If you did not receive the activation email, you can resend it here.',
  },
  'resend.alreadyVerified': {
    hu: 'Ez az email cím már hitelesített.\n Jelentkezz be a fiókodba.',
    en: 'Your email address is already verified. You can sign in now.',
  },
  'resend.resendSuccess': {
    hu: 'Újra elküldtük az aktivációs emailt.\nEllenőrizd a postaládádat.',
    en: 'We sent the activation email again. Check your inbox.',
  },
  'resend.error.invalidCredentials': {
    hu: 'Hibás e-mail cím vagy jelszó.',
    en: 'Incorrect email address or password.',
  },
  'resend.error.invalidEmail': { hu: 'Érvénytelen e-mail cím formátum.', en: 'Invalid email format.' },
  'resend.error.domain': {
    hu: 'A hitelesítő link domain nincs engedélyezve. Ellenőrizd az Auth domain beállításokat.',
    en: 'The verification email link configuration is invalid. Please contact the administrator.',
  },
  'resend.error.tooManyRequests': {
    hu: 'Túl sok próbálkozás.\nPróbáld újra később.',
    en: 'There have been too many attempts in a short time. Please try again later.',
  },
  'resend.error.default': {
    hu: 'Sikertelen megerősítő e-mail küldés.\nPróbáld újra.',
    en: 'Failed to resend the verification email. Please try again.',
  },
  'verify.meta.title': { hu: 'Email cím hitelesítés - BeMyTeamMate', en: 'Verify email - BeMyTeamMate' },
  'verify.meta.description': {
    hu: 'Itt tudod véglegesíteni az e-mail címed hitelesítését.',
    en: 'Email verification page for BeMyTeamMate.',
  },
  'verify.title': { hu: 'E-mail cím hitelesítés', en: 'Email verification' },
  'verify.loading': { hu: 'Ellenőrizzük a hitelesítési linket...', en: 'Verifying...' },
  'verify.success': {
    hu: 'Sikeres e-mail cím hitelesítés.\n Most már be tudsz jelentkezni.',
    en: 'Your email address has been verified successfully. You can sign in now.',
  },
  'verify.resendLink': {
    hu: 'Új verifikációs e-mail',
    en: 'Request a new verification email',
  },
  'verify.error.invalidLink': {
    hu: 'Érvénytelen vagy hiányos hitelesítési link.\n  Kérj újabb hitelesítő e-mailt.',
    en: 'The verification link is incomplete or invalid.',
  },
  'verify.error.invalidCode': {
    hu: 'Érvénytelen hitelesítési kód.\n Kérj újabb hitelesítő e-mailt.',
    en: 'The verification code is invalid.',
  },
  'verify.error.expiredCode': {
    hu: 'A hitelesítési link lejárt.\n Kérj újabb hitelesítő e-mailt.',
    en: 'The verification link has expired. Request a new email.',
  },
  'verify.error.disabled': {
    hu: 'Ez a fiók le van tiltva.',
    en: 'This user account has been disabled.',
  },
  'verify.error.default': {
    hu: 'Nem sikerült az e-mail cím hitelesítése.\n Próbáld újra vagy kérj új linket.',
    en: 'Failed to verify the email address. Please try again later.',
  },
  'register.meta.title': { hu: 'Ingyenes regisztráció – BeMyTeamMate', en: 'Free registration - BeMyTeamMate' },
  'register.meta.description': {
    hu: 'Hozz létre fiókot 1 perc alatt, és kezdj el kiegyensúlyozott csapatokat generálni.',
    en: 'Create an account in 1 minute and start generating balanced teams.',
  },
  'register.side.title': { hu: 'Csatlakozz a játékhoz', en: 'Join the game' },
  'register.side.description': {
    hu: 'Szervezd meg a csapatokat, kövesd a statisztikákat és élvezd a sportot barátaiddal egy helyen.',
    en: 'Organize teams, track stats, and enjoy sports with your friends in one place.',
  },
  'register.side.feature.teams': { hu: 'Gyors csapatosztás', en: 'Fast team balancing' },
  'register.side.feature.sports': { hu: 'Minden sportág', en: 'All sports' },
  'register.side.feature.free': { hu: 'Ingyenes használat', en: 'Free to use' },
  'register.title': { hu: 'Új játékos', en: 'New player' },
  'register.subtitle': { hu: 'Hozd létre a profilod a folytatáshoz', en: 'Create your profile to continue' },
  'register.usernameLabel': { hu: 'Felhasználónév', en: 'Username' },
  'register.usernamePlaceholder': { hu: 'pl. KovacsJanos', en: 'e.g. JohnSmith' },
  'register.usernameRequired': { hu: 'A felhasználónév megadása kötelező.', en: 'Username is required.' },
  'register.usernameNoAccents': {
    hu: 'A felhasználónév nem tartalmazhat ékezetes karaktereket.',
    en: 'Username cannot contain accented characters.',
  },
  'register.emailLabel': { hu: 'E-mail cím', en: 'Email address' },
  'register.emailPlaceholder': { hu: 'pelda@email.com', en: 'name@example.com' },
  'register.emailRequired': { hu: 'Az e-mail cím megadása kötelező.', en: 'Email address is required.' },
  'register.emailInvalid': { hu: 'Érvénytelen e-mail formátum.', en: 'Invalid email format.' },
  'register.passwordLabel': { hu: 'Jelszó', en: 'Password' },
  'register.passwordPlaceholder': { hu: '******', en: 'Your password' },
  'register.passwordRequired': { hu: 'A jelszó megadása kötelező.', en: 'Password is required.' },
  'register.passwordMinLength': {
    hu: 'A jelszónak legalább 6 karakter hosszúnak kell lennie.',
    en: 'Password must be at least 6 characters long.',
  },
  'register.confirmPasswordLabel': { hu: 'Jelszó megerősítése', en: 'Confirm password' },
  'register.confirmPasswordPlaceholder': { hu: '******', en: 'Confirm your password' },
  'register.confirmPasswordRequired': {
    hu: 'A jelszó megerősítése kötelező.',
    en: 'Password confirmation is required.',
  },
  'register.bioLabel': { hu: 'Rövid bemutatkozás', en: 'Short bio' },
  'register.optional': { hu: '(opcionális)', en: '(optional)' },
  'register.bioPlaceholder': {
    hu: 'Írj magadról pár mondatot... pl. milyen szinten játszol?',
    en: 'Write a few lines about yourself... for example, what level do you play at?',
  },
  'register.submit': { hu: 'Regisztráció', en: 'Register' },
  'register.hasAccount': { hu: 'Már van fiókod?', en: 'Already have an account?' },
  'register.signInLink': { hu: 'Jelentkezz be', en: 'Sign in' },
  'register.passwordMismatch': { hu: 'A jelszavak nem egyeznek.', en: 'Passwords do not match.' },
  'register.success': {
    hu: 'Sikeres regisztráció! Az aktiváló emailt elküldtük.',
    en: 'Registration successful. We sent the activation email.',
  },

  'modal.defaultConfirm': { hu: 'Megerősítés', en: 'Confirmation' },
  'modal.defaultAlert': { hu: 'Figyelem', en: 'Attention' },

  'auth.prompt.magicLinkEmail': {
    hu: 'Kérlek add meg az e-mail címedet a megerősítéshez',
    en: 'Please provide your email address for confirmation',
  },
  'auth.fallback.unexpected': {
    hu: 'Váratlan hiba történt. Kérlek próbáld újra később.',
    en: 'An unexpected error occurred. Please try again later.',
  },
  'auth.fallback.changePassword': {
    hu: 'Nem sikerült a jelszó módosítása.',
    en: 'Password update failed.',
  },
  'auth.fallback.googleLogin': {
    hu: 'Sikertelen Google bejelentkezés.',
    en: 'Google sign-in failed.',
  },
  'auth.fallback.register': { hu: 'Sikertelen regisztráció.', en: 'Registration failed.' },
  'auth.fallback.login': { hu: 'Sikertelen bejelentkezés.', en: 'Sign-in failed.' },
  'auth.fallback.resendVerification': {
    hu: 'Sikertelen megerősítő email küldés.',
    en: 'Failed to resend the verification email.',
  },
  'auth.fallback.magicLink': { hu: 'Sikertelen belépési link küldés.', en: 'Failed to send the sign-in link.' },
  'auth.fallback.magicLinkLogin': {
    hu: 'Sikertelen belépés a varázslinkkel.',
    en: 'Magic-link sign-in failed.',
  },
  'auth.fallback.resetPassword': {
    hu: 'Sikertelen jelszó-helyreállítás.',
    en: 'Password reset failed.',
  },
  'auth.error.noSignedInUser': {
    hu: 'Nincs bejelentkezett felhasználó.',
    en: 'There is no signed-in user.',
  },
  'auth.error.noRegisteredEmail': {
    hu: 'A felhasználónak nincs regisztrált e-mail címe.',
    en: 'The user has no registered email address.',
  },
  'auth.error.userDisabled': { hu: 'Ez a felhasználói fiók le van tiltva.', en: 'This user account is disabled.' },
  'auth.error.emailNotVerified': {
    hu: 'Az email cím még nincs megerősítve.',
    en: 'The email address has not been verified yet.',
  },
  'auth.error.invalidActionCode': {
    hu: 'Érvénytelen hitelesítési kód.',
    en: 'Invalid verification code.',
  },
  'auth.error.expiredActionCode': {
    hu: 'A hitelesítési link lejárt.',
    en: 'The verification link has expired.',
  },
  'auth.error.usernameTaken': {
    hu: 'Ez a felhasználónév már használatban van.',
    en: 'This username is already in use.',
  },
  'auth.error.invalidUsername': { hu: 'Érvénytelen felhasználónév.', en: 'Invalid username.' },
  'auth.error.currentPasswordInvalid': {
    hu: 'Hibás jelenlegi jelszó.',
    en: 'The current password is incorrect.',
  },
  'auth.error.weakPassword': { hu: 'Az új jelszó túl gyenge.', en: 'The new password is too weak.' },
  'auth.error.userNotFound': { hu: 'A felhasználó nem található.', en: 'User not found.' },
  'auth.error.invalidEmail': { hu: 'Érvénytelen e-mail cím.', en: 'Invalid email address.' },
  'auth.error.emailAlreadyInUse': {
    hu: 'Ez az e-mail cím már használatban van.',
    en: 'This email address is already in use.',
  },
  'auth.error.popupClosed': {
    hu: 'A bejelentkezési ablak bezárult.',
    en: 'The sign-in popup was closed.',
  },
  'auth.error.popupAlreadyOpen': {
    hu: 'A bejelentkezési ablak már meg van nyitva.',
    en: 'The sign-in popup is already open.',
  },
  'auth.error.tooManyRequests': {
    hu: 'Túl sok próbálkozás. Próbáld újra később.',
    en: 'Too many attempts. Please try again later.',
  },
  'auth.error.network': {
    hu: 'Hálózati hiba. Ellenőrizd a kapcsolatot.',
    en: 'Network error. Check your connection.',
  },
  'auth.error.recentLoginRequired': {
    hu: 'A művelethez újra be kell jelentkezned.',
    en: 'You need to sign in again to complete this action.',
  },
  'auth.error.unauthorizedContinueUri': {
    hu: 'A verifikációs link domain nincs engedélyezve.',
    en: 'The verification link domain is not allowed.',
  },
  'auth.error.invalidContinueUri': {
    hu: 'Érvénytelen verifikációs visszairányítási URL.',
    en: 'Invalid verification redirect URL.',
  },
  'auth.error.missingContinueUri': {
    hu: 'Hiányzik a verifikációs visszairányítási URL.',
    en: 'The verification redirect URL is missing.',
  },
  'auth.error.permissionDenied': {
    hu: 'Nincs jogosultságod ehhez a művelethez.',
    en: 'You do not have permission to perform this action.',
  },
  'auth.error.unauthenticated': {
    hu: 'Bejelentkezés szükséges.',
    en: 'You need to sign in first.',
  },
  'auth.error.unavailable': {
    hu: 'A szolgáltatás jelenleg nem érhető el.',
    en: 'The service is currently unavailable.',
  },

  'profile.meta.title': { hu: 'Profil - BeMyTeamMate', en: 'Profile - BeMyTeamMate' },
  'profile.meta.description': {
    hu: 'Felhasználói profil, statisztikák és csoportok áttekintése.',
    en: 'User profile with statistics and group overview.',
  },
  'profile.defaults.userName': { hu: 'Felhasználó', en: 'User' },
  'profile.defaults.activeMember': { hu: 'Aktív tag', en: 'Active member' },
  'profile.defaults.noMembership': { hu: 'Nincs tagsága', en: 'No memberships' },
  'profile.defaults.active': { hu: 'Aktív', en: 'Active' },
  'profile.defaults.inactive': { hu: 'Inaktív', en: 'Inactive' },
  'profile.defaults.noBio': {
    hu: 'Ez a felhasználó még nem írt bemutatkozást.',
    en: 'This user has not added a bio yet.',
  },
  'profile.defaults.noChanges': { hu: 'Nincs változtatás.', en: 'No changes.' },
  'profile.sidebar.personal': { hu: 'Személyes adatok', en: 'Personal details' },
  'profile.sidebar.groups': { hu: 'Tagságaim', en: 'My groups' },
  'profile.sidebar.notifications': { hu: 'Értesítések', en: 'Notifications' },
  'profile.sidebar.privacy': { hu: 'Adatvédelem', en: 'Privacy' },
  'profile.section.editTitle': { hu: 'Profil szerkesztése', en: 'Edit profile' },
  'profile.section.viewTitle': { hu: 'Felhasználói profil', en: 'User profile' },
  'profile.section.updatedAt': { hu: 'Utoljára frissítve', en: 'Last updated' },
  'profile.field.displayName': { hu: 'Felhasználónév', en: 'Display name' },
  'profile.field.photo': { hu: 'Profilkép', en: 'Profile photo' },
  'profile.field.bio': { hu: 'Bemutatkozás', en: 'Bio' },
  'profile.field.elo': { hu: 'ELO pontszám', en: 'ELO rating' },
  'profile.field.email': { hu: 'E-mail cím', en: 'Email address' },
  'profile.form.displayName': { hu: 'Megjelenített név', en: 'Display name' },
  'profile.form.email': { hu: 'E-mail cím', en: 'Email address' },
  'profile.form.bio': { hu: 'Bemutatkozás', en: 'Bio' },
  'profile.form.bioPlaceholder': { hu: 'Mesélj magadról...', en: 'Tell us about yourself...' },
  'profile.password.title': { hu: 'Jelszó megváltoztatása', en: 'Change password' },
  'profile.password.current': { hu: 'Jelenlegi jelszó', en: 'Current password' },
  'profile.password.new': { hu: 'Új jelszó', en: 'New password' },
  'profile.password.confirm': { hu: 'Új jelszó ismét', en: 'Confirm new password' },
  'profile.password.currentRequired': {
    hu: 'Add meg a jelenlegi jelszavadat.',
    en: 'Enter your current password.',
  },
  'profile.password.newMinLength': {
    hu: 'Az új jelszónak legalább 6 karakter hosszúnak kell lennie.',
    en: 'The new password must be at least 6 characters long.',
  },
  'profile.password.mismatch': {
    hu: 'Az új jelszavak nem egyeznek.',
    en: 'The new passwords do not match.',
  },
  'profile.password.changed': { hu: 'Jelszó megváltoztatva', en: 'Password changed' },
  'profile.actions.save': { hu: 'Mentés', en: 'Save' },
  'profile.actions.viewGroup': { hu: 'Megtekintés', en: 'View' },
  'profile.groups.title': { hu: 'Tagságaim', en: 'My groups' },
  'profile.groups.descriptionOwn': { hu: 'Tekintsd át a csapataidat.', en: 'Review your teams.' },
  'profile.groups.descriptionOther': {
    hu: '{{name}} csapatai.',
    en: "{{name}}'s teams.",
  },
  'profile.groups.memberCount': { hu: '{{count}} tag', en: '{{count}} members' },
  'profile.groups.nextEvent': { hu: 'Következő esemény', en: 'Next event' },
  'profile.groups.viewRestricted': {
    hu: 'Csak olyan csoport nyitható meg, amiben te is tag vagy, vagy site admin vagy.',
    en: 'You can only open groups you belong to unless you are a site admin.',
  },
  'profile.groups.emptyOwn': {
    hu: 'Még nem tartozol egyetlen társasághoz sem.',
    en: 'You do not belong to any groups yet.',
  },
  'profile.groups.emptyOther': {
    hu: 'Ez a felhasználó még nem tartozik egyetlen társasághoz sem.',
    en: 'This user does not belong to any groups yet.',
  },
  'profile.notifications.push.title': { hu: 'Push értesítések', en: 'Push notifications' },
  'profile.notifications.push.description': {
    hu: 'Csoport eseményekről küldött értesítések.',
    en: 'Notifications sent about group events.',
  },
  'profile.notifications.pushEnabled': {
    hu: 'Push értesítések bekapcsolva.',
    en: 'Push notifications enabled.',
  },
  'profile.notifications.pushDisabled': {
    hu: 'Push értesítések kikapcsolva.',
    en: 'Push notifications disabled.',
  },
  'profile.notifications.pushFallbackError': {
    hu: 'Nem sikerült a push értesítések kezelése.',
    en: 'Failed to manage push notifications.',
  },
  'profile.notifications.invites.title': { hu: 'Meghívások', en: 'Invitations' },
  'profile.notifications.invites.description': {
    hu: 'Értesítés új társaság meghívásról.',
    en: 'Notifications about new group invitations.',
  },
  'profile.privacy.title': { hu: 'Adatvédelem', en: 'Privacy' },
  'profile.privacy.description': {
    hu: 'Kezeld a személyes adataidat és a fiókodat.',
    en: 'Manage your personal data and account.',
  },
  'profile.privacy.analytics.title': { hu: 'Analitikai sütik', en: 'Analytics cookies' },
  'profile.privacy.analytics.description': {
    hu: 'Google Analytics alapú látogatottsági mérés engedélyezése',
    en: 'Allow Google Analytics based traffic measurement',
  },
  'profile.privacy.analyticsEnabled': {
    hu: 'Az analitikai sütik engedélyezése sikeres.',
    en: 'Analytics cookies enabled successfully.',
  },
  'profile.privacy.analyticsDisabled': {
    hu: 'Az analitikai sütik tiltása sikeres. A következő oldalbetöltéstől érvényes.',
    en: 'Analytics cookies disabled successfully. It takes effect from the next page load.',
  },
  'profile.privacy.deleteRegistration.title': { hu: 'Regisztráció törlése', en: 'Delete registration' },
  'profile.privacy.deleteRegistration.description': {
    hu: 'A fiók törlésének kérelmezése',
    en: 'Request account deletion',
  },
  'profile.privacy.deleteRegistration.action': { hu: 'Fiók törlése', en: 'Delete account' },
  'profile.privacy.captchaLoading': { hu: 'Captcha betöltése...', en: 'Loading captcha...' },
  'profile.modal.successTitle': { hu: 'Siker', en: 'Success' },
  'profile.modal.errorTitle': { hu: 'Hiba', en: 'Error' },
  'profile.modal.privacyTitle': { hu: 'Adatvédelem', en: 'Privacy' },
  'profile.modal.deleteRegistrationTitle': {
    hu: 'Regisztráció törlése',
    en: 'Delete registration',
  },
  'profile.photo.fileTooLarge': {
    hu: 'A fájl mérete nem lehet nagyobb, mint 1MB.',
    en: 'The file size cannot be larger than 1 MB.',
  },
  'profile.photo.updated': { hu: 'Profilkép frissítve.', en: 'Profile photo updated.' },
  'profile.photo.updateError': {
    hu: 'Hiba történt a kép frissítésekor.',
    en: 'An error occurred while updating the photo.',
  },
  'profile.photo.deleteConfirm': {
    hu: 'Biztosan törlöd a profilképedet?',
    en: 'Are you sure you want to delete your profile photo?',
  },
  'profile.save.profileSaved': { hu: 'Profil mentve', en: 'Profile saved' },
  'profile.save.completed': { hu: '{{items}} sikeresen.', en: '{{items}} completed successfully.' },
  'profile.delete.confirmMessage': {
    hu: 'Biztosan törölni szeretnéd a regisztrációdat? A művelet nem vonható vissza és minden adatod véglegesen törlésre kerül.',
    en: 'Are you sure you want to delete your registration? This action cannot be undone and all your data will be deleted permanently.',
  },
  'profile.delete.confirmAction': { hu: 'Végleges törlés', en: 'Delete permanently' },
  'profile.delete.robotCheck': {
    hu: 'Kérlek igazold, hogy nem vagy robot! Töltsd ki a Captchát a gomb közelében.',
    en: 'Please verify that you are not a robot. Complete the captcha near the button.',
  },
  'profile.delete.requestFailed': {
    hu: 'Sikertelen kérelem: {{detail}}',
    en: 'Request failed: {{detail}}',
  },
  'profile.delete.requestAccepted': {
    hu: 'A törlési kérelmedet fogadtuk. A fiókod hamarosan törlésre kerül.',
    en: 'We received your deletion request. Your account will be deleted soon.',
  },
  'profile.delete.requestSendFailed': {
    hu: 'Nem sikerült elküldeni a kérelmet: {{message}}',
    en: 'Failed to send the request: {{message}}',
  },

  'contact.meta.title': { hu: 'Kapcsolat - BeMyTeamMate', en: 'Contact - BeMyTeamMate' },
  'contact.meta.description': {
    hu: 'Vedd fel velünk a kapcsolatot, és írj üzenetet a csapatnak.',
    en: 'Get in touch with us and send a message to the team.',
  },
  'contact.badge': { hu: 'Kapcsolat', en: 'Contact' },
  'contact.hero.title': {
    hu: 'Üzenj a csapatnak, mi itt vagyunk.',
    en: 'Send a message to the team, we are here.',
  },
  'contact.hero.description': {
    hu: 'Írj röviden, miben segíthetünk. Legyen szó kérdésről, javaslatról vagy visszajelzésről, örömmel hallunk felőled.',
    en: 'Tell us briefly how we can help. Whether it is a question, suggestion, or feedback, we would be glad to hear from you.',
  },
  'contact.feature.fastResponse.title': { hu: 'Gyors visszajelzés', en: 'Quick response' },
  'contact.feature.fastResponse.description': {
    hu: 'Átlátható üzenetkezelés, hamarosan jelentkezünk.',
    en: 'Clear message handling, we will get back to you soon.',
  },
  'contact.form.title': { hu: 'Üzenet küldése', en: 'Send a message' },
  'contact.form.requiredHint': {
    hu: 'A *-gal jelölt mezők kitöltése kötelező.',
    en: 'Fields marked with * are required.',
  },
  'contact.field.email': { hu: 'E-mail *', en: 'Email *' },
  'contact.field.emailPlaceholder': { hu: 'pelda@email.hu', en: 'name@example.com' },
  'contact.field.message': { hu: 'Üzenet *', en: 'Message *' },
  'contact.field.messagePlaceholder': {
    hu: 'Írd ide a kérdésed vagy javaslatod...',
    en: 'Write your question or suggestion here...',
  },
  'contact.field.messageMinimum': { hu: 'Minimum {{count}} karakter.', en: 'Minimum {{count}} characters.' },
  'contact.submit.loading': { hu: 'Küldés folyamatban...', en: 'Sending...' },
  'contact.submit.idle': { hu: 'Küldés', en: 'Send' },
  'contact.error.captchaMissing': {
    hu: 'A captcha nincs beállítva. Kérlek, próbáld meg később.',
    en: 'Captcha is not configured. Please try again later.',
  },
  'contact.error.rateLimited': {
    hu: 'Túllépted az adott időszak alatt küldhető üzenetek számát.',
    en: 'You have exceeded the number of messages allowed in this time period.',
  },
  'contact.success.recorded': {
    hu: 'Köszönjük, az üzenetet rögzítettük.',
    en: 'Thank you, your message has been recorded.',
  },
  'contact.success.recordedWithBang': {
    hu: 'Köszönjük, az üzenetet rögzítettük!',
    en: 'Thank you, your message has been recorded!',
  },
  'contact.error.robotCheck': {
    hu: 'Kérlek igazold, hogy nem vagy robot!',
    en: 'Please verify that you are not a robot.',
  },
  'contact.error.endpointMissing': {
    hu: 'A kapcsolat endpoint nincs beállítva.',
    en: 'The contact endpoint is not configured.',
  },
  'contact.error.sendFailedDetail': {
    hu: 'Az üzenet küldése sikertelen!',
    en: 'Sending the message failed.',
  },
  'contact.error.sendFailed': {
    hu: 'Sikertelen üzenetküldés! Kérlek, próbáld újra!',
    en: 'Failed to send the message. Please try again.',
  },
  'contact.error.turnstileSiteKeyMissing': {
    hu: 'Turnstile site key nincs beállítva.',
    en: 'Turnstile site key is not configured.',
  },
  'contact.error.turnstileLoadFailed': {
    hu: 'Nem sikerült betölteni a captchát.',
    en: 'Failed to load the captcha.',
  },

  'landing.hero.badge': { hu: 'Új generációs csapatépítő', en: 'Next-gen team builder' },
  'landing.hero.title1': { hu: 'A legjobb meccsek', en: 'The best matches' },
  'landing.hero.title2': { hu: 'fair csapatokkal', en: 'with fair teams' },
  'landing.hero.title3': { hu: 'kezdődnek', en: 'start here' },
  'landing.hero.description': {
    hu: 'Felejtsd el a vitákat a csapatválasztáskor. Generálj kiegyensúlyozott csapatokat másodpercek alatt, szervezz eseményeket és kövesd a statisztikákat egy helyen.',
    en: 'Forget the arguments over team selection. Generate balanced teams in seconds, organize events, and track statistics in one place.',
  },
  'landing.hero.ctaHowItWorks': { hu: 'Hogyan működik?', en: 'How does it work?' },
  'landing.hero.trustBadge': { hu: 'Több mint 2000+ játékos választása', en: 'Trusted by 2000+ players' },
  'landing.hero.cardTitle': { hu: 'Generált Csapatok', en: 'Generated Teams' },
  'landing.hero.teamA': { hu: 'A Csapat', en: 'Team A' },
  'landing.hero.teamB': { hu: 'B Csapat', en: 'Team B' },

  'landing.features.title': { hu: 'Minden eszköz a zsebedben', en: 'Every tool in your pocket' },
  'landing.features.subtitle': {
    hu: 'Nem csak egy csapatgenerátor. Egy teljes eszköztár a baráti társaságok sportéletének szervezéséhez.',
    en: 'Not just a team generator. A complete toolkit for organizing your friend group\'s sports life.',
  },
  'landing.features.smart.title': { hu: 'Okos csapatelosztás', en: 'Smart team distribution' },
  'landing.features.smart.description': {
    hu: 'Algoritmusunk figyelembe veszi a játékosok korábbi teljesítményét és képességeit, így mindig szoros és izgalmas meccseket generál.',
    en: 'Our algorithm considers players\' past performance and skills to generate tight, exciting matches every time.',
  },
  'landing.features.events.title': { hu: 'Eseménykezelés', en: 'Event management' },
  'landing.features.events.description': {
    hu: 'Hozd létre a következő focit, küldj automatikus emlékeztetőket, és kezeld az "Ott leszek/Nem leszek ott" válaszokat egyetlen felületen.',
    en: 'Create your next match, send automatic reminders, and manage RSVP responses in one interface.',
  },
  'landing.features.community.title': { hu: 'Közösségi élmény', en: 'Community experience' },
  'landing.features.community.description': {
    hu: 'Rögzítsétek a gólokat, szavazzatok a meccs legjobbjára (MVP), és vezessetek ranglistát a baráti társaságon belül.',
    en: 'Record goals, vote for the best player (MVP), and maintain a leaderboard within your friend group.',
  },

  'landing.howItWorks.title': { hu: 'Egyszerűbb, mint gondolnád', en: 'Simpler than you think' },
  'landing.howItWorks.step1.title': { hu: 'Hozz létre egy csoportot', en: 'Create a group' },
  'landing.howItWorks.step1.description': {
    hu: 'Regisztrálj és hozz létre egy zárt csoportot a barátaidnak vagy a sportklubodnak.',
    en: 'Sign up and create a private group for your friends or sports club.',
  },
  'landing.howItWorks.step2.title': { hu: 'Vedd fel a játékosokat', en: 'Add players' },
  'landing.howItWorks.step2.description': {
    hu: 'A visszajelzések alapján láthatod kik lesznek jelen a mérkőzésen.',
    en: 'Based on RSVPs, you can see who will be present at the match.',
  },
  'landing.howItWorks.step3.title': { hu: 'Indítsd a generálást', en: 'Generate teams' },
  'landing.howItWorks.step3.description': {
    hu: 'Az alkalmazás az elért teljesítmények alapján létrehozza csapatokat.',
    en: 'The app creates balanced teams based on player performance.',
  },
  'landing.howItWorks.step4.title': { hu: 'Rögzítsd az eredményt', en: 'Record the result' },
  'landing.howItWorks.step4.description': {
    hu: 'Az algoritmus értékeli a teljesítményeket.',
    en: 'The algorithm evaluates player performances.',
  },

  'landing.cta.title': { hu: 'Készen állsz a kezdőrúgásra?', en: 'Ready for kickoff?' },
  'landing.cta.description': {
    hu: 'Csatlakozz több ezer amatőr sportolóhoz, és emeld profi szintre a szervezést. Nincs több vitatkozás, csak tiszta játék.',
    en: 'Join thousands of amateur athletes and take your organization to a professional level. No more arguments, just clean play.',
  },
  'landing.cta.buttonStart': { hu: 'Start', en: 'Start' },
  'landing.cta.buttonRegister': { hu: 'Fiók létrehozása', en: 'Create account' },
  'landing.cta.buttonRegisterFree': { hu: 'Fiók létrehozása ingyen', en: 'Create account for free' },
} as const satisfies Record<string, TranslationEntry>;

export type TranslationKey = keyof typeof TRANSLATIONS;

export function isAppLanguage(language: string | null | undefined): language is AppLanguage {
  return !!language && SUPPORTED_LANGUAGES.includes(language as AppLanguage);
}

export function normalizeAppLanguage(language: string | null | undefined): AppLanguage {
  return isAppLanguage(language) ? language : 'hu';
}

export function buildTranslationForLanguage(language: AppLanguage) {
  const translation: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(TRANSLATIONS)) {
    setNestedTranslationValue(translation, key, entry[language] ?? entry.hu);
  }

  return translation;
}

function setNestedTranslationValue(
  target: Record<string, unknown>,
  dottedKey: string,
  value: string
): void {
  const segments = dottedKey.split('.');
  let current: Record<string, unknown> = target;

  segments.forEach((segment, index) => {
    const isLeaf = index === segments.length - 1;
    if (isLeaf) {
      current[segment] = value;
      return;
    }

    const existing = current[segment];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  });
}
