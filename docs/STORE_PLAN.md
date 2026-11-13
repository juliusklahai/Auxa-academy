# Auxa: Google Play, Play Billing and iOS plan

Last updated: 13 November 2026

## Decisions to make first (they cannot be changed later)

1. **App ID (package name).** The current test app is `io.github.juliusklahai.maestro`. Once an app is published on Play, its package name is permanent. Pick the final one now, for example `com.auxa.academy`, and use the same ID for iOS (bundle ID).
2. **Developer account type.**
   - *Personal account*: $25 once. New personal accounts must run a **closed test with at least 12 testers, opted in for 14 days in a row**, before they can apply for production. Plan about 3 weeks for the first launch.
   - *Organization account*: skips the 12-tester rule, but needs a D-U-N-S number (can take up to ~30 days). Worth it if Auxa is or will be a registered company.
3. **A custom domain** (for example auxa.app). Store listings need a stable privacy policy and support URL, and links that survive repo renames. Point it at GitHub Pages; the app, verify links and Supabase redirects then use the domain.

## Part 1: Google Play (Android)

### 1. Make the app store-ready
- [ ] Final package name and app name ("Auxa: Piano & Singing").
- [ ] **Bundle the web app inside the APK** instead of loading the website. It opens instantly, works offline, and survives URL changes. Keep the website for the web version only.
- [ ] Build a signed **Android App Bundle (.aab)** in GitHub Actions with an upload key stored as a GitHub secret. Turn on **Play App Signing**.
- [ ] Target API 36 (already done), versionCode increases on every build (already automatic).
- [ ] Permissions used and explained: microphone (listening to playing and singing), MIDI/USB (keyboards). Nothing else.
- [ ] Account deletion in the app and on the web (done: Settings → Delete account, plus `delete-account` function).

### 2. Play Console setup
- [ ] Create the app, fill **Store listing**: short and long description, icon 512×512, feature graphic 1024×500, 4–8 phone screenshots, 7"/10" tablet screenshots.
- [ ] **Privacy policy URL** (exists at #/privacy), **Data safety** form: account email, name, progress; microphone audio is processed on device and not collected.
- [ ] **Content rating** questionnaire, **Target audience**: 13+ (choosing under-13 brings the Families policy and stricter rules).
- [ ] Ads: none.

### 3. Testing tracks
- [ ] **Internal testing** for our own fast checks (up to 100 testers, no review; does not count toward the 12-tester rule).
- [ ] **Closed testing** with **15–20 testers** (recruit more than 12; if the count drops below 12 the 14-day clock can stall). Testers opt in through the Play link and install from Play, not the APK. Ask them to open it several times a week and send feedback.
- [ ] After 14 days: **apply for production** and answer Google's questions about the test (what feedback came in, what changed).

### 4. Release
- [ ] Staged rollout (20% → 50% → 100%), watch Android vitals (crashes, ANRs).

## Part 2: Google Play Billing

Google requires apps on Play to sell digital content (our Pro and Plus plans) through **Play Billing**. So inside the Play app, Pro/Plus are bought with Google Play; **Stripe and Monime stay on the website** (and in the sideloaded APK). All of them grant the same plan in Supabase, so a learner who pays anywhere is Pro everywhere.

### Products (Play Console → Monetize)
- Subscriptions: `auxa_pro` and `auxa_plus`, each with a monthly base plan (optional yearly plan and free-trial offer).
- Prices set per country (Play converts; SLE is supported for local pricing where Play operates).
- Fees: 15% on the first $1M a year (and on subscriptions after the first year).

### App side
- [ ] Add **Play Billing Library 9** (version 8+ is required to publish updates).
- [ ] Native bridge: `MaestroNative.buy('auxa_pro')`, `restorePurchases()`, `manageSubscription()`.
- [ ] Paywall in the Play build shows Google Play prices and hides card/mobile-money buttons (no links to outside payment inside the Play app).
- [ ] After purchase, send the **purchase token** to our server; never trust the app alone.

### Server side (Supabase)
- [ ] Google Cloud service account with access to the **Google Play Developer API**; key stored as a Supabase secret.
- [ ] Edge function `play-verify`: checks the token with Google, **acknowledges** it (unacknowledged purchases are refunded after 3 days), records it in `payments` (provider `play`), and sets `pro_until`/`plus_until` from the subscription's expiry.
- [ ] **Real-time developer notifications** (Pub/Sub push → edge function `play-rtdn`): renewals, cancellations, grace period, on hold, refunds keep the plan in sync.
- [ ] Database: allow provider `play` in `payments` and `pro_source`.

### Testing billing
- [ ] License testers in Play Console (test cards, fast renewals), test buy, renew, cancel, refund, restore on a new phone.

## Part 3: iOS app

### Approach
Reuse the same web app inside a native iOS shell (Capacitor or a small Swift WKWebView app) that **ships the app files inside the app** and adds real native features. Apple rejects "a website in a frame" under **Guideline 4.2 (Minimum Functionality)**, so the iOS app must feel and act native:
- bundled files and full offline lessons (no browser error pages in airplane mode),
- **CoreMIDI** for USB/Bluetooth keyboards, the microphone with an explained permission prompt,
- native speech for the coach, haptics, share sheet for certificates, local practice reminders,
- **StoreKit 2** in-app subscriptions.

### Payments on iOS
- Apple requires **In-App Purchase** for Pro/Plus bought inside the app. Create `auxa_pro` / `auxa_plus` auto-renewing subscriptions in App Store Connect.
- Server: edge function `apple-verify` using the **App Store Server API**, plus **App Store Server Notifications v2** for renewals and refunds, writing to the same Supabase plan columns.
- Join the **App Store Small Business Program** (15% fee under $1M a year).
- Rules about linking to outside payment differ by country; by default the iOS app shows only Apple's purchase.

### What we need
- Apple Developer Program ($99/year), in the company's name if possible.
- A Mac is not strictly required: builds can run on GitHub Actions macOS runners (or Codemagic) with signing certificates stored as secrets. A Mac or an iPhone is very helpful for testing.
- App Store Connect: listing, screenshots (6.9" and 6.5" iPhone, 13" iPad if supported), privacy "nutrition label", age rating, account deletion (done), Sign in with Apple **if** we keep Google sign-in on iOS (Apple requires an equivalent option).

### Steps
1. iOS shell project in `native/ios`, bundling the built web app.
2. Native bridge matching Android's (`MaestroNative`: MIDI, speech, purchases, share, haptics).
3. StoreKit 2 subscriptions + `apple-verify` + notifications.
4. Sign in with Apple in Supabase Auth.
5. TestFlight beta (internal, then external testers).
6. Submit for review with clear review notes: what Auxa does natively (MIDI, microphone assessment, offline lessons), a demo account, and how to reach a paid lesson.

## Suggested order and rough timing

| Week | Work |
| --- | --- |
| 1 | Decide app ID, account type, domain. Bundle the web app in Android, signed .aab in CI. Start Play listing. |
| 1–2 | Play Billing in the Android app + `play-verify` + RTDN. Internal testing. |
| 2–4 | Closed test with 15–20 testers for 14+ days (personal account). Fix feedback. |
| 4–5 | Apply for production, staged rollout. |
| 3–6 | iOS shell, native bridge, StoreKit 2, Sign in with Apple, TestFlight. |
| 6–7 | App Store review and launch. |
