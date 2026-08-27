import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { RevelarSenhaButton } from "@/components/RevelarSenhaButton";

export const metadata = { title: "Cofre de senhas — Legalização" };

export default async function LegalizacaoCofreSenhasPage(
  props: PageProps<"/legalizacao/empresas/[companyId]/cofre-senhas">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: senhas }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("senhas_cofre")
      .select("id, servico, usuario, observacoes")
      .eq("company_id", companyId)
      .order("servico", { ascending: true }),
  ]);

  if (!company) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/legalizacao/empresas/${companyId}`} className="text-xs text-brand underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Cofre de senhas — consulta. Cadastro e edição ficam no painel Admin.
        </p>
      </div>

      <Alert tone="warning">
        Credenciais reais do cliente. Toda revelação de senha fica registrada em log de auditoria.
      </Alert>

      {(!senhas || senhas.length === 0) ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma senha cadastrada ainda.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border">
            {senhas.map((senha) => (
              <div key={senha.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{senha.servico}</div>
                  <div className="text-xs text-foreground/50">
                    {[senha.usuario, senha.observacoes].filter(Boolean).join(" · ") || "Sem observações"}
                  </div>
                </div>
                <RevelarSenhaButton senhaId={senha.id} companyId={companyId} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
