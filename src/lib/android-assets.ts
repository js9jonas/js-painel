import fs from "fs";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "src", "assets", "whatsapp-android");

export function lerAssetEstaticoAndroid(nome: "pop-player-logo.png"): Buffer {
  return fs.readFileSync(path.join(ASSETS_DIR, nome));
}
