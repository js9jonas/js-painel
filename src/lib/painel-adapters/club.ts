import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ResultadoCriacao, DetalhesConta, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import { impitFetch } from "./proxy-retry";

// API: https://pdcapi.io/   Auth: X-ACCESS-TOKEN
// ⚠️ Duração real da sessão observada em produção: ~1h ou menos (não os "~7 dias" nominais que
// uma nota antiga chegou a registrar) — parseJwtExpiry() abaixo lê o exp real do JWT a cada
// login, então session_expiry no banco já reflete a duração verdadeira independente deste
// comentário. Ver docs/memoria/project_club_token_expiry.md e club-keepalive.ts (renovação
// preventiva, criada 27/08/2026 por causa dessa duração curta).
// Login: 2captcha (HCaptchaTaskProxyless) → POST pdcapi.io/login (URL-encoded)
// hCaptcha sitekey dashboard.bz: 8cf2ef3e-6e60-456a-86ca-6f2c855c3a06
// Nota: CapSolver HCaptchaTaskProxyLess testado e não resolveu este challenge

const API_URL     = "https://pdcapi.io/";
const WEBSITE_URL = "https://dashboard.bz/login.php";
const SITEKEY     = "8cf2ef3e-6e60-456a-86ca-6f2c855c3a06";

// Pacote "Completo" — pares [sem_adulto, com_adulto] por categoria (Canais, Canais 24H, Filmes,
// Series, Novelas) + Radios (225, sem variante adulta). Capturado via payload real do formulário
// "Criar nova lista" em dashboard.bz (reverse engineering 05/08/2026, ver reference-adapters-paineis-iptv).
const BOUQUET_PARES_COMPLETO = ["215|216", "217|218", "219|220", "221|222", "223|224"];
const BOUQUET_COMPLETO_SEM_ADULTO = "215,217,219,221,223,225";
const BOUQUET_COMPLETO_COM_ADULTO = "216,218,220,222,224,225";
// pdcapi.io bloqueia IP do datacenter Hostinger — proxy residencial necessário
// timeout curto (padrão do impit é ~30s, igual ao timeout externo do /conexoes — não sobra
// janela pro retry de proxy-retry.ts tentar outro IP do pool antes do status check desistir)
const impit       = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL, timeout: 10_000 });

// Evita múltiplos logins simultâneos para o mesmo painel (sync + status ao mesmo tempo).
// Compartilhado entre withRelogin (relogin reativo), o botão "Renovar Sessão" (renovar-sessao/
// route.ts) e o cron preventivo (lib/club-keepalive.ts) — os três chamam dispararLoginClub(),
// então nunca resolvem 2 hCaptchas em paralelo pro mesmo painel (evita gastar crédito à toa e
// reduz o risco do hCaptcha adaptativo escalar dificuldade por excesso de tentativas seguidas,
// ver project_club_migracao_painel).
const loginEmProgresso = new Map<number, Promise<{ token: string; expiry: Date }>>();

// Gera username aleatório: 9 chars alfanuméricos minúsculos
function gerarUsername(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Gera senha no padrão exigido: 9 chars, ≥1 maiúscula, ≥1 dígito
function gerarSenha(): string {
  const lower  = "abcdefghijklmnopqrstuvwxyz";
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const all    = lower + upper + digits;
  const parts  = [
    upper [Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    ...Array.from({ length: 7 }, () => all[Math.floor(Math.random() * all.length)]),
  ];
  return parts.sort(() => Math.random() - 0.5).join("");
}

async function resolverHCaptcha(): Promise<string> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) throw new Error("TWOCAPTCHA_API_KEY não definida no Easypanel.");

  let ultimoErro = "";

  // workers falham ~66% das vezes neste challenge — até 10 tentativas
  for (let tentativa = 1; tentativa <= 10; tentativa++) {
    const criacao = await fetch("https://api.2captcha.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: { type: "HCaptchaTaskProxyless", websiteURL: WEBSITE_URL, websiteKey: SITEKEY },
      }),
    }).then(r => r.json()) as any;

    if (criacao.errorId) {
      ultimoErro = `createTask: ${criacao.errorDescription ?? criacao.errorCode ?? criacao.errorId}`;
      continue;
    }

    const { taskId } = criacao;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const result = await fetch("https://api.2captcha.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      }).then(r => r.json()) as any;

      if (result.status === "ready") return result.solution.gRecaptchaResponse as string;
      if (result.errorId) {
        ultimoErro = `getTaskResult: ${result.errorDescription ?? result.errorCode}`;
        break;
      }
    }
  }
  throw new Error(`CLUB: hCaptcha não resolvido após 10 tentativas. Último erro: ${ultimoErro}`);
}

async function loginViaCaptcha(usuario: string, senha: string): Promise<string> {
  const hcapToken = await resolverHCaptcha();

  const res = await impit.fetch(`${API_URL}login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": "https://dashboard.bz",
      "Referer": "https://dashboard.bz/login.php",
    },
    body: new URLSearchParams({
      username: usuario,
      password: senha,
      email: "",
      "g-recaptcha-response": hcapToken,
      "h-captcha-response": hcapToken,
    }).toString(),
  });

  if (!res.ok) throw new Error(`CLUB login → ${res.status}`);
  const data = await res.json() as any;
  if (!data.result || !data.token) {
    throw new Error(`CLUB login falhou: ${data.msg ?? JSON.stringify(data)}`);
  }
  return data.token as string;
}

function parseJwtExpiry(token: string): Date | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload.exp ? new Date(Number(payload.exp) * 1000) : null;
  } catch { return null; }
}

// Exposta para uso no endpoint /renovar-sessao (operação longa, fora do status check)
export async function loginClub(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<{ token: string; expiry: Date }> {
  const token = await loginViaCaptcha(creds.painel_usuario, creds.painel_senha);
  // Tenta ler o exp do JWT; fallback para 2h se token opaco ou exp ausente
  const expiry = parseJwtExpiry(token) ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  await onSaveSession(token, expiry);
  return { token, expiry };
}

// Dispara um login pro painel `id`, reaproveitando um em andamento se já houver um (dedup via
// loginEmProgresso) — chamado por withRelogin, pelo botão "Renovar Sessão" e pelo cron
// preventivo (club-keepalive.ts). Quem chama recebe o erro real (não é engolido aqui): o
// `.catch(() => {})` abaixo é só um handler "silencioso" pra não estourar unhandledRejection no
// processo — como é anexado à MESMA promise `p` (não a uma derivada), não afeta o que os
// awaiters de fato recebem via `await dispararLoginClub(...)`.
export function dispararLoginClub(
  id: number,
  creds: ServidorCredenciais,
  onSaveSession: SaveSession
): Promise<{ token: string; expiry: Date }> {
  const existente = loginEmProgresso.get(id);
  if (existente) return existente;
  const p = loginClub(creds, onSaveSession);
  loginEmProgresso.set(id, p);
  p.catch(() => {}).finally(() => loginEmProgresso.delete(id));
  return p;
}

export function loginClubEmProgresso(id: number): boolean {
  return loginEmProgresso.has(id);
}

// pdcapi.io responde HTTP 200 com {result:false, msg:"A sessão está expirada (N)"}
// para token morto — não é um erro HTTP, então precisa ser detectado no corpo da resposta.
class ClubSessionExpiredError extends Error {}

async function apiFetch(token: string, path: string, options: { method?: HttpMethod; body?: URLSearchParams | string } = {}) {
  const res = await impitFetch(impit, API_URL + path, {
    method: options.method ?? "GET",
    body: options.body instanceof URLSearchParams ? options.body.toString() : options.body,
    headers: {
      "X-ACCESS-TOKEN": token,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://dashboard.bz",
      "Referer": "https://dashboard.bz/",
    },
  });
  if (!res.ok) throw new Error(`pdcapi.io/${path} → ${res.status}`);
  const data = await res.json() as any;
  if (data?.result === false && /expirad/i.test(data.msg ?? "")) {
    throw new ClubSessionExpiredError(data.msg);
  }
  return data;
}

function mapStatus(s: string | number, expDate?: number): ContaPainel["status"] {
  if (String(s) === "0") return "bloqueada";
  if (String(s) === "1") {
    if (expDate && new Date(expDate * 1000) < new Date()) return "vencida";
    return "ok";
  }
  return "vencida";
}

export function criarClubAdapter(
  creds: ServidorCredenciais,
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  let sessionCache = creds.session_cookie ?? "";
  let expiryCache = creds.session_expiry;

  function cachedToken(): string | null {
    if (!sessionCache) return null;
    const expirado = expiryCache && new Date(expiryCache) <= new Date();
    return expirado ? null : sessionCache;
  }

  function dispararLogin() {
    // Atualiza o cache local desta instância quando o login (compartilhado via dispararLoginClub)
    // terminar — erro real já foi reportado ao chamador original de withRelogin, então aqui só
    // evita um unhandled rejection residual.
    dispararLoginClub(id, creds, onSaveSession)
      .then((r) => { sessionCache = r.token; expiryCache = r.expiry; })
      .catch(() => {});
  }

  // Re-login nunca bloqueia o request — qualquer ausência ou quebra de sessão dispara login em
  // background (dedup compartilhado com o cron/botão manual via dispararLoginClub) e falha
  // imediatamente.
  async function withRelogin<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const cached = cachedToken();
    if (!cached) {
      dispararLogin();
      const jaReconectando = loginClubEmProgresso(id);
      throw new Error(
        jaReconectando
          ? "CLUB: reconectando em background (2captcha, ~5min). Aguarde e tente novamente."
          : "CLUB: sem sessão ativa — reconectando em background. Aguarde e tente novamente."
      );
    }
    try {
      return await fn(cached);
    } catch (err) {
      if (!(err instanceof ClubSessionExpiredError)) throw err;
      dispararLogin();
      throw new Error("CLUB: sessão expirada — reconectando em background. Aguarde e tente novamente.");
    }
  }

  async function listarContasRaw(token: string) {
    const data = await apiFetch(token, "listas/minhas", {
      method: "POST",
      body: new URLSearchParams({ draw: "1", start: "0", length: "2000" }),
    });
    return (data.data ?? []) as any[];
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      // Apenas o bulk — 1 request. Senhas NÃO são buscadas aqui para não esgotar a sessão
      // (CLUB é sessão única: 280+ chamadas individuais invalidam o token no servidor).
      // Senhas são importadas separadamente via /importar-senhas.
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        return lista.map((l: any) => ({
          usuario:    l.username,
          rotulo:     l.reseller_notes || "",
          vencimento: l.exp_date
            ? new Date(Number(l.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
            : null,
          status: mapStatus(l.status, l.exp_date ? Number(l.exp_date) : undefined),
          senha:  null, // sempre nulo aqui — senhas vivem no banco local
        }));
      });
    },

    // Importa senhas sequencialmente via listas/{id}/info — chamado explicitamente, não no sync diário.
    // Sequencial (não paralelo) + pausa de 300ms para não invalizar a sessão única do CLUB.
    // Se a sessão morrer no meio, retorna o parcial acumulado (não lança).
    async importarSenhas(prioridade?: Set<string>): Promise<Map<string, string | null>> {
      return withRelogin(async (token) => {
        const raw = await listarContasRaw(token);
        // Contas sem senha primeiro; as demais em seguida
        const lista = prioridade && prioridade.size > 0
          ? [...raw.filter((l: any) => prioridade.has(l.username)), ...raw.filter((l: any) => !prioridade.has(l.username))]
          : raw;
        const senhas = new Map<string, string | null>();
        for (const l of lista) {
          try {
            const info = await apiFetch(token, `listas/${l.id}/info`);
            if (info?.data?.password) {
              senhas.set(l.username, info.data.password as string);
            }
          } catch (err) {
            if (err instanceof ClubSessionExpiredError) break; // retorna parcial
            // outros erros: ignora e continua
          }
          await new Promise(r => setTimeout(r, 300));
        }
        return senhas;
      });
    },

    async getCreditos(): Promise<number | null> {
      try {
        return await withRelogin(async (token) => {
          const res = await impitFetch(impit, `${API_URL}stats`, {
            method: "GET",
            headers: {
              "X-ACCESS-TOKEN": token,
              "X_FILTRO": "1",
              "Origin": "https://dashboard.bz",
              "Referer": "https://dashboard.bz/",
            },
          });
          if (!res.ok) throw new Error(`CLUB stats → ${res.status}`);
          const data = await res.json() as any;
          if (data?.result === false && /expirad/i.test(data.msg ?? "")) {
            throw new ClubSessionExpiredError(data.msg);
          }
          return data?.data?.credits != null ? parseFloat(data.data.credits) : null;
        });
      } catch {
        return null;
      }
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

        const result = await apiFetch(token, `listas/${conta.id}/renovar`, {
          method: "POST",
          body: new URLSearchParams({ tempo: String(meses) }),
        });
        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao renovar no CLUB." };

        // exp_date pode vir na resposta do renovar OU precisar ser buscado na listagem atualizada
        // (pequeno delay porque a API às vezes ainda não refletiu o novo vencimento na listagem)
        let expRaw = result.exp_date;
        if (!expRaw) {
          await new Promise((r) => setTimeout(r, 2000));
          expRaw = (await listarContasRaw(token)).find((l: any) => l.username === usuario)?.exp_date;
        }

        if (expRaw) {
          const novoVenc = new Date(Number(expRaw) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
          await onSaveContas(usuario, novoVenc);
          return { ok: true, novoVencimento: novoVenc };
        }
        return { ok: true };
      });
    },

    async editarConta(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string; comAdultos?: boolean }): Promise<ResultadoEdicao> {
      return withRelogin(async (token) => {
        // Busca o id interno da conta pelo username
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

        // A listagem em massa não traz senha — busca a atual via /info quando não estamos trocando,
        // pra não mandar o campo em branco (payload real do site sempre envia a senha atual)
        let senhaAtual = campos.novaSenha;
        if (!senhaAtual) {
          const info = await apiFetch(token, `listas/${conta.id}/info`);
          senhaAtual = info?.data?.password ?? "";
        }

        // Por padrão preserva o bouquet atual. Só troca quando comAdultos é passado explicitamente
        // (ex: reaproveitar uma conta de teste "sem adulto" pra virar uma conta paga "com adulto"
        // na migração CLUB antigo→novo — ver criarConta() acima pro mesmo padrão de troca de bouquet).
        const trocandoBouquet = campos.comAdultos !== undefined;
        const bouquetAlvo = trocandoBouquet
          ? (campos.comAdultos ? BOUQUET_COMPLETO_COM_ADULTO : BOUQUET_COMPLETO_SEM_ADULTO)
          : (conta.bouquet ?? "");

        // Nomes de campo confirmados capturando o payload real do formulário de edição do site
        // (diferente do que estava aqui antes: username_edit/password_edit/reseller_notes/plano_novo_edit)
        // ⚠️ 05/08/2026: capturado via interceptor de fetch/XHR (Claude in Chrome) editando uma conta
        // real com o toggle "Conteúdo Adulto" — dois campos que faltavam completamente antes:
        // `plano_opt_edit` é "on" (não "antigo") quando o pacote/bouquet está sendo REALMENTE aplicado
        // (só usa "antigo" pra manter o pacote atual sem mexer), e existe um campo SEPARADO
        // `plano_adulto=1` que é o que de fato liga o conteúdo adulto — os IDs de bouquet sozinhos
        // (215..225 vs 216..225) nunca foram suficientes. Isso explica o quirk antigo documentado
        // no criarConta() ("bouquet adulto não aplica mesmo com IDs certos") — ver mesmo fix lá embaixo.
        const body = new URLSearchParams();
        body.set("id",             String(conta.id));
        body.set("username",       campos.novoUsuario ?? usuario);
        body.set("password",       senhaAtual ?? "");
        body.set("email",          "");
        body.set("plano",          "");
        body.set("plano_antigo",   bouquetAlvo);
        body.set("plano_novo",     bouquetAlvo);
        body.set("plano_opt_edit", trocandoBouquet ? "on" : "antigo");
        if (trocandoBouquet) body.set("plano_adulto", campos.comAdultos ? "1" : "0");
        body.set("notas",          campos.novoRotulo ?? conta.reseller_notes ?? "");

        const result = await apiFetch(token, `listas/${conta.id}/editar`, {
          method: "POST",
          body,
        });
        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao editar conta no CLUB." };
        return { ok: true };
      });
    },

    async gerarTeste({ comAdultos = false, horas = 6, rotulo = "" } = {}): Promise<ResultadoTeste> {
      return withRelogin(async (token) => {
        const usuario = gerarUsername();
        const senha   = gerarSenha();
        const bouquet = comAdultos ? "36" : "35";

        const result = await apiFetch(token, "listas/teste", {
          method: "POST",
          body: new URLSearchParams({
            adulto:   bouquet,
            horas:    String(Math.min(Math.max(horas, 1), 6)),
            username: usuario,
            password: senha,
            nitro:    "0",
          }),
        });

        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao gerar teste no CLUB." };

        // A criação não aceita rótulo — aplica via chamada extra de edição (campo "notas",
        // confirmado capturando o payload real do site; mantém mesmo plano pra não resetar o teste)
        if (rotulo) {
          try {
            const lista = await listarContasRaw(token);
            const conta = lista.find((l: any) => l.username === usuario);
            if (conta) {
              const body = new URLSearchParams();
              body.set("id", String(conta.id));
              body.set("username", usuario);
              body.set("password", senha);
              body.set("email", "");
              body.set("plano", "");
              body.set("plano_antigo", bouquet);
              body.set("plano_novo", bouquet);
              body.set("plano_opt_edit", "antigo");
              body.set("notas", rotulo);
              await apiFetch(token, `listas/${conta.id}/editar`, { method: "POST", body });
            }
          } catch { /* segue sem rótulo remoto se a edição falhar */ }
        }

        const expDate = new Date(Date.now() + horas * 60 * 60 * 1000);
        const expiracao = expDate.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
        const expiracaoHorario = expDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

        return { ok: true, usuario, senha, expiracao, expiracaoHorario };
      });
    },

    // Busca senha/telas/adulto/rótulo direto no painel — usado antes de migrar a conta pra
    // outro painel CLUB, quando o banco local não tem tudo (ex: senha nunca importada).
    async obterDetalhes(usuario: string): Promise<DetalhesConta | null> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) return null;
        const info = await apiFetch(token, `listas/${conta.id}/info`);
        if (!info?.data) return null;
        const d = info.data;
        return {
          senha: d.password ?? null,
          telas: Number(d.max_connections) || 1,
          comAdultos: /Canais Adultos:<\/b> Sim/.test(d.bouquet_name ?? ""),
          rotulo: d.reseller_notes ?? "",
        };
      });
    },

    async deletarConta(usuario: string): Promise<void> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) throw new Error(`CLUB: usuário "${usuario}" não encontrado.`);
        const result = await apiFetch(token, `listas/${conta.id}/deletar`, { method: "GET" });
        if (result?.result === false) throw new Error(result.msg ?? "CLUB: falha ao deletar conta.");
      });
    },

    // Cria conta paga (produção) com usuário/senha específicos — usado em migração entre painéis
    // CLUB (excluir do antigo + criar no novo mantendo credenciais). Endpoint listas/nova descoberto
    // via reverse engineering do payload real do formulário "Criar nova lista" (05/08/2026).
    async criarConta(
      usuario: string,
      senha: string,
      { meses = 1, telas = 1, comAdultos = false, rotulo = "" }: { meses?: number; telas?: number; comAdultos?: boolean; rotulo?: string } = {}
    ): Promise<ResultadoCriacao> {
      return withRelogin(async (token) => {
        const bouquets = comAdultos ? BOUQUET_COMPLETO_COM_ADULTO : BOUQUET_COMPLETO_SEM_ADULTO;

        const body = new URLSearchParams();
        body.set("username", usuario);
        body.set("password", senha);
        body.set("email", "");
        body.set("conexoes", String(telas));
        body.set("tempo", String(meses));
        body.set("plano", "");
        body.set("plano_novo", bouquets);
        body.set("plano_opt", "on");
        for (const par of BOUQUET_PARES_COMPLETO) body.append("plano_custom[]", par);

        const result = await apiFetch(token, "listas/nova", { method: "POST", body });
        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao criar conta no CLUB." };

        // ⚠️ Confirmado empiricamente 05/08/2026: a criação (listas/nova) NÃO respeita de forma
        // confiável o bouquet com adulto, mesmo enviando os IDs corretos em plano_novo — a conta
        // sai sempre sem conteúdo adulto. Só uma edição pós-criação (listas/{id}/editar, mesmo
        // endpoint testado e confirmado no fluxo manual) realmente aplica o bouquet certo. Por
        // isso SEMPRE roda a edição de confirmação abaixo (não só quando há rótulo).
        // ⚠️ Fix 05/08/2026 (interceptor de fetch/XHR, ver editarConta() acima): faltava o campo
        // plano_adulto=1 e plano_opt_edit precisa ser "on" (não "antigo") pra realmente aplicar —
        // antes disso essa edição de confirmação nunca ligava o adulto de verdade (falso sucesso).
        let venc: string | undefined;
        try {
          const lista = await listarContasRaw(token);
          const conta = lista.find((l: any) => l.username === usuario);
          if (conta) {
            const editBody = new URLSearchParams();
            editBody.set("id", String(conta.id));
            editBody.set("username", usuario);
            editBody.set("password", senha);
            editBody.set("email", "");
            editBody.set("plano", "");
            editBody.set("plano_antigo", bouquets);
            editBody.set("plano_novo", bouquets);
            editBody.set("plano_opt_edit", "on");
            editBody.set("plano_adulto", comAdultos ? "1" : "0");
            editBody.set("notas", rotulo || conta.reseller_notes || "");
            await apiFetch(token, `listas/${conta.id}/editar`, { method: "POST", body: editBody });

            // Relê para confirmar o vencimento final (a edição não altera o vencimento, só o bouquet)
            const listaPos = await listarContasRaw(token);
            const contaPos = listaPos.find((l: any) => l.username === usuario);
            if (contaPos?.exp_date) {
              venc = new Date(Number(contaPos.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
            }
          }
        } catch { /* segue sem vencimento/rótulo/bouquet confirmado se a busca pós-criação falhar */ }

        return { ok: true, vencimento: venc };
      });
    },
  };
}
