"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { EditarProspectForm, EDITAR_PROSPECT_FORM_ID } from "./EditarProspectForm";
import { AnexoSection } from "./AnexoSection";
import { ProcessoLegalizacaoCard } from "./ProcessoLegalizacaoCard";
import { DadosAberturaSection } from "../DadosAberturaSection";
import type { StatusProcessoLegalizacao } from "@/lib/actions/comercial";

type Prospect = Parameters<typeof EditarProspectForm>[0]["prospect"];
type Anexo = { id: string; blob_url: string; nome_arquivo: string; created_at: string };

// tipoOnboarding fica aqui (não dentro de EditarProspectForm) porque decide
// se os cards "Processo de Legalização" e "Dados para o contrato social"
// aparecem ao lado — precisam reagir à mesma escolha em tempo real, antes
// mesmo de salvar.
export function ProspectDadosAnexos({
  prospect,
  anexos,
  podeEditar,
  statusProcesso,
  podeVerLegalizacao,
}: {
  prospect: Prospect;
  anexos: Anexo[];
  podeEditar: boolean;
  statusProcesso: StatusProcessoLegalizacao | null;
  podeVerLegalizacao: boolean;
}) {
  const [tipoOnboarding, setTipoOnboarding] = useState(prospect.tipo_onboarding ?? "");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Dados</h2>
        <EditarProspectForm
          prospect={prospect}
          podeEditar={podeEditar}
          tipoOnboarding={tipoOnboarding}
          onTipoOnboardingChange={setTipoOnboarding}
        />
      </Card>

      <div className="flex flex-col gap-6 self-start">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Anexos</h2>
          <AnexoSection prospectId={prospect.id} anexos={anexos} podeEditar={podeEditar} />
        </Card>

        {(tipoOnboarding === "ABERTURA_NOVO_CNPJ" || statusProcesso) && (
          <Card className="p-6">
            <ProcessoLegalizacaoCard
              prospectId={prospect.id}
              status={statusProcesso}
              podeEditar={podeEditar}
              podeVerLegalizacao={podeVerLegalizacao}
            />
          </Card>
        )}

        {tipoOnboarding === "ABERTURA_NOVO_CNPJ" && (
          <Card className="p-6">
            <DadosAberturaSection
              formId={EDITAR_PROSPECT_FORM_ID}
              podeEditar={podeEditar}
              defaults={{
                cartorioJucerja: prospect.abertura_cartorio_jucerja,
                capitalSocial: prospect.abertura_capital_social,
                divisaoCapital: prospect.abertura_divisao_capital,
                administrador: prospect.abertura_administrador,
                cotaTipo: prospect.abertura_cota_tipo,
                cnaes: prospect.abertura_cnaes,
                opcoesNome: prospect.abertura_opcoes_nome,
              }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
