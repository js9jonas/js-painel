import type { PainelAdapter, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import {
  criarAppAcessoAdapter,
  loginAppAcesso,
  getDispositivos as getDispositivosBase,
  getPlaylistsDispositivo as getPlaylistsBase,
  ativarDispositivo as ativarBase,
  criarPlaylist as criarPlaylistBase,
  editarPlaylist as editarPlaylistBase,
  excluirPlaylist as excluirPlaylistBase,
  type AppAcessoConfig,
  type AppAcessoDevice,
  type AppAcessoPlaylist,
} from "./appacesso";

const CONFIG: AppAcessoConfig = {
  apiBase: "https://api.funplays.app",
  websiteUrl: "https://reseller.funplays.app",
  recaptchaKey: "6LcS2BYsAAAAALlg6fQnrKJLBTheTQbiyy6hUbnz",
  nomeApp: "FunPlays",
};

// Re-exports tipados para uso no sync route
export type FunPlaysDevice = AppAcessoDevice;
export type FunPlaysPlaylist = AppAcessoPlaylist;

export const loginFunPlays = (email: string, senha: string) =>
  loginAppAcesso(CONFIG, email, senha);

export const getDispositivos = (token: string) =>
  getDispositivosBase(CONFIG, token);

export const getPlaylistsDispositivo = (token: string, deviceId: number) =>
  getPlaylistsBase(CONFIG, token, deviceId);

export const ativarDispositivo = (token: string, mac: string, packageId = 1) =>
  ativarBase(CONFIG, token, mac, packageId);

export const criarPlaylist = (token: string, params: { deviceId: number; name: string; url: string; is_protected?: boolean }) =>
  criarPlaylistBase(CONFIG, token, params);

export const editarPlaylist = (token: string, params: { id: number; deviceId: number; name: string; url: string; is_protected?: boolean }) =>
  editarPlaylistBase(CONFIG, token, params);

export const excluirPlaylist = (token: string, params: { id: number; deviceId: number }) =>
  excluirPlaylistBase(CONFIG, token, params);

export function criarFunPlaysAdapter(
  creds: ServidorCredenciais,
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  return criarAppAcessoAdapter(CONFIG, creds, id, onSaveSession, onSaveContas);
}
