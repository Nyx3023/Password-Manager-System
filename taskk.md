Handoff prompt: Password Manager — continue development
You are working on an offline-first password manager at:

c:\Users\Nyx\Documents\Password Manager System

Stack: React 19 + TypeScript + Vite + Capacitor 7 (Android only today). Encrypted vault (vault.enc.json): Argon2id + AES-256-GCM. Unlock: 8-digit MPIN (required, GCash-style daily unlock), optional biometrics on Android, master password only for recovery / export / forgot MPIN.

Design: Nothing Phone–inspired black theme, NDot57 font. Use ASCII-only UI strings (no em-dash —, ellipsis …, middle dot ·) — NDot57 renders them as garbled text.

Build Android: npm install → npm run build → npx cap sync android → Android Studio → APK from android\app\build\outputs\apk\debug\.

Icons: Bundled SVGs in src/assets/icons/ from Simple Icons via npm run icons:download (scripts/download-icons.mjs). White icons on dark tiles (fill="#ffffff" + CSS filter: brightness(0) invert(1) on .service-icon--logo img). Service icons via src/shared/iconCache.ts + getBundledIconUrl().

Already implemented (verify / don’t regress)
Unlock flow (GCash-style)

Launch: MPIN pad first (not master password).
Master password only via Forgot MPIN? (recovery screen).
MPIN required at setup (no skip).
Biometrics: optional auto-prompt on Android while MPIN UI stays visible.
Bug fixed: useVault.ts sync() must NOT set mpinEnabled from in-memory service.hasMpin when locked — only from disk via refreshMeta / hasMpinOnDisk().
Dev reset

Reset app (dev) on recovery unlock + Settings (calls resetAllAppData()).
Layout / safe areas

CSS vars: --header-inset, --page-gutter-left/right, --header-min, --edge-extra, --cutout-right.
Full-bleed wizard footer and bottom nav (gutters on inner content only).
Topbar: Lock aligned on same row as Vault title (topbar-row).
User wanted header a bit higher (reduced --header-min ~38px, --header-extra ~8px) — tune if still too low on device.
Vault pagination

EntryList.tsx: 12 entries/page, Prev/Next, resets on filter/search change.
Password generator — custom format

Template: WEBSITE_username.###### (e.g. LINKEDIN_john.482910).
WEBSITE = service name uppercased, alphanumeric only.
user = username field or person name, lowercase alphanumeric (email local part if @).
6 random digits.
generateWebsiteFormatPassword() in src/shared/passwordGenerator.ts.
PasswordGeneratorPanel.tsx: tabs Website format (default) | Random.
Used in StepCredentials.tsx + EntryForm.tsx.
Android

MainActivity.java: WindowCompat.setDecorFitsSystemWindows(false), transparent status/nav bars.
viewport-fit=cover in index.html.
CSP connect-src includes cdn.simpleicons.org (for icon download script only).
Android autofill (started)

src/shared/vaultAutofill.ts, src/shared/autofillSync.ts — Capacitor plugin VaultAutofill on Android.
plugins/vault-autofill/package.json exists; native Android autofill service may be partial — check repo.
Browser dev vs phone

npm run dev uses localStorage; phone uses Filesystem — separate vaults unless export/import.
Next major goal: Windows desktop + LAN sync + browser autofill (NOT built yet)
User wants ALL of this, still completely offline (no cloud):

A) Desktop .exe app
Same React UI as mobile (reuse src/ + Vite dist/).
Electron recommended (tray + native messaging + LAN server).
Vault file: %AppData%\Password Manager\vault.enc.json (same encrypted format).
Unlock: MPIN + recovery master password (no phone biometrics on PC v1).
B) System tray (taskbar)
Right-click menu should include:

Open app / Lock / Quit
Sync with phone + last sync time
Show LAN IPv4 + port (e.g. 192.168.1.42:9847) — copyable; note true static IP is Windows network settings
Pairing code when LAN server is on
Start/stop LAN server
Settings shortcut
App can run in background with tray icon.

C) LAN sync (phone ↔ PC, same Wi‑Fi)
PC hosts HTTP server (easier than Android hosting).
Transfer encrypted vault.enc.json only.
Pairing: short-lived 6-digit code in tray; phone Settings → Sync with PC (IP + code).
API sketch: GET /api/status, GET /api/vault, PUT /api/vault with auth header.
Conflicts: revision / updatedAt; newer-wins or prompt (phone / PC / merge via existing importVault merge mode).
Phone remains fully usable offline when not syncing.
D) Browser extension (Chrome/Edge first)
Extension does NOT store vault.
Native messaging to desktop EXE (registry host installed with app).
Desktop holds unlocked session; extension asks for credentials by hostname (reuse logic like autofillSync.ts / matchHosts from catalog + entry URL).
User picks credential → fill username/password fields.
Mirror pattern already used on Android: entriesToAutofillCredentials() in src/shared/autofillSync.ts.
Suggested repo layout to add
desktop/           # Electron: main, tray, lanSync, native messaging host manifest
extension/         # Chrome MV3: background, content scripts
src/               # existing shared React app
plugins/vault-autofill/  # Android native autofill
Suggested phases
Electron shell + tray + PC vault on disk + show LAN IP
LAN sync server + phone client UI
Browser extension + native messaging autofill
Installer (electron-builder), optional start-with-Windows
Key files reference
Area	Paths
App entry
src/App.tsx, src/main.tsx
Vault logic
src/hooks/useVault.ts, src/shared/vaultService.ts, src/shared/storage.ts
Unlock
src/components/UnlockScreen.tsx
Vault UI
src/components/VaultScreen.tsx, EntryList.tsx
Generator
src/shared/passwordGenerator.ts, src/components/PasswordGeneratorPanel.tsx
Icons
src/assets/icons/*.svg, scripts/download-icons.mjs, src/shared/iconSlugs.ts
Styles
src/index.css
Android
android/, capacitor.config.ts
Autofill
src/shared/autofillSync.ts, src/shared/vaultAutofill.ts
User preferences / rules
Focused changes only; match existing code style.
Don’t commit unless asked.
Don’t create markdown docs unless asked.
Android-only for mobile; PC is new Electron target.
MPIN is mandatory; master password is recovery-only on daily unlock.
Your task
Continue from this state. If starting desktop work: scaffold Phase 1 (Electron + system tray + load existing Vite build + vault path under AppData). Then Phase 2 LAN sync, then Phase 3 browser extension. Fix any regressions found. Ask user only for ambiguous product decisions (e.g. conflict resolution default, port number, Electron vs Tauri if they disagree).

End of handoff prompt.

Addendum: Desktop UI (PC-only layout)
Requirement
Do not reuse the mobile portrait layout on desktop. Build a separate PC UI that still feels Nothing Phone–themed (black, minimal, NDot57, dot accents, red accent #ff4438, white primary actions) but uses desktop patterns: wider layout, side navigation, less bottom-nav / FAB mobile chrome.

Mobile (src/ as-is) stays for Capacitor Android. Desktop uses a dedicated layout (responsive breakpoint or separate route tree / src/desktop/ components).

Design direction (Nothing-themed desktop)
Mobile (keep)	Desktop (new)
Bottom nav: Vault / Settings
Left sidebar or top bar: Vault, Settings
FAB bottom-right
Primary action in header: “Add password” or + in toolbar
Single narrow column
Two-pane: list left, detail right (or list + slide panel)
Full-screen wizards
Modal or right drawer for add/edit (steps can stay)
MPIN pad centered full screen
MPIN unlock: centered card max-width ~400px on black canvas
Category chips horizontal scroll
Filters in a toolbar row under search
Entry list only
Master–detail: select entry → detail pane (no modal-only for view)
Keep: dark #000 background, #111 panels, #222 borders, muted #888 text, dot-matrix decoration (subtle, not cluttered), ASCII-only strings.

Avoid: stretching mobile max-width columns to full 1920px width; huge empty side margins with a tiny center column unless intentional (use panes instead).

Suggested desktop structure
┌────────────────────────────────────────────────────────────┐
│ [Logo] Password Manager          [Lock]  [Sync]  [+ Add]   │  ← top bar
├──────────┬─────────────────────────────┬───────────────────┤
│ Sidebar  │  Entry list + search        │  Entry detail     │
│ Vault    │  filters, pagination      │  user/pass/copy   │
│ Settings │                             │  edit / delete    │
│          │                             │                   │
│ LAN info │                             │                   │
│ (footer) │                             │                   │
└──────────┴─────────────────────────────┴───────────────────┘
Unlock: full-window black; MPIN pad in a centered card (same pad component, desktop spacing).
Settings: sidebar item → settings content in main area (not full-screen swap like mobile tabs).
Add entry: modal wizard or dedicated panel; don’t use mobile WizardShell full viewport unless restyled for ~520px modal width.
Tray app: separate from window UI; tray menu unchanged (sync, IP, lock, quit).
Implementation approach
Detect platform: Capacitor.getPlatform() === 'web' + Electron window.electron or env import.meta.env.VITE_DESKTOP for Electron build.
AppDesktop.tsx (or src/desktop/AppDesktop.tsx) — desktop shell; AppMobile.tsx — current flow for Android.
Shared: useVault, vaultService, forms, PasswordGeneratorPanel, crypto — no duplication of vault logic.
Desktop-only CSS: src/desktop/desktop.css or index-desktop.css imported only in Electron entry; keep index.css tokens (:root variables) shared.
Electron loads same Vite build with VITE_DESKTOP=true → main.tsx renders AppDesktop.
Tray + extension (unchanged from main prompt)
Electron tray: sync, LAN IP, pairing, lock, open window.
Browser extension talks to desktop process via native messaging; desktop UI is independent of extension popup (extension can be minimal: “Unlock desktop app” if locked).
Acceptance criteria for desktop UI

 No bottom navigation bar on desktop build

 Vault list + detail visible together at ≥1024px width

 Nothing aesthetic preserved (black, NDot57, dots, red accent)

 Mobile Android build unchanged

 All features work on desktop: MPIN, recovery, generator (website format), pagination, settings, export/import, future LAN sync
Full combined handoff prompt (paste this at work)
Use the entire previous handoff prompt from the last message, plus everything in “Addendum: Desktop UI” and “Implementation approach” above. Priority order:

Phase 1: Electron .exe + tray + PC vault path + AppDesktop shell (not mobile layout).
Phase 2: LAN sync (PC host, phone client).
Phase 3: Browser extension + autofill via native messaging.
Polish: installer, start with Windows, conflict UI for sync.
When implementing desktop UI, design for mouse and keyboard (hover states, sensible tab order, wider click targets optional). Keep ASCII-only copy for NDot57.

That’s the full instruction set for the next session, including the separate Nothing-themed desktop UI.