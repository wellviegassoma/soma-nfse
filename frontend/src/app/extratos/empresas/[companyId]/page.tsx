import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { temPermissao } from "@/lib/auth";
import { formatarCnpj } from "@/lib/formatters";
import { mesAnteriorBrasilia, ultimasCompetencias } from "@/lib/competencia";
import type { StatusMes } from "@/lib/extratos-status";
import type { Aviso, Leitura } from "@/lib/extratos-leitura-core";
import { DropExtratos } from "../../DropExtratos";
import { GradeExtratos, type ArquivoGrade, type ContaGrade } from "./GradeExtratos";

export const metadata = { title: "Extratos — Empresa" };
export const maxDuration = 120; // leitura dos extratos pela IA no upload

const MESES = 6;

export default async function ExtratosEmpresaPage(props: PageProps<"/extratos/empresas/[companyId]">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const competencia =
    typeof sp.competencia === "string" && /^\d{4}-\d{2}$/.test(sp.competencia) ? sp.competencia : mesAnteriorBrasilia();
  const meses = ultimasCompetencias(competencia, MESES).reverse();

  const db = await createClient();
  const [{ data: company }, { data: contas }, podeEditar] = await Promise.all([
    db
      .from("companies")
      .select("id, legal_name, trade_name, codigo_cliente, cnpj, cpf, person_type, responsavel_contabil_id")
      .eq("id", companyId)
      .single(),
    db
      .from("extrato_contas_bancarias")
      .select("id, banco, codigo_banco, agencia, conta, data_inicio_controle, data_fim_controle")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("created_at"),
    temPermissao("extratos.editar"),
  ]);
  if (!company) notFound();

  const contaIds = (contas ?? []).map((c) => c.id as string);
  const [{ data: mensais }, { data: arquivos }, cobrancas, responsavel] = await Promise.all([
    contaIds.length
      ? db.from("extratos_mensais").select("id, conta_id, competencia, status, nome_arquivo, blob_pathname").in("conta_id", contaIds).in("competencia", meses)
      : Promise.resolve({ data: [] as never[] }),
    db
      .from("extrato_arquivos")
      .select("id, conta_id, competencia, nome_arquivo, situacao, origem, leitura, avisos, created_at, enviado_por")
      .eq("company_id", companyId)
      .neq("situacao", "DESCARTADO")
      .order("created_at", { ascending: false })
      .limit(60),
    db
      .from("extrato_cobrancas")
      .select("id, created_at, grupo_nome, competencia")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(8)
      .then((r) => r.data ?? []),
    company.responsavel_contabil_id
      ? createAdminClient().from("profiles").select("full_name, email").eq("id", company.responsavel_contabil_id).single().then((r) => r.data)
      : Promise.resolve(null),
  ]);

  const contasGrade: ContaGrade[] = (contas ?? []).map((c) => ({
    id: c.id as string,
    banco: c.banco as string,
    codigoBanco: (c.codigo_banco as string | null) ?? null,
    agencia: c.agencia as string,
    conta: c.conta as string,
    inicio: (c.data_inicio_controle as string | null)?.slice(0, 7) ?? null,
    fim: (c.data_fim_controle as string | null)?.slice(0, 7) ?? null,
  }));
  const status: Record<string, { status: StatusMes; legadoId: string | null; legadoNome: string | null }> = {};
  for (const m of mensais ?? []) {
    status[`${m.conta_id}|${m.competencia}`] = {
      status: m.status as StatusMes,
      legadoId: m.blob_pathname ? (m.id as string) : null,
      legadoNome: (m.nome_arquivo as string | null) ?? null,
    };
  }
  const listaArquivos: ArquivoGrade[] = (arquivos ?? []).map((a) => ({
    id: a.id as string,
    contaId: (a.conta_id as string | null) ?? null,
    competencia: (a.competencia as string | null) ?? null,
    nome: a.nome_arquivo as string,
    situacao: a.situacao as string,
    origem: a.origem as string,
    leitura: (a.leitura as Leitura | null) ?? null,
    avisos: (a.avisos as Aviso[] | null) ?? [],
    criadoEm: a.created_at as string,
  }));

  const nome = (company.trade_name || company.legal_name) as string;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/extratos?competencia=${competencia}`} className="text-xs text-brand underline">
            ← Painel
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {company.codigo_cliente && <span className="mr-1.5 text-foreground/40">#{company.codigo_cliente}</span>}
            {nome}
          </h1>
          <p className="text-sm text-foreground/60">
            {company.person_type === "PF" ? company.cpf : formatarCnpj(company.cnpj as string | null)}
            {" · "}Contabilidade: {responsavel ? (responsavel.full_name || responsavel.email) : "sem responsável"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/extratos/empresas/${companyId}/gerenciar`} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted">
            Contas bancárias
          </Link>
          <Link href={`/extratos/cobranca?competencia=${competencia}&responsavel=todos`} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-muted">
            Cobrar pelo WhatsApp
          </Link>
        </div>
      </div>

      {podeEditar && (
        <DropExtratos
          companyId={companyId}
          titulo="Solte aqui os extratos desta empresa"
          subtitulo="Vários de uma vez — a IA descobre de qual conta e mês é cada um, confere o período e os saldos"
        />
      )}

      <GradeExtratos
        companyId={companyId}
        contas={contasGrade}
        meses={meses}
        status={status}
        arquivos={listaArquivos}
        podeEditar={podeEditar}
      />

      {cobrancas.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">Cobranças enviadas</div>
          <ul className="divide-y divide-border text-sm">
            {cobrancas.map((c) => (
              <li key={c.id as string} className="flex justify-between gap-3 px-5 py-2">
                <span className="text-foreground/80">{(c.grupo_nome as string | null) ?? "WhatsApp"}</span>
                <span className="text-foreground/50">
                  {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(c.created_at as string))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
