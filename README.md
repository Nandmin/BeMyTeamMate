# BeMyTeamMateApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.13.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Cloudflare Pages

Use these settings when creating a Pages project:

- Build command: `npm run build`
- Build output directory: `dist/BeMyTeamMate-app`

SPA routing is handled by `public/_redirects`.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Firebase Configuration

### App Check Setup

The application uses Firebase App Check with reCAPTCHA v3 to protect against abuse. 

**Development Environment:**
- Debug token is NOT stored in the repository.
- Set your local token in browser console on localhost:
  ```js
  localStorage.setItem('FIREBASE_APPCHECK_DEBUG_TOKEN', 'YOUR_DEBUG_TOKEN')
  ```
- If no token is set on localhost, the app enables `FIREBASE_APPCHECK_DEBUG_TOKEN = true` automatically to generate one.
- You can also set a temporary global value before app bootstrap:
  ```js
  window.__APP_CHECK_DEBUG_TOKEN__ = 'YOUR_DEBUG_TOKEN'
  ```
- **Important:** Your local debug token must be registered in Firebase Console:
  1. Go to [Firebase Console](https://console.firebase.google.com/)
  2. Select the **BeMyTeamMate** project
  3. Navigate to **App Check** -> **Apps** -> **Web app**
  4. Click **Manage debug tokens**
  5. Add your local debug token value

**Production Environment:**
- Uses reCAPTCHA v3 Site Key: `YOUR_RECAPTCHAV3_TOKEN`
- Debug token is set to `undefined`

### Push Notifications

The application implements Firebase Cloud Messaging (FCM) for push notifications:

**Service Worker:**
- Location: `public/firebase-messaging-sw.js`
- Registered in `app.config.ts` via `provideServiceWorker`
- VAPID Key configured in environment files

**Implementation:**
- `NotificationService` handles FCM token management
- Tokens are stored in Firestore under `users/{uid}/private/pushTokens`
- Cloudflare Worker endpoint: `https://bemyteammate-push.andras78-nemeth.workers.dev/send-notification`

**Features:**
- Push notification permission management
- Foreground and background message handling
- Token synchronization on user login
- Group member notifications for events

### Caching Strategy

The application implements a comprehensive caching strategy to minimize Firestore reads and improve performance:

**Cache Layers:**
1. **In-Memory Cache**: `Map` objects for fast access during the session
2. **LocalStorage Cache**: Persistent cache across sessions
3. **TTL (Time To Live)**: 5 minutes default cache expiration

**Cached Data:**
- User profiles (`AuthService`)
- Groups list and individual groups (`GroupService`)
- Events (upcoming and past) (`EventService`)
- User's group memberships

**Cache Invalidation:**
- Automatic invalidation on data mutations (create, update, delete)
- Manual invalidation methods available in services
- TTL-based expiration for stale data prevention

**Benefits:**
- Reduced Firestore read operations (cost savings)
- Faster page loads and navigation
- Improved offline experience
- Better user experience with instant data display

## Known Issues & Warnings

### Firebase API Injection Context Warnings

You may see console warnings like:
```
[warning] Firebase API called outside injection context: getDocs
[warning] Firebase API called outside injection context: getDoc
```

**What does this mean?**
- This is an **architectural warning**, not a security issue
- Occurs when Firebase SDK functions are called outside Angular's dependency injection context
- Related to AngularFire 18+ changes in how it integrates with Angular's zone system

**Is it a problem?**
- ❌ **NOT a security risk** - Firebase Security Rules still protect your data
- ❌ **NOT a data leak** - No unauthorized access to Firestore
- ❌ **NOT a functional bug** - The application works correctly
- ⚠️ **Potential issues**: May cause subtle change-detection problems or memory leaks in edge cases

**Why haven't we fixed it?**
1. **No security impact**: Firebase Security Rules are enforced server-side
2. **No functional impact**: All features work as expected
3. **Cache is preserved**: Our caching strategy remains effective
4. **Time vs. benefit**: Fixing would require significant refactoring with minimal practical benefit

**Mitigation:**
- Used `defer()` operator from RxJS to wrap Firebase calls where possible
- This reduces (but doesn't eliminate) the warnings
- Services use proper dependency injection via `inject()`

**Future improvements (if needed):**
- Migrate from native Firebase SDK (`getDoc`, `getDocs`) to AngularFire wrappers (`docData`, `collectionData`)
- This would eliminate warnings but requires refactoring all Firebase queries
- Current cache implementation would remain compatible

**References:**
- [AngularFire Zones Documentation](https://github.com/angular/angularfire/blob/main/docs/zones.md)
- [Firebase API Injection Context Issue](https://github.com/angular/angularfire/issues)

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

