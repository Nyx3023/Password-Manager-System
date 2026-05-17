import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker } from "@capawesome/capacitor-file-picker";

const EXPORT_NAME = "password-vault-backup.pms";

export async function exportVaultToDevice(vaultJson: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const blob = new Blob([vaultJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = EXPORT_NAME;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  await Filesystem.writeFile({
    path: EXPORT_NAME,
    directory: Directory.Cache,
    data: vaultJson,
    encoding: Encoding.UTF8,
  });

  const { uri } = await Filesystem.getUri({
    path: EXPORT_NAME,
    directory: Directory.Cache,
  });

  await Share.share({
    title: "Password vault backup",
    text: "Encrypted password vault backup. Keep this file private.",
    url: uri,
    dialogTitle: "Export vault",
  });
}

async function readWithBrowserPicker(accept: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("No file selected."));
        return;
      }
      resolve(await file.text());
    };
    input.click();
  });
}

async function readWithNativePicker(types: string[]): Promise<string> {
  const result = await FilePicker.pickFiles({ types, readData: true });
  const file = result.files[0];
  if (!file) throw new Error("No file selected.");

  if (typeof file.data === "string") {
    // base64-encoded
    return new TextDecoder().decode(
      Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0)),
    );
  }
  if (file.path) {
    const read = await Filesystem.readFile({
      path: file.path,
      encoding: Encoding.UTF8,
    });
    return typeof read.data === "string" ? read.data : "";
  }
  throw new Error("Could not read the selected file.");
}

export async function pickVaultImportFile(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return readWithBrowserPicker(".pms,.json,application/json");
  }
  return readWithNativePicker(["application/json"]);
}

export async function pickCsvFile(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return readWithBrowserPicker(".csv,text/csv");
  }
  return readWithNativePicker(["text/csv", "text/comma-separated-values"]);
}
