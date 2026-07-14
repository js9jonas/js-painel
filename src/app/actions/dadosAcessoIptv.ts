"use server";

import { pool } from "@/lib/db";
import { enviarDadosAcessoIptv } from "@/lib/dados-acesso-iptv";
import {
  montarMensagemUnitv,
  montarMensagemXciptv,
  montarMensagemXtream,
} from "@/lib/dados-acesso-iptv-formato";

export type FormatoEnvio = "xciptv" | "xtream" | "unitv";

export type ResultadoEnvioDados = {
  enviado: boolean;
  motivo?: string;
  telefone?: string;
  texto: string;
};

export async function enviarDadosAcesso(
  idConta: string,
  idCliente: string,
  formato: FormatoEnvio
): Promise<ResultadoEnvioDados | { erro: string }> {
  const { rows } = await pool.query(
    `SELECT c.usuario, c.senha, c.rotulo, ps.nome AS nome_painel, ps.host_stream
     FROM public.contas c
     JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
     WHERE c.id_conta = $1::bigint`,
    [idConta]
  );
  const conta = rows[0];
  if (!conta) return { erro: "Conta não encontrada." };

  const dados = {
    usuario: conta.usuario,
    senha: conta.senha,
    rotulo: conta.rotulo,
    nomePainel: conta.nome_painel,
    hostStream: conta.host_stream,
  };

  const texto =
    formato === "unitv" ? montarMensagemUnitv(dados) :
    formato === "xciptv" ? montarMensagemXciptv(dados) :
    montarMensagemXtream(dados);

  const resultado = await enviarDadosAcessoIptv(idCliente, texto);
  return { ...resultado, texto };
}
