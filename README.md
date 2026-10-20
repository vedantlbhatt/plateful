# Plateful

Event organizers post leftover catered food; nearby students claim a plate and pick it up.
Expo (SDK 58) app + Firebase (Auth, Firestore, Storage, Cloud Functions). Runs in Expo Go.

```
src/app/            screens (Expo Router)
  role.tsx          first-launch role picker
  organizer/        sign-in, home, post-new, post/[id] live view, close/[id] wrap-up, event-new
  student/          onboarding (buildings + push), feed, post/[id] claim, survey, settings
src/lib/            firebase init, session, api (posts/claims/surveys), notifications, event log
config/buildings.json   building list + adjacency (single source; functions copy it at build)
functions/src/      Cloud Functions (TypeScript)
functions/scripts/export-csv.mjs   admin CSV export
firestore.rules, storage.rules, firestore.indexes.json
```

## Setup

1. **Firebase project** (Blaze plan, needed for Functions and Cloud Scheduler):
   - Authentication: enable **Email/Password** and **Anonymous**.
   - Create Firestore and Storage.
   - Add a Web app and copy its config.
2. `cp .env.example .env` and fill in the `EXPO_PUBLIC_FIREBASE_*` values.
3. Push tokens need an EAS project id, even in Expo Go: `npx eas-cli@latest init`, then put the id
   in `.env` as `EAS_PROJECT_ID`.
4. `cp .firebaserc.example .firebaserc` with your project id, then:
   ```bash
   npm install && npm --prefix functions install
   firebase deploy --only firestore,storage,functions
   ```
5. `npx expo start` and scan the QR code with Expo Go.

### Local, no Firebase project

```bash
npm --prefix functions run build
firebase emulators:start --project demo-plateful --only auth,firestore,functions,storage
```
Set `EXPO_PUBLIC_EMULATOR_HOST` to your Mac's LAN IP (`127.0.0.1` for the iOS simulator) and use
`demo-plateful` as the project id. Create a verified organizer in the Auth emulator UI
(localhost:4000), because emulator verification emails are only printed to the console.

## Expo Go caveats

- **Android Expo Go cannot receive remote push** (removed in SDK 53). On Android Expo Go, and on
  simulators, the app falls back to **on-device notifications**: the student feed fires a local
  alert when an in-range post appears while the app is running, and organizer reminders are
  scheduled locally. iOS Expo Go on a real device gets real push. For full Android push, make a
  development build (`eas build --profile development`).
- The app never requests location. "Nearby" means the picked buildings plus their neighbours in
  `config/buildings.json`.

## How it works

- **Roles.** Organizers sign in with a verified `@gatech.edu` email and password; the rules
  require a verified GT token to create an organizer profile or post. Students sign in anonymously.
- **Posting.** The post is written straight from the client, so it shows up instantly. The photo
  uploads afterwards, so it never delays the post going live. `post_time_ms` runs from the first
  render of the Post screen to the server acknowledging the write.
- **Claims.** Claim, release, pickup and expire go through callables (`claimPlate`,
  `resolveClaim`) that change the claim and `platesLeft` in **one transaction**, so the last plate
  cannot be claimed twice, and every phone's listener sees the count change at once.
  `onClaimWrite` handles the side effects: it logs each transition and, on release or expiry,
  pushes the freed plate to the next student in range who has not claimed it. The "next student"
  is someone who picked that exact building before a neighbour, earliest sign-up first, and never
  the same student twice for one post.
- **Expiry.** The client expires a hold when its countdown hits 0. `sweepClaimsAndPosts` (every
  minute) is the backstop: it expires 8-minute holds and closes posts 4 h after `servedAt`.
- **Auto-close.** `onPostUpdated` closes a post once `platesLeft == 0` and no holds remain, and
  logs `post_closed` for every close.
- **Reminders.** "Add an event" stores `eventSchedules`; `sendEventReminders` (every minute) pushes
  the reminder 10 minutes before the event ends. Tapping it opens Post leftovers with the building
  and room filled in.

## Testing data

Every action writes a row to `events` (`post_screen_opened`, `post_created` + `post_time_ms`,
`count_edited`, `alert_sent`, `alert_opened`, `claim_created`, `claim_released`, `claim_expired`,
`pickup_confirmed`, `post_closed` + reason, `reminder_sent`, `reminder_opened`, plus
`survey_submitted`, `plates_thrown_out`, `buildings_set`, `push_permission`).

```bash
npm run export                       # all data
npm run export -- --since 2026-10-27 # one test day
```
This writes `exports/<timestamp>/{events,posts,claims,surveys}.csv`. `posts.csv` carries the
outcome metrics (claims, pickups, plates thrown out, alerts sent and opened, minutes live) and the
organizer survey. `claims.csv` carries the student survey. It needs `GOOGLE_APPLICATION_CREDENTIALS`
or `gcloud auth application-default login`. Rename columns in the script to match the testing
sheet.

## Tests

```bash
npm run typecheck
npm --prefix functions test     # alert text, adjacency, next-student choice
```

## Not in this prototype (Sprint 4)

GroupMe cross-post, web claim page, wider-radius notify on release.
