import {
  loginAppAcesso,
  getDispositivos as getDispositivosBase,
  getPlaylistsDispositivo as getPlaylistsDispositivoBase,
  criarAppAcessoAdapter,
  type AppAcessoConfig,
} from "./appacesso";
import type { ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

const CONFIG: AppAcessoConfig = {
  apiBase: "https://api.coreplayer.io",
  websiteUrl: "https://reseller.coreplayer.io",
  recaptchaKey: "",    // CorePlayer não exige captcha
  requireOrigin: true, // API bloqueia chamadas sem header Origin
  nomeApp: "CorePlayer",
};

export const loginCorePlayer = (email: string, senha: string) =>
  loginAppAcesso(CONFIG, email, senha);

export const getDispositivos = (token: string) =>
  getDispositivosBase(CONFIG, token);

export const getPlaylistsDispositivo = (token: string, deviceId: number) =>
  getPlaylistsDispositivoBase(CONFIG, token, deviceId);

export function criarCorePlayerAdapter(
  creds: ServidorCredenciais,
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
) {
  return criarAppAcessoAdapter(CONFIG, creds, id, onSaveSession, onSaveContas);
}
