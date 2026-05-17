# Password Manager (Android)

Offline encrypted password vault for Android with **biometric unlock**, **export**, and **import**.

## Features

- Fully **offline** — no accounts, no cloud, no internet required
- **Master password** + optional **fingerprint / face** unlock
- Encrypted vault (Argon2id + AES-256-GCM)
- Add, edit, search, delete password entries
- Password generator
- **Export** encrypted backup (`.pms` file)
- **Import** backup (merge or replace)
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
