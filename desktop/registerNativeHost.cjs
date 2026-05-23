const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const BAT_PATH = path.join(DIR, 'password-manager-host.bat');
const CHROME_JSON_PATH = path.join(DIR, 'com.passwordmanager.host.chrome.json');
const MOZILLA_JSON_PATH = path.join(DIR, 'com.passwordmanager.host.mozilla.json');

// 1. Generate the BAT wrapper required by Windows Native Messaging
const batContent = `@echo off\n"${process.execPath}" "${path.join(DIR, 'nativeHost.cjs')}"\n`;
fs.writeFileSync(BAT_PATH, batContent);
console.log(`[INFO] Created wrapper: ${BAT_PATH}`);

// 2. Generate Chromium Manifest
const chromeManifest = {
  name: "com.passwordmanager.host",
  description: "Password Manager Autofill Host",
  path: BAT_PATH,
  type: "stdio",
  allowed_origins: [
    "chrome-extension://nionddfgmkmbjlchgmmmajifhkfhijhh/"
  ]
};
fs.writeFileSync(CHROME_JSON_PATH, JSON.stringify(chromeManifest, null, 2));

// 3. Generate Mozilla/Zen/Firefox Manifest
const mozillaManifest = {
  name: "com.passwordmanager.host",
  description: "Password Manager Autofill Host",
  path: BAT_PATH,
  type: "stdio",
  allowed_extensions: [
    "autofill@passwordmanager.com"
  ]
};
fs.writeFileSync(MOZILLA_JSON_PATH, JSON.stringify(mozillaManifest, null, 2));
console.log(`[INFO] Created Manifests`);

// 4. Register Native Messaging Hosts in Windows Registry
const addRegKey = (keyPath, value) => {
  const cmd = `reg add "${keyPath}" /ve /t REG_SZ /d "${value}" /f`;
  try {
    execSync(cmd, { stdio: 'ignore' });
    console.log(`[SUCCESS] Registered Native Host: ${keyPath}`);
  } catch (e) {
    console.error(`[ERROR] Failed to register Native Host: ${keyPath}`);
  }
};

// Helper to write named registry values (used for extension auto-install setup)
const addRegVal = (keyPath, valueName, value) => {
  const cmd = `reg add "${keyPath}" /v "${valueName}" /t REG_SZ /d "${value}" /f`;
  try {
    execSync(cmd, { stdio: 'ignore' });
    console.log(`[SUCCESS] Configured Auto-Install: ${keyPath}\\${valueName}`);
  } catch (e) {
    console.error(`[ERROR] Failed to configure Auto-Install: ${keyPath}\\${valueName}`);
  }
};

console.log("\nRegistering Native Messaging Hosts in Windows Registry...");
addRegKey(`HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.passwordmanager.host`, CHROME_JSON_PATH);
addRegKey(`HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.passwordmanager.host`, CHROME_JSON_PATH);
addRegKey(`HKCU\\Software\\Opera Software\\NativeMessagingHosts\\com.passwordmanager.host`, CHROME_JSON_PATH);
addRegKey(`HKCU\\Software\\Mozilla\\NativeMessagingHosts\\com.passwordmanager.host`, MOZILLA_JSON_PATH);

console.log("\nConfiguring Browser Extension Auto-Installation via Registry...");
const chromeExtId = "nionddfgmkmbjlchgmmmajifhkfhijhh";
const chromeWebStoreUpdateUrl = "https://clients2.google.com/service/update2/crx";

// Register Google Chrome Auto-Install Key
addRegVal(
  `HKCU\\Software\\Google\\Chrome\\Extensions\\${chromeExtId}`,
  "update_url",
  chromeWebStoreUpdateUrl
);

// Register Microsoft Edge Auto-Install Key
addRegVal(
  `HKCU\\Software\\Microsoft\\Edge\\Extensions\\${chromeExtId}`,
  "update_url",
  chromeWebStoreUpdateUrl
);

console.log("\nRegistration Complete!");
console.log("-------------------------------------------------------------------");
console.log("SUCCESS: The Chrome extension ID is now static and pre-configured!");
console.log("Chrome Extension ID: nionddfgmkmbjlchgmmmajifhkfhijhh");
console.log("Firefox/Zen Extension ID: autofill@passwordmanager.com");
console.log("-------------------------------------------------------------------");
