import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { formatarDataHora } from "@/lib/formatters";
import { buscarUltimaExecucao } from "@/lib/rotina-fechamento/registrar";
import { buscarItensExecucao } from "@/lib/rotina-fechamento/itens";
import { BuscarTodasButton } from "../../fechamento/BuscarTodasButton";
import { RodarEtapaButton } from "./RodarEtapaButton";
import { RodarTudoButton } from "./RodarTudoButton";
import { EmitirPetropolisSelecao } from "./EmitirPetropolisSelecao";
import { VerElegiveisFechamentoButton } from "./VerElegiveisFechamentoButton";

export const metadata = { title: "Rotina de Fechamento — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

function UltimaRodada({
  execucao,
}: {
  execucao: Awaited<ReturnType<typeof buscarUltimaExecucao>>;
}) {
  if (!execucao) return <p className="text-xs text-foreground/50">Nunca rodada nessa competência.</p>;
  return (
    <p className="text-xs text-foreground/50">
      Última rodada: {formatarDataHora(execucao.finalizado_em ?? execucao.iniciado_em)} —{" "}
      {execucao.sucessos}/{execucao.total_empresas} ok
      {execucao.falhas > 0 ? `, ${execucao.falhas} com falha/divergência` : ""}.
    </p>
  );
}

export default async function RotinaFechamentoPage(
  props: PageProps<"/admin/automacao/rotina-fechamento">,
) {
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesCorrenteBrasilia();

  const supabase = await createClient();

  const [{ data: companies }, { data: certs }, execIssRj, execConferirPetropolis, execEmitirPetropolis] =
    await Promise.all([
      supabase.from("companies").select("id, legal_name, trade_name"),
      supabase.from("certificates").select("company_id"),
      buscarUltimaExecucao(supabase, "iss_rj", competencia),
      buscarUltimaExecucao(supabase, "iss_petropolis_conferir", competencia),
      buscarUltimaExecucao(supabase, "iss_petropolis_emitir", competencia),
    ]);

  const idsComCertificado = new Set((certs ?? []).map((c) => c.company_id));
  const empresasComCertificado = (companies ?? [])
    .filter((c) => idsComCertificado.has(c.id))
    .map((c) => ({ id: c.id, nome: c.trade_name || c.legal_name }));

  const itensConferenciaPetropolis = execConferirPetropolis
    ? await buscarItensExecucao(supabase, execConferirPetropolis.id)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Rotina de Fechamento</h1>
        <p className="text-sm text-foreground/60">
          As 6 etapas do fechamento mensal, em ordem — cada uma com botão próprio, ou todas de
          uma vez.{" "}
          <Link href="/admin/automacao" className="underline">
            Voltar pra Automação
          </Link>
        </p>
      </div>

      <Card className="p-6">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Field label="Competência" htmlFor="competencia">
              <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
            </Field>
          </div>
          <Button type="submit">Aplicar</Button>
        </form>
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">Rodar tudo</div>
        <p className="mb-3 text-xs text-foreground/50">
          Etapas 2 a 4 em sequência. Etapa 1 (buscar notas) e Etapa 6 (ver quem já pode fechar)
          ficam de botão próprio abaixo — e a Etapa 5 (emitir Petrópolis) nunca roda sozinha, pede
          confirmação separada.
        </p>
        <RodarTudoButton competencia={competencia} />
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">Etapa 1 — Buscar as notas</div>
        <p className="mb-3 text-xs text-foreground/50">
          Busca as notas fiscais de todas as empresas com certificado no Sefin Nacional.
        </p>
        <BuscarTodasButton competencia={competencia} empresas={empresasComCertificado} />
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">
          Etapa 2/3 — ISS Rio de Janeiro (emitir + conferir)
        </div>
        <p className="mb-3 text-xs text-foreground/50">
          Busca (emitindo se ainda não existir — ação real no Nota Carioca) a guia de ISS de cada
          Lucro Presumido do Rio, e já confere contra o faturamento do SOMA quando o regime não é
          fixo por profissional.
        </p>
        <UltimaRodada execucao={execIssRj} />
        <div className="mt-3">
          <RodarEtapaButton
            endpoint={`/api/rotina-fechamento/iss-rj?competencia=${competencia}`}
            label="Rodar Etapa 2/3"
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">Etapa 4 — Conferir ISS Petrópolis</div>
        <p className="mb-3 text-xs text-foreground/50">
          Só leitura — compara o que já está lançado na Prefeitura (consolidado ou não) com o
          faturamento do SOMA, sem criar nada.
        </p>
        <UltimaRodada execucao={execConferirPetropolis} />
        <div className="mt-3">
          <RodarEtapaButton
            endpoint={`/api/rotina-fechamento/iss-petropolis-conferir?competencia=${competencia}`}
            label="Rodar Etapa 4"
          />
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">Etapa 5 — Emitir guia ISS Petrópolis</div>
        <p className="mb-3 text-xs text-foreground/50">
          Ação real: fecha o movimento econômico do mês na Prefeitura. Escolha quem emitir a
          partir da última conferência (Etapa 4).
        </p>
        <UltimaRodada execucao={execEmitirPetropolis} />
        <div className="mt-3">
          <EmitirPetropolisSelecao competencia={competencia} itensConferencia={itensConferenciaPetropolis} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-1 text-sm font-semibold text-foreground">
          Etapa 6 — Quem já pode fechar (Anexo III sem Fator R)
        </div>
        <p className="mb-3 text-xs text-foreground/50">
          Só leitura aqui — pra fechar de verdade, use a Central Simples Nacional.
        </p>
        <VerElegiveisFechamentoButton competencia={competencia} />
      </Card>
    </div>
  );
}
