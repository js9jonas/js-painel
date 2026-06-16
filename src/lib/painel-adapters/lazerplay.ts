import type { PainelAdapter, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import {
  criarAppAcessoAdapter,
  loginAppAcesso,
  getDispositivos as getDispositivosBase,
  getPlaylistsDispositivo as getPlaylistsBase,
  ativarDispositivo as ativarBase,
  type AppAcessoConfig,
  type AppAcessoDevice,
  type AppAcessoPlaylist,
} from "./appacesso";

const CONFIG: AppAcessoConfig = {
  apiBase: "https://api.appacesso.com",
  websiteUrl: "https://reseller.lazerplay.io",
  recaptchaKey: "6LfjXhYsAAAAAHQ6pH2nBmSwmlK-e5xMcdbXAb5z",
  nomeApp: "LazerPlay",
};

export type LazerPlayDevice = AppAcessoDevice;
export type LazerPlayPlaylist = AppAcessoPlaylist;

export const loginLazerPlay = (email: string, senha: string) =>
  loginAppAcesso(CONFIG, email, senha);

export const getDispositivos = (token: string) =>
  getDispositivosBase(CONFIG, token);

export const getPlaylistsDispositivo = (token: string, deviceId: number) =>
  getPlaylistsBase(CONFIG, token, deviceId);

export const ativarDispositivo = (token: string, mac: string, packageId = 1) =>
  ativarBase(CONFIG, token, mac, packageId);

export function criarLazerPlayAdapter(
  creds: ServidorCredenciais,
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  return criarAppAcessoAdapter(CONFIG, creds, id, onSaveSession, onSaveContas);
}
