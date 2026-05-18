# Password Manager (Android)

Offline encrypted password vault for Android with **biometric unlock**, **export**, and **import**.

## Features

- Fully **offline** — no accounts, no cloud, no internet required (service logos bundled in the app)
- **Master password** + optional **fingerprint / face** unlock
- Encrypted vault (Argon2id + AES-256-GCM)
- Add, edit, search, delete password entries
- Password generator
- **Export** encrypted backup (`.pms` file)
- **Import** backup (merge or replace)
- **Android autofill** — fill usernames/passwords in Chrome and other apps (Android 8+)
- Auto-lock after 5 minutes
- Clipboard clears copied passwords after 30 seconds

## Prerequisites

1. [Node.js LTS](https://nodejs.org/) (includes npm)
2. [Android Studio](https://developer.android.com/studio) with JDK 17
3. Android phone or emulator with fingerprint/face (for biometrics)

## Setup

```bash
cd "Password Manager System"
npm install
npm run build
npm run cap:add          # first time only — creates android/ folder
npm run build:android
npm run cap:open
```

In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

## Development (browser preview)

```bash
npm run dev
```

Opens at `http://localhost:5173`. Biometrics and native file picker only work on a real Android build.

### Refreshing service logos (maintainers)

Logos ship in `src/assets/icons/`. To re-download from Simple Icons after editing `src/shared/iconSlugs.ts`:

```bash
npm run icons:download
npm run build
```

## Android autofill

### 1. System (all apps)

1. Build and install the app (`npm run build:android`, then build APK in Android Studio).
2. **System Settings → Passwords, passkeys & accounts** (or **Passwords & autofill**) → set **Password Manager** as the preferred autofill service.
3. Unlock the vault in the app (autofill only works while the vault is unlocked).

### 2. Google Chrome (required separately)

Chrome does **not** use your Android autofill choice by default — it uses **Google Password Manager** until you change it:

1. Open **Chrome** → **Settings** → **Autofill services** (on some versions: **Passwords and autofill**).
2. Select **Autofill using another service** (not Google / “Use Google”).
3. Restart Chrome.

Requires **Chrome 131+** from the Play Store. If the option is missing, update Chrome.

Optional on older builds: enable `chrome://flags/#enable-autofill-virtual-view-structure`, restart Chrome, then set the autofill option above.

### Using autofill

Tap a **username or password field** on a login page (not the address bar). Pick an entry from the Password Manager sheet.

Entries match by **website URL** and catalog domains (e.g. `instagram.com`). If nothing matches, all logins are offered while the vault is unlocked.

In-app help: **Settings → Android autofill**.

Requires **Android 8.0 (API 26)** or newer.

## Export / import

- **Export** (Settings): creates an encrypted backup file. Share or save to Downloads/Google Drive.
- **Import** (Settings): pick a `.pms` backup and enter its **master password**.
  - **Merge**: keeps existing entries and adds imported ones
  - **Replace**: overwrites the entire vault

## Security notes

- If you forget the master password, the vault **cannot** be recovered.
- Backup files are encrypted but should stay **private** (anyone with the file + password can open it).
- After malware on a PC, use this on a **clean phone** and unique passwords per site.
- Enable **2FA** on important accounts in addition to strong passwords.

## Vault storage

On Android, the encrypted vault is stored in the app's private data directory (`vault.enc.json`). It is not accessible to other apps or browser cookies.
