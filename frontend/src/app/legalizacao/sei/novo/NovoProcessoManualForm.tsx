"use client";

import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SeletorEmpresa } from "@/components/SeletorEmpresa";
import { criarProcessoManualSei } from "@/lib/actions/sei";
import { SITUACAO_LABELS, type SeiSituacao } from "@/lib/sei-labels";

type Empresa = { id: string; legal_name: string; trade_name: string | null; cnpj: string | null; codigo_cliente: string | null };

const TIPOS = [
  "LICENÇA SANITÁRIA / INICIAL",
  "LICENÇA SANITÁRIA / RENOVAÇÃO",
  "LICENÇA SANITÁRIA / ALTERAÇÃO",
  "ALVARÁ / INSCRIÇÃO",
  "ALVARÁ / PARALISAÇÃO DE ATIVIDADES",
];

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export function NovoProcessoManualForm({ empresas, preSelecionada }: { empresas: Empresa[]; preSelecionada: Empresa | null }) {
  const [estado, acao, pendente] = useActionState(criarProcessoManualSei, undefined);
  const [origem, setOrigem] = useState<"SEI" | "FISICO">("SEI");
  const [tipo, setTipo] = useState(TIPOS[0]);

  return (
    <Card className="p-5">
      <form action={acao} className="flex flex-col gap-4">
        <Campo rotulo="Cliente (só clientes ativos de Petrópolis)">
          <SeletorEmpresa name="companyId" empresas={empresas} defaultValue={preSelecionada} required />
        </Campo>

        <Campo rotulo="Origem">
          <div className="flex flex-col gap-2 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" name="origem" value="SEI" checked={origem === "SEI"} onChange={() => setOrigem("SEI")} className="mt-1" />
              <span>
                <strong>SEI sem acesso da SOMA</strong> — entrada feita pelo cliente ou outro escritório. Se a SOMA ganhar
                acesso depois, a sincronização passa a atualizar este processo sozinha.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="origem" value="FISICO" checked={origem === "FISICO"} onChange={() => setOrigem("FISICO")} className="mt-1" />
              <span>
                <strong>Protocolo físico / fora do SEI</strong> — entrada no balcão ou em outro sistema. Fica sempre manual.
              </span>
            </label>
          </div>
        </Campo>

        <Campo rotulo={origem === "SEI" ? "Número do processo no SEI" : "Número do protocolo"}>
          <Input name="numero" required placeholder={origem === "SEI" ? "PMP.000123/2026" : "Ex.: 12345/2026"} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo">
            <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              <option value="OUTRO">Outro…</option>
            </Select>
            {tipo === "OUTRO" && <Input name="tipoOutro" required placeholder="Descreva o tipo" className="mt-2" />}
          </Campo>
          <Campo rotulo="Data de entrada">
            <Input type="date" name="dataEntrada" required defaultValue={hoje()} />
          </Campo>
        </div>

        <Campo rotulo="Situação atual">
          <Select name="situacao" defaultValue="EM_ANDAMENTO">
            {(Object.keys(SITUACAO_LABELS) as SeiSituacao[]).map((s) => (
              <option key={s} value={s}>
                {SITUACAO_LABELS[s]}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo rotulo="Observação (opcional)">
          <textarea
            name="observacao"
            rows={3}
            maxLength={2000}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground"
            placeholder="Ex.: entrada feita pelo escritório anterior; acompanhar pelo telefone da Vigilância."
          />
        </Campo>

        {estado?.error && <p className="text-sm text-danger">{estado.error}</p>}
        <div>
          <Button type="submit" loading={pendente}>
            Cadastrar processo
          </Button>
        </div>
        <p className="text-xs text-foreground/50">
          Depois de cadastrar, dá para lançar andamentos e anexar documentos na página do processo.
        </p>
      </form>
    </Card>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground/60">{rotulo}</span>
      {children}
    </div>
  );
}
