"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { aprovarEEmitirItem, descartarItem, salvarItem } from "@/lib/actions/pedidos-nota";
import { Selo, STATUS_ITEM } from "../status";

export type ItemView = {
  id: string;
  ordem: number;
  status: string;
  customer_id: string | null;
  tomador_documento: string | null;
  tomador_nome: string | null;
  service_id: string | null;
  valor: number | null;
  descricao: string | null;
  competencia: string | null;
  iss_retido: boolean | null;
  confianca: string | null;
  alertas: { codigo: string; mensagem: string }[];
  pergunta_ao_cliente: string | null;
  erro: string | null;
  dps_id: string | null;
};

const ALERTA_FORTE = new Set(["EMPRESA_PELO_NOME", "EMPRESA_ESCOLHIDA_IA", "POSSIVEL_DUPLICIDADE", "VALOR_ACIMA_PADRAO", "TOMADOR_DIVERGENTE", "COMPETENCIA_FORA_DO_MES", "AUDIO_NAO_TRANSCRITO"]);

export function ItemRascunho({
  item,
  companyId,
  servicos,
  tomadores,
  hoje,
}: {
  item: ItemView;
  companyId: string | null;
  servicos: { id: string; nome: string; descricao: string | null }[];
  tomadores: { id: string; nome: string }[];
  hoje: string;
}) {
  const [sEmitir, emitir, emitindo] = useActionState(aprovarEEmitirItem, undefined);
  const [sSalvar, salvar, salvando] = useActionState(salvarItem, undefined);
  const [sDesc, descartar, descartando] = useActionState(descartarItem, undefined);
  const [valor, setValor] = useState(item.valor != null ? Number(item.valor).toFixed(2).replace(".", ",") : "");
  const descricaoDoServico = (id: string) => servicos.find((s) => s.id === id)?.descricao ?? "";
  const [servicoId, setServicoId] = useState(item.service_id ?? "");
  // Sem descrição da IA, já vem a descrição padrão do serviço (igual à tela
  // Emitir Nota); trocar o serviço troca a descrição se ela ainda era a padrão.
  const [descricao, setDescricao] = useState(item.descricao || descricaoDoServico(item.service_id ?? ""));
  const [competencia, setCompetencia] = useState(item.competencia ?? hoje);
  const editavel = ["RASCUNHO", "ERRO"].includes(item.status);
  const estado = sEmitir ?? sSalvar ?? sDesc;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Nota {item.ordem + 1}</h3>
        <div className="flex items-center gap-2">
          {item.confianca && editavel ? <span className="text-xs text-foreground/50">confiança {item.confianca.toLowerCase()}</span> : null}
          <Selo s={item.status} mapa={STATUS_ITEM} />
        </div>
      </div>

      {item.alertas?.length && editavel ? (
        <ul className="flex flex-col gap-1.5">
          {item.alertas.map((a, i) => (
            <li
              key={i}
              className={`rounded-md px-3 py-1.5 text-xs ${ALERTA_FORTE.has(a.codigo) ? "bg-warning-soft text-warning" : "bg-surface-muted text-foreground/70"}`}
            >
              {a.mensagem}
            </li>
          ))}
        </ul>
      ) : null}
      {item.erro ? <Alert>{item.erro}</Alert> : null}
      {item.pergunta_ao_cliente && editavel ? (
        <p className="rounded-md border border-border px-3 py-2 text-xs text-foreground/70">
          <span className="font-medium text-foreground">Perguntar ao cliente:</span> {item.pergunta_ao_cliente}
        </p>
      ) : null}

      <form action={emitir} className="flex flex-col gap-3">
        <input type="hidden" name="itemId" value={item.id} />
        <Field
          label="Tomador"
          htmlFor={`tomador-${item.id}`}
          hint={
            !item.customer_id && (item.tomador_nome || item.tomador_documento)
              ? `Citado na mensagem: ${[item.tomador_nome, item.tomador_documento].filter(Boolean).join(" · ")}`
              : undefined
          }
        >
          <Select id={`tomador-${item.id}`} name="customerId" defaultValue={item.customer_id ?? ""} disabled={!editavel}>
            <option value="">— escolher —</option>
            {tomadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        {!item.customer_id && editavel && companyId ? (
          <Link href={`/admin/emissao-notas/${companyId}/tomadores/novo`} target="_blank" className="-mt-1 text-xs text-brand hover:underline">
            Cadastrar tomador novo (abre em outra aba; depois recarregue esta página)
          </Link>
        ) : null}

        <Field label="Serviço" htmlFor={`servico-${item.id}`}>
          <Select
            id={`servico-${item.id}`}
            name="serviceId"
            value={servicoId}
            onChange={(e) => {
              const novo = e.target.value;
              if (!descricao.trim() || descricao === descricaoDoServico(servicoId)) setDescricao(descricaoDoServico(novo));
              setServicoId(novo);
            }}
            disabled={!editavel}
          >
            <option value="">— escolher —</option>
            {servicos.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" htmlFor={`valor-${item.id}`}>
            <Input id={`valor-${item.id}`} name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} disabled={!editavel} />
          </Field>
          <Field label="Data (competência)" htmlFor={`comp-${item.id}`} hint={competencia === hoje ? "Hoje" : undefined}>
            <Input
              id={`comp-${item.id}`}
              name="competencia"
              type="date"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              disabled={!editavel}
            />
          </Field>
        </div>

        <Field label="Descrição" htmlFor={`desc-${item.id}`} hint={!item.descricao && descricao ? "Descrição padrão do serviço" : undefined}>
          <textarea
            id={`desc-${item.id}`}
            name="descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            disabled={!editavel}
            rows={2}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>

        {item.iss_retido != null ? (
          <p className="text-xs text-foreground/60">ISS retido pelo tomador: {item.iss_retido ? "sim" : "não"} (informado na mensagem).</p>
        ) : null}

        {editavel ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={emitindo} disabled={emitindo || salvando}>
              Aprovar e emitir
            </Button>
            <Button type="submit" formAction={salvar} variant="secondary" loading={salvando} disabled={emitindo || salvando}>
              Salvar sem emitir
            </Button>
            <Button type="submit" formAction={descartar} variant="ghost" loading={descartando} disabled={emitindo}>
              Descartar esta nota
            </Button>
          </div>
        ) : item.dps_id && companyId ? (
          <Link href={`/admin/emissao-notas/${companyId}/notas/${item.dps_id}`} className="text-sm text-brand hover:underline">
            Ver nota emitida →
          </Link>
        ) : null}
      </form>

      {estado?.error ? <Alert>{estado.error}</Alert> : estado?.ok ? <Alert tone="success">{estado.ok}</Alert> : null}
    </Card>
  );
}
