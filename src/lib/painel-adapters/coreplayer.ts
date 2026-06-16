import {
  loginAppAcesso,
  getDispositivos as getDispositivosBase,
  getPlaylistsDispositivo as getPlaylistsDispositivoBase,
  criarPlaylist as criarPlaylistBase,
  editarPlaylist as editarPlaylistBase,
  excluirPlaylist as excluirPlaylistBase,
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

export const criarPlaylist = (token: string, params: { deviceId: number; name: string; url: string; is_protected?: boolean }) =>
  criarPlaylistBase(CONFIG, token, params);

export const editarPlaylist = (token: string, params: { id: number; deviceId: number; name: string; url: string; is_protected?: boolean }) =>
  editarPlaylistBase(CONFIG, token, params);

export const excluirPlaylist = (token: string, params: { id: number; deviceId: number }) =>
  excluirPlaylistBase(CONFIG, token, params);

export function criarCorePlayerAdapter(
  creds: ServidorCredenciais,
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
) {
  return criarAppAcessoAdapter(CONFIG, creds, id, onSaveSession, onSaveContas);
}
