"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PainelServidorRow, PainelAppRow, PainelAppSyncRow, ServidorVinculoRow } from "@/lib/paineis";
import PainelServidorCard from "./PainelServidorCard";
import PainelAppCard from "./PainelAppCard";
import PainelAppSyncCard from "./PainelAppSyncCard";
import PainelServidorModal from "./PainelServidorModal";
import PainelAppModal from "./PainelAppModal";
import PainelAppSyncModal from "./PainelAppSyncModal";

type Tab = "contas" | "apps";

type Props = {
  servidores: PainelServidorRow[];
  apps: PainelAppRow[];
  appSync: PainelAppSyncRow[];
  servidoresVinculo: ServidorVinculoRow[];
};

export default function ConexoesClient({ servidores, apps, appSync, servidoresVinculo }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("contas");
  const [modalServidor, setModalServidor] = useState<PainelServidorRow | null | "novo">(null);
  const [modalAppSync, setModalAppSync] = useState<PainelAppSyncRow | null>(null);
  const [modalApp, setModalApp] = useState<PainelAppRow | null | "novo">(null);

  function onSalvo() {
    setModalServidor(null);
    setModalAppSync(null);
    setModalApp(null);
    router.refresh();
  }

  return (
    <>
      <div className="space-y-4">
        {/* Tabs + botão Novo */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 border-b border-zinc-200 flex-1">
            <TabButton active={tab === "contas"} onClick={() => setTab("contas")}>
              Painéis de Contas
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                {servidores.length}
              </span>
            </TabButton>
            <TabButton active={tab === "apps"} onClick={() => setTab("apps")}>
              Painéis de Aplicativo
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                {appSync.length + apps.length}
              </span>
            </TabButton>
          </div>
          <div className="ml-4 pb-px">
            {tab === "contas" ? (
              <button
                onClick={() => setModalServidor("novo")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                + Novo painel
              </button>
            ) : (
              <button
                onClick={() => setModalApp("novo")}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors whitespace-nowrap"
              >
                + Novo app
              </button>
            )}
          </div>
        </div>

        {/* Painéis de Contas */}
        {tab === "contas" && (
          <div className="space-y-4">
            {servidores.length === 0 ? (
              <EmptyState mensagem="Nenhum painel de contas cadastrado." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {servidores.map((s) => (
                  <PainelServidorCard
                    key={s.id}
                    painel={s}
                    onEditar={() => setModalServidor(s)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Painéis de Aplicativo */}
        {tab === "apps" && (
          <div className="space-y-6">
            {/* Cards com API sync (FunPlays, LazerPlay) */}
            {appSync.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Gerenciados via API
                </p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {appSync.map((a) => (
                    <PainelAppSyncCard
                      key={a.id}
                      painel={a}
                      onEditar={() => setModalAppSync(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Cards informativos (painel_apps) */}
            {apps.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Informativo
                </p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {apps.map((a) => (
                    <PainelAppCard
                      key={a.id}
                      app={a}
                      onEditar={() => setModalApp(a)}
                    />
                  ))}
                </div>
              </div>
            )}

            {appSync.length === 0 && apps.length === 0 && (
              <EmptyState mensagem="Nenhum painel de aplicativo cadastrado." />
            )}
          </div>
        )}
      </div>

      {/* Modais */}
      {modalServidor !== null && (
        <PainelServidorModal
          painel={modalServidor === "novo" ? null : modalServidor}
          servidores={servidoresVinculo}
          onClose={() => setModalServidor(null)}
          onSalvo={onSalvo}
        />
      )}
      {modalAppSync !== null && (
        <PainelAppSyncModal
          painel={modalAppSync}
          onClose={() => setModalAppSync(null)}
          onSalvo={onSalvo}
        />
      )}
      {modalApp !== null && (
        <PainelAppModal
          app={modalApp === "novo" ? null : modalApp}
          onClose={() => setModalApp(null)}
          onSalvo={onSalvo}
        />
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-700"
          : "border-transparent text-zinc-500 hover:text-zinc-800 hover:border-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center text-zinc-400 text-sm">
      {mensagem}
    </div>
  );
}
