import type { ContaPainelVinculada } from "@/lib/clientes";

function statusBadge(conta: ContaPainelVinculada) {
  const label = conta.vencimento_real_painel
    ? conta.vencimento_real_painel.split("T")[0].split("-").slice(1).reverse().join("/")
    : conta.status_conta;
  const cls =
    conta.status_conta === "ok"
      ? "bg-emerald-100 text-emerald-700"
      : conta.status_conta === "vencida"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-600";
  return (
    <span className={`rounded-full px-1.5 py-0.5 ${cls}`}>{label}</span>
  );
}

type Props = {
  contas: ContaPainelVinculada[];
  /** Botão extra ao final de cada balão (ex.: DesvincularContaButton) */
  contaAction?: (conta: ContaPainelVinculada) => React.ReactNode;
  /** Conteúdo extra no balão "sem vínculo" */
  emptyAction?: React.ReactNode;
  /** Mostra data de vencimento no balão "sem vínculo" */
  vencContas?: string | null;
};

export default function ContasCards({ contas, contaAction, emptyAction, vencContas }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {contas.length > 0
        ? contas.map((c) => (
            <div
              key={c.id_conta}
              className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-1.5 text-xs"
            >
              <span className="font-medium text-zinc-500">{c.nome_painel}</span>
              <span className="text-zinc-300">·</span>
              <span className="font-mono font-semibold text-zinc-800 select-all">{c.usuario}</span>
              {c.senha && (
                <>
                  <span className="text-zinc-300">/</span>
                  <span className="font-mono text-zinc-600 select-all">{c.senha}</span>
                </>
              )}
              {statusBadge(c)}
              {contaAction?.(c)}
            </div>
          ))
        : (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-400">
            <span className="font-medium">Conta sem vínculo</span>
            {vencContas && (
              <>
                <span className="text-zinc-300">·</span>
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-zinc-500">
                  {vencContas.split("T")[0].split("-").reverse().join("/")}
                </span>
              </>
            )}
            {emptyAction}
          </div>
        )}
    </div>
  );
}
