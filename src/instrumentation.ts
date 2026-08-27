// Ponto de entrada de jobs em background que devem rodar durante todo o ciclo de vida do
// servidor (Easypanel = instância única persistente, não serverless). register() é chamado uma
// vez pelo Next.js na inicialização do processo.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guarda em globalThis pra não duplicar o setInterval em recarregamentos do dev server
  // (hot reload não reexecuta módulos top-level do jeito que reexecutaria um redeploy real).
  const g = globalThis as unknown as { __clubKeepaliveStarted?: boolean };
  if (g.__clubKeepaliveStarted) return;
  g.__clubKeepaliveStarted = true;

  const { iniciarKeepaliveClub } = await import("@/lib/club-keepalive");
  iniciarKeepaliveClub();
}
