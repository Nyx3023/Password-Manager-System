/**
 * postInstall.cjs
 * 
 * Runs after Inno Setup installs the app. It:
 *   1. Generates the .bat wrapper (pointing to our bundled nativeHost.cjs via Electron)
 *   2. Writes the native host manifest JSONs
 *   3. Registers native messaging host registry keys for Chrome, Edge, Opera, Firefox/Zen
 *   4. Registers extension auto-install keys for Chrome & Edge (IDM-style)
 * 
 * Usage: <electron.exe> desktop/postInstall.cjs <install-dir>
 * The first argument after the script name is the installation directory.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// The install dir is passed as an argument by the Inno Setup [Run] section
const INSTALL_DIR = process.argv[2] || path.join(process.env.LOCALAPPDATA, 'Programs', 'Password Manager');

const DESKTOP_DIR  = path.join(INSTALL_DIR, 'desktop');
const BAT_PATH     = path.join(DESKTOP_DIR, 'password-manager-host.bat');
const CHROME_JSON  = path.join(DESKTOP_DIR, 'com.passwordmanager.host.chrome.json');
const MOZILLA_JSON = path.join(DESKTOP_DIR, 'com.passwordmanager.host.mozilla.json');
// Electron executable — this IS a valid Node.js runtime for running .cjs files
const ELECTRON_EXE = path.join(INSTALL_DIR, 'PasswordManager.exe');
const NATIVE_HOST  = path.join(DESKTOP_DIR, 'nativeHost.cjs');

// ─── Step 1: Create the .bat wrapper ─────────────────────────────────────────
const batContent = `@echo off\r\n"${ELECTRON_EXE}" "${NATIVE_HOST}"\r\n`;
fs.writeFileSync(BAT_PATH, batContent, 'utf8');
console.log('[INFO] Created BAT wrapper:', BAT_PATH);

// ─── Step 2: Write Chromium Native Messaging manifest ────────────────────────
const chromeManifest = {
  name: 'com.passwordmanager.host',
  description: 'Password Manager Autofill Host',
  path: BAT_PATH,
  type: 'stdio',
  allowed_origins: [
    'chrome-extension://nionddfgmkmbjlchgmmmajifhkfhijhh/'
  ]
};
fs.writeFileSync(CHROME_JSON, JSON.stringify(chromeManifest, null, 2), 'utf8');
console.log('[INFO] Written Chrome native host manifest');

// ─── Step 3: Write Mozilla/Zen/Firefox Native Messaging manifest ──────────────
const mozillaManifest = {
  name: 'com.passwordmanager.host',
  description: 'Password Manager Autofill Host',
  path: BAT_PATH,
  type: 'stdio',
  allowed_extensions: [
    'autofill@passwordmanager.com'
  ]
};
fs.writeFileSync(MOZILLA_JSON, JSON.stringify(mozillaManifest, null, 2), 'utf8');
console.log('[INFO] Written Mozilla native host manifest');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function regAddDefault(keyPath, value) {
  try {
    execSync(`reg add "${keyPath}" /ve /t REG_SZ /d "${value}" /f`, { stdio: 'ignore' });
    console.log('[OK] Registered:', keyPath);
  } catch (e) {
    console.error('[FAIL]', keyPath, e.message);
  }
}

function regAddNamed(keyPath, name, value) {
  try {
    execSync(`reg add "${keyPath}" /v "${name}" /t REG_SZ /d "${value}" /f`, { stdio: 'ignore' });
    console.log(`[OK] Registered: ${keyPath}\\${name}`);
  } catch (e) {
    console.error('[FAIL]', keyPath, e.message);
  }
}

// ─── Step 4: Register Native Messaging Hosts ──────────────────────────────────
const NM_BASE = 'HKCU\\Software';
regAddDefault(`${NM_BASE}\\Google\\Chrome\\NativeMessagingHosts\\com.passwordmanager.host`,          CHROME_JSON);
regAddDefault(`${NM_BASE}\\Microsoft\\Edge\\NativeMessagingHosts\\com.passwordmanager.host`,         CHROME_JSON);
regAddDefault(`${NM_BASE}\\Opera Software\\NativeMessagingHosts\\com.passwordmanager.host`,          CHROME_JSON);
regAddDefault(`${NM_BASE}\\Mozilla\\NativeMessagingHosts\\com.passwordmanager.host`,                 MOZILLA_JSON);

// ─── Step 5: Register Extension Auto-Install keys (IDM-style) ─────────────────
const EXT_ID  = 'nionddfgmkmbjlchgmmmajifhkfhijhh';
const UPD_URL = 'https://clients2.google.com/service/update2/crx';
regAddNamed(`${NM_BASE}\\Google\\Chrome\\Extensions\\${EXT_ID}`,    'update_url', UPD_URL);
regAddNamed(`${NM_BASE}\\Microsoft\\Edge\\Extensions\\${EXT_ID}`,   'update_url', UPD_URL);

console.log('\n[DONE] Post-install registration complete!');
