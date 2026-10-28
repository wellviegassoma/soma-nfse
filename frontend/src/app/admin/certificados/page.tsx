import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import {
  diasAteVencer,
  etapaAtual,
  situacaoCertificado,
  type Etapa,
} from "@/lib/certificado-acompanhamento";
import { CertificadosAcompanhamento, type LinhaCertificado } from "./CertificadosAcompanhamento";

export const metadata = { title: "Certificados — Painel SOMA" };

type EmpresaComCertificado = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  // company_id em `certificates` é UNIQUE (1 certificado por empresa) — o
  // PostgREST detecta a relação 1:1 e embute como objeto único, não array.
  certificates: { expires_at: string } | null;
};

type Acompanhamento = {
  company_id: string;
  status: Etapa;
  referente_vencimento: string | null;
  observacao: string | null;
  proximo_contato: string | null;
  atualizado_em: string;
  autor: { full_name: string | null } | null;
};

// Date.now() fora do corpo do componente (react-hooks/purity).
function agoraMs() {
  return Date.now();
}

export default async function AdminCertificadosPage() {
  await requirePermissao("certificados.ver");

  const supabase = await createClient();
  const [{ data }, { data: acompanhamentos }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, codigo_cliente, certificates(expires_at)")
      .eq("ativa", true)
      .order("legal_name", { ascending: true }),
    supabase
      .from("certificado_acompanhamentos")
      .select(
        "company_id, status, referente_vencimento, observacao, proximo_contato, atualizado_em, autor:profiles!certificado_acompanhamentos_atualizado_por_fkey(full_name)",
      ),
  ]);

  const empresas = (data ?? []) as unknown as EmpresaComCertificado[];
  const acompPorEmpresa = new Map(
    ((acompanhamentos ?? []) as unknown as Acompanhamento[]).map((a) => [a.company_id, a]),
  );
  const agora = agoraMs();
  const hoje = new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  // Entram na lista: sem certificado, vencidos e vencendo (sempre), e os
  // válidos que tiveram tratativa registrada (aparecem como Resolvido).
  const linhas: LinhaCertificado[] = [];
  let totalValidos = 0;
  for (const e of empresas) {
    const expiresAt = e.certificates?.expires_at ?? null;
    const situacao = situacaoCertificado(expiresAt, agora);
    if (situacao === "VALIDO") totalValidos++;
    const acomp = acompPorEmpresa.get(e.id) ?? null;
    const atual = etapaAtual(acomp, expiresAt, agora);
    if (!atual) continue;
    linhas.push({
      id: e.id,
      nome: `${e.codigo_cliente ? `#${e.codigo_cliente} ` : ""}${e.trade_name || e.legal_name}`,
      razaoSocial: e.legal_name,
      situacao,
      expiresAt,
      dias: expiresAt ? diasAteVencer(expiresAt, agora) : null,
      etapa: atual.etapa,
      doCicloAtual: atual.doCicloAtual,
      observacao: acomp?.observacao ?? null,
      proximoContato: acomp?.proximo_contato ?? null,
      atualizadoEm: acomp?.atualizado_em ?? null,
      atualizadoPor: acomp?.autor?.full_name ?? null,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Certificados</h1>
        <p className="text-sm text-foreground/60">
          Certificado digital A1 por empresa — quem está sem, vencido ou vencendo, e em que pé está a tratativa
          com cada cliente.
        </p>
      </div>

      <CertificadosAcompanhamento
        linhas={linhas}
        hoje={hoje}
        totalEmpresas={empresas.length}
        totalValidos={totalValidos}
      />
    </div>
  );
}
