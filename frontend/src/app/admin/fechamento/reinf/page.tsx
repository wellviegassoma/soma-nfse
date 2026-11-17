import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, temPermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarCentralReinf, totaisReinf } from "@/lib/reinf";
import { prazoReinf } from "@/lib/reinf-core";
import { CentralReinf } from "./CentralReinf";

export const metadata = { title: "Central Reinf — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Notas RECEBIDAS com retenção (a empresa é tomadora) → o que precisa ir
// para a EFD-Reinf de cada empresa no mês. Valores lidos do XML da nota
// (lib/reinf-core.ts); natureza e mês do pagamento ajustáveis por nota.
export default async function CentralReinfPage(props: PageProps<"/admin/fechamento/reinf">) {
  await requireSomaStaff();
  const searchParams = await props.searchParams;
  const competenciaParam = typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesAnteriorBrasilia();

  const supabase = await createClient();
  const [{ empresas, migracaoPendente }, podeMarcar] = await Promise.all([
    carregarCentralReinf(supabase, competencia),
    temPermissao("fechamento.executar"),
  ]);
  const totais = totaisReinf(empresas);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central Reinf</h1>
        <p className="text-sm text-foreground/60">
          Notas recebidas com retenção e o registro da EFD-Reinf que cada uma gera.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="w-[160px]">
              <Field label="Competência" htmlFor="competencia">
                <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
              </Field>
            </div>
            <Button type="submit">Aplicar</Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-foreground/55">
              Prazo da Reinf deste mês: <span className="font-medium text-foreground">{prazoReinf(competencia)}</span>{" "}
              (dia 15 do mês seguinte; confira feriados)
            </p>
            <a href={`/admin/fechamento/reinf/planilha?competencia=${competencia}`}>
              <Button type="button" variant="secondary">
                Exportar Excel
              </Button>
            </a>
            <a href={`/admin/fechamento/reinf/relatorio?competencia=${competencia}`} target="_blank" rel="noreferrer">
              <Button type="button">Gerar relatório em PDF</Button>
            </a>
          </div>
        </div>
      </Card>

      {migracaoPendente ? (
        <Alert tone="warning">
          Falta aplicar a migration <code>20261117170000_fase_bn_central_reinf.sql</code> no Supabase.
        </Alert>
      ) : (
        <CentralReinf
          key={competencia}
          competencia={competencia}
          empresas={empresas}
          totais={totais}
          podeMarcar={podeMarcar}
        />
      )}
    </div>
  );
}
