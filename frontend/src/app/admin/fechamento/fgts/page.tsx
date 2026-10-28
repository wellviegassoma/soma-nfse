import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/Alert";
import { formatarCnpj } from "@/lib/formatters";
import { guiasEmAberto, type GuiaFgts } from "@/lib/fgts-infosimples";
import { FgtsLoteComSelecao, type LinhaFgts } from "./FgtsLoteComSelecao";

export const metadata = { title: "Central FGTS — Painel SOMA" };

type Consulta = {
  company_id: string;
  consultado_em: string;
  status: "sucesso" | "erro";
  erro: string | null;
  guias: GuiaFgts[];
  qtd_em_aberto: number;
  valor_em_aberto: number;
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
    supabase
      .from("fgts_guias_consultas")
      .select("company_id, consultado_em, status, erro, guias, qtd_em_aberto, valor_em_aberto"),
    supabase.from("certificates").select("company_id, expires_at"),
  ]);
  const consultaPorEmpresa = new Map(((consultas ?? []) as Consulta[]).map((c) => [c.company_id, c]));
  const validadePorEmpresa = new Map((certificados ?? []).map((c) => [c.company_id as string, c.expires_at as string]));

  const linhas: LinhaFgts[] = (companies ?? []).map((company) => {
    const consulta = consultaPorEmpresa.get(company.id) ?? null;
    const validade = validadePorEmpresa.get(company.id) ?? null;
    // Recalcula a partir das guias guardadas em vez de usar
    // qtd_em_aberto/valor_em_aberto gravados na consulta — assim uma
    // correção na regra (ver guiasEmAberto) vale pras consultas já feitas
    // sem precisar pagar de novo.
    const abertas = consulta ? guiasEmAberto(consulta.guias) : [];
    return {
      id: company.id,
      nome: company.codigo_cliente
        ? `#${company.codigo_cliente} ${company.trade_name || company.legal_name}`
        : company.trade_name || company.legal_name,
      cnpj: formatarCnpj(company.cnpj) ?? company.cnpj!,
      certificado: statusCertificado(validade),
      certificadoValidade: validade,
      consulta: consulta && {
        consultadoEm: consulta.consultado_em,
        status: consulta.status,
        erro: consulta.erro,
        qtdEmAberto: abertas.length,
        valorEmAberto: abertas.reduce((s, g) => s + (g.valor_total ?? 0), 0),
        guiasEmAberto: abertas,
        guiasQuitadas: consulta.guias.filter((g) => !abertas.includes(g)),
      },
    };
  });

  // Em aberto primeiro, depois erros, depois o resto — é o que precisa de ação.
  const ordem = (l: LinhaFgts) =>
    l.consulta?.status === "sucesso" && l.consulta.qtdEmAberto > 0 ? 0 : l.consulta?.status === "erro" ? 1 : 2;
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
        <FgtsLoteComSelecao linhas={linhas} />
      )}
    </div>
  );
}
