import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";

const ASSETS_DIR = path.join(process.cwd(), "src", "assets", "whatsapp-iphone");
const BASE_LIMPA = path.join(ASSETS_DIR, "enter-playlist-base.png");
const FONTE = path.join(ASSETS_DIR, "LiberationSans-Bold.ttf");
const FONT_FAMILY = "IPTVDataFontEmbutida";
const FONT_SIZE = 31;

// Coordenadas calibradas por varredura de pixel em enter-playlist-base.png (1280x591).
// Recalibrar se a imagem-base for substituída.
const CAMPOS = [
  { chave: "playlistName", top: 110, height: 70 },
  { chave: "usuario", top: 197, height: 70 },
  { chave: "senha", top: 284, height: 70 },
  { chave: "url", top: 371, height: 70 },
] as const;
const TEXTO_LEFT = 568 + 18;

let fonteRegistrada = false;
function garantirFonteRegistrada() {
  // registro explícito por arquivo — não depende de fontconfig/fontes do host,
  // ao contrário do SVG+@font-face via sharp/librsvg (falhava em produção, sem
  // nenhuma fonte instalada no container: texto virava "tofu" ▯▯▯). Verificado
  // reproduzindo o mesmo container (node:20-slim, zero fontes) antes de trocar.
  if (!fonteRegistrada) {
    GlobalFonts.registerFromPath(FONTE, FONT_FAMILY);
    fonteRegistrada = true;
  }
}

export type DadosIphone = {
  playlistName: string;
  usuario: string;
  senha: string;
  url: string;
};

export async function gerarImagemDadosIphone(dados: DadosIphone): Promise<Buffer> {
  garantirFonteRegistrada();

  const imagemBase = await loadImage(BASE_LIMPA);
  const canvas = createCanvas(imagemBase.width, imagemBase.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imagemBase, 0, 0);
  ctx.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
  ctx.fillStyle = "#2b1338";

  for (const c of CAMPOS) {
    const baseline = c.top + c.height / 2 + FONT_SIZE * 0.35;
    ctx.fillText(dados[c.chave], TEXTO_LEFT, baseline);
  }

  return canvas.toBuffer("image/png");
}

export function lerAssetEstatico(nome: "logo-app.png" | "choose-playlist-type.png" | "parental-control.png"): Buffer {
  return fs.readFileSync(path.join(ASSETS_DIR, nome));
}
