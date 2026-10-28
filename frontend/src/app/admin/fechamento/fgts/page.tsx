import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/Alert";
import { formatarCnpj } from "@/lib/formatters";
import { guiasEmAberto, type GuiaFgts } from "@/lib/fgts-infosimples";
import { periodoFgtsPadrao } from "@/lib/fgts-periodo";
import { FgtsLoteComSelecao, type LinhaFgts } from "./FgtsLoteComSelecao";

export const metadata = { title: "Central FGTS — Painel SOMA" };

type Consulta = {
  company_id: string;
  periodo: string;
  consultado_em: string;
  status: "sucesso" | "erro";
  erro: string | null;
  guias: GuiaFgts[];
};

function statusCertificado(validade: string | null): LinhaFgts["certificado"] {
  if (!validade) return "SEM";
  return new Date(validade).getTime() < Date.now() ? "VENCIDO" : "VALIDO";
}

export default async function CentralFgtsPage() {
  const supabase = await createClient();
  const [{ data: companies }, { data: consultas }, { data: certificados }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, codigo_cliente, cnpj")
      .eq("ativa", true)
      .not("cnpj", "is", null)
      .order("legal_name"),
    supabase.from("fgts_guias_consultas").select("company_id, periodo, consultado_em, status, erro, guias"),
    supabase.from("certificates").select("company_id, expires_at"),
  ]);
  const consultasPorEmpresa = new Map<string, Consulta[]>();
  for (const c of (consultas ?? []) as Consulta[]) {
    consultasPorEmpresa.set(c.company_id, [...(consultasPorEmpresa.get(c.company_id) ?? []), c]);
  }
  const validadePorEmpresa = new Map((certificados ?? []).map((c) => [c.company_id as string, c.expires_at as string]));

  const linhas: LinhaFgts[] = (companies ?? []).map((company) => {
    // Uma consulta por competência — a mais recente primeiro. A regra de
    // "em aberto" (guiasEmAberto) roda dentro de cada competência e é
    // recalculada aqui a partir das guias guardadas, então uma correção na
    // regra vale pras consultas já feitas sem precisar pagar de novo.
    const doEmpresa = (consultasPorEmpresa.get(company.id) ?? []).sort((a, b) => b.periodo.localeCompare(a.periodo));
    const abertas = doEmpresa.flatMap((c) =>
      c.status === "sucesso" ? guiasEmAberto(c.guias).map((g) => ({ ...g, periodo: c.periodo })) : [],
    );
    const validade = validadePorEmpresa.get(company.id) ?? null;
    return {
      id: company.id,
      nome: company.codigo_cliente
        ? `#${company.codigo_cliente} ${company.trade_name || company.legal_name}`
        : company.trade_name || company.legal_name,
      cnpj: formatarCnpj(company.cnpj) ?? company.cnpj!,
      certificado: statusCertificado(validade),
      certificadoValidade: validade,
      ultimaConsulta: doEmpresa.reduce<string | null>(
        (max, c) => (!max || c.consultado_em > max ? c.consultado_em : max),
        null,
      ),
      periodosConsultados: doEmpresa.map((c) => c.periodo),
      erros: doEmpresa.filter((c) => c.status === "erro").map((c) => ({ periodo: c.periodo, erro: c.erro ?? "erro" })),
      guiasEmAberto: abertas,
      guiasQuitadas: doEmpresa.flatMap((c) =>
        c.status === "sucesso"
          ? c.guias.filter((g) => !abertas.some((a) => a.periodo === c.periodo && a.numero === g.numero)).map((g) => ({ ...g, periodo: c.periodo }))
          : [],
      ),
      valorEmAberto: abertas.reduce((s, g) => s + (g.valor_total ?? 0), 0),
    };
  });

  // Em aberto primeiro, depois erros, depois o resto — é o que precisa de ação.
  const ordem = (l: LinhaFgts) => (l.guiasEmAberto.length > 0 ? 0 : l.erros.length > 0 ? 1 : 2);
  linhas.sort((a, b) => ordem(a) - ordem(b));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central FGTS</h1>
        <p className="text-sm text-foreground/60">
          Guias do FGTS Digital das empresas com CNPJ, consultadas via Infosimples com o certificado da
          SOMA como procuradora.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
        </p>
      </div>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa com CNPJ cadastrado.</Alert>
      ) : (
        <FgtsLoteComSelecao linhas={linhas} periodoPadrao={periodoFgtsPadrao()} />
      )}
    </div>
  );
}
