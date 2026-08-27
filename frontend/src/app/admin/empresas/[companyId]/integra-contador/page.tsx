import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Integra Contador — Painel SOMA" };

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

export default async function AdminCompanyIntegraContadorPage(
  props: PageProps<"/admin/empresas/[companyId]/integra-contador">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();

  const [{ data: ultimaSitfis }, { data: ultimaCnd }] = company?.cnpj
    ? await Promise.all([
        supabase
          .from("integra_contador_cache")
          .select("resposta, fetched_at")
          .eq("id_sistema", "SITFIS")
          .eq("id_servico", "RELATORIOSITFIS92")
          .eq("contribuinte_cnpj", company.cnpj)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("integra_contador_cache")
          .select("resposta, fetched_at")
          .eq("id_sistema", "CONSULTACND")
          .eq("id_servico", "CERTIDAO")
          .eq("contribuinte_cnpj", company.cnpj)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const sitfisTemPdf = Boolean(
    ultimaSitfis?.resposta?.dados && JSON.parse(ultimaSitfis.resposta.dados)?.pdf,
  );
  const cndCertidao = ultimaCnd?.resposta?.Certidao;
  const cndTemPdf = Boolean(cndCertidao?.DocumentoPdf);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Situação fiscal</h2>
        <p className="mb-4 text-sm text-foreground/50">
          Emite o relatório de Situação Fiscal do contribuinte direto na Receita Federal
          (Integra Contador / Serpro). Consultar de novo no mesmo dia não gasta chamada nova —
          vem do cache automaticamente.
        </p>

        {!company?.cnpj ? (
          <Alert tone="warning">
            Essa empresa não tem CNPJ cadastrado — essa consulta só funciona pra CNPJ.
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {ultimaSitfis ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm">
                <span className="text-foreground/70">
                  Última consulta: {formatarDataHora(ultimaSitfis.fetched_at)}
                </span>
                {sitfisTemPdf && (
                  <a
                    href={`/admin/empresas/${companyId}/integra-contador/situacao-fiscal/historico`}
                    target="_blank"
                    className="font-medium text-brand hover:underline"
                  >
                    Ver último relatório (sem custo)
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground/50">Ainda não foi consultada pra essa empresa.</p>
            )}
            <a
              href={`/admin/empresas/${companyId}/integra-contador/situacao-fiscal`}
              target="_blank"
              className="self-start"
            >
              <Button variant={ultimaSitfis ? "secondary" : "primary"}>
                {ultimaSitfis ? "Consultar de novo" : "Consultar situação fiscal"}
              </Button>
            </a>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Certidão Negativa de Débitos</h2>
        <p className="mb-4 text-sm text-foreground/50">
          Emite a CND (ou Positiva com efeitos de negativa) oficial — documento com código de
          controle e validade de 180 dias, via API Consulta CND (produto separado do Integra
          Contador). Emitir de novo no mesmo dia não gasta chamada nova.
        </p>

        {!company?.cnpj ? (
          <Alert tone="warning">
            Essa empresa não tem CNPJ cadastrado — essa consulta só funciona pra CNPJ.
          </Alert>
        ) : (
          <div className="flex flex-col gap-3">
            {ultimaCnd ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-muted p-3 text-sm">
                <span className="text-foreground/70">
                  Última emissão: {formatarDataHora(ultimaCnd.fetched_at)}
                </span>
                {cndCertidao?.DataValidade && (
                  <span className="text-foreground/70">
                    Válida até {new Date(cndCertidao.DataValidade).toLocaleDateString("pt-BR")}
                  </span>
                )}
                {!cndTemPdf && (
                  <span className="text-foreground/50">
                    {ultimaCnd.resposta?.Mensagem ?? "Certidão não foi emitida na última tentativa."}
                  </span>
                )}
                {cndTemPdf && (
                  <a
                    href={`/admin/empresas/${companyId}/integra-contador/cnd/historico`}
                    target="_blank"
                    className="font-medium text-brand hover:underline"
                  >
                    Ver última CND (sem custo)
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-foreground/50">Ainda não foi emitida pra essa empresa.</p>
            )}
            <a
              href={`/admin/empresas/${companyId}/integra-contador/cnd`}
              target="_blank"
              className="self-start"
            >
              <Button variant={ultimaCnd ? "secondary" : "primary"}>
                {ultimaCnd ? "Emitir de novo" : "Emitir CND"}
              </Button>
            </a>
          </div>
        )}
      </Card>
    </div>
  );
}
