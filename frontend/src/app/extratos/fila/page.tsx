import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import type { Aviso, Leitura } from "@/lib/extratos-leitura-core";
import { FilaConfirmacao, type ItemFila } from "./FilaConfirmacao";

export const metadata = { title: "Extratos — Fila de confirmação" };
export const maxDuration = 120;

export default async function FilaPage() {
  await requirePermissao("extratos.editar");
  const db = await createClient();
  const [{ data: arquivos }, empresas, contas] = await Promise.all([
    db
      .from("extrato_arquivos")
      .select("id, company_id, conta_id, competencia, nome_arquivo, situacao, leitura, avisos, created_at")
      .in("situacao", ["CONFIRMAR", "ERRO", "PROCESSANDO"])
      .order("created_at", { ascending: false })
      .limit(200),
    buscarTudoPaginado<{ id: string; legal_name: string; trade_name: string | null; codigo_cliente: string | null }>((f, t) =>
      db.from("companies").select("id, legal_name, trade_name, codigo_cliente").eq("ativa", true).order("legal_name").range(f, t),
    ),
    buscarTudoPaginado<{ id: string; company_id: string; banco: string; agencia: string; conta: string }>((f, t) =>
      db.from("extrato_contas_bancarias").select("id, company_id, banco, agencia, conta").eq("ativo", true).range(f, t),
    ),
  ]);

  const itens: ItemFila[] = (arquivos ?? []).map((a) => ({
    id: a.id as string,
    companyId: (a.company_id as string | null) ?? null,
    contaId: (a.conta_id as string | null) ?? null,
    competencia: (a.competencia as string | null) ?? null,
    nome: a.nome_arquivo as string,
    situacao: a.situacao as string,
    leitura: (a.leitura as Leitura | null) ?? null,
    avisos: (a.avisos as Aviso[] | null) ?? [],
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/extratos" className="text-xs text-brand underline">
          ← Painel
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Fila de confirmação</h1>
        <p className="text-sm text-foreground/60">
          Arquivos que a IA não conseguiu encaixar sozinha numa conta e mês. Confira a leitura, escolha onde entra e confirme.
        </p>
      </div>
      <FilaConfirmacao
        itens={itens}
        empresas={empresas.map((e) => ({ id: e.id, nome: `${e.codigo_cliente ? `#${e.codigo_cliente} ` : ""}${e.trade_name || e.legal_name}` }))}
        contas={contas.map((c) => ({ id: c.id, companyId: c.company_id, rotulo: `${c.banco} · ag ${c.agencia} · ${c.conta}` }))}
        competenciaPadrao={mesAnteriorBrasilia()}
      />
    </div>
  );
}
