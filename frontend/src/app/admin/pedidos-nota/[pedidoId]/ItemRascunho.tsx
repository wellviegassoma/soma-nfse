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
  const [descricaoAnterior, setDescricaoAnterior] = useState<string | null>(null);
  const [competencia, setCompetencia] = useState(item.competencia ?? hoje);
  const editavel = ["RASCUNHO", "ERRO"].includes(item.status);
  const estado = sEmitir ?? sSalvar ?? sDesc;

  // Tomador: do cadastro, ou novo com nome + CPF/CNPJ vindos da mensagem.
  const [tomadorId, setTomadorId] = useState(item.customer_id ?? "");
  const temTomadorNovo = Boolean(item.tomador_nome || item.tomador_documento);
  const [novoNome, setNovoNome] = useState(item.tomador_nome ?? "");
  const [novoDoc, setNovoDoc] = useState(item.tomador_documento ?? "");
  const [cadastrar, setCadastrar] = useState(temTomadorNovo);
  const digitosDoc = novoDoc.replace(/\D/g, "");
  const problemaDoc =
    !digitosDoc ? null : digitosDoc.length === 11 ? null : digitosDoc.length === 14 ? null : "CPF tem 11 dígitos e CNPJ, 14.";

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
        <Field label="Tomador" htmlFor={`tomador-${item.id}`}>
          <Select
            id={`tomador-${item.id}`}
            name="customerId"
            value={tomadorId}
            onChange={(e) => setTomadorId(e.target.value)}
            disabled={!editavel}
          >
            <option value="">{temTomadorNovo ? "— tomador novo (abaixo) —" : "— escolher —"}</option>
            {tomadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        {!tomadorId && editavel ? (
          <div className="flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="text-xs font-medium text-foreground">
              Tomador novo{temTomadorNovo ? " (dados da mensagem do cliente)" : ""}: confira e ele é cadastrado ao emitir.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" htmlFor={`tnome-${item.id}`}>
                <Input id={`tnome-${item.id}`} name="tomadorNome" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
              </Field>
              <Field label="CPF ou CNPJ" htmlFor={`tdoc-${item.id}`} hint={problemaDoc ?? undefined}>
                <Input id={`tdoc-${item.id}`} name="tomadorDocumento" inputMode="numeric" value={novoDoc} onChange={(e) => setNovoDoc(e.target.value)} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground/80">
              <input type="checkbox" name="cadastrarTomador" value="1" checked={cadastrar} onChange={(e) => setCadastrar(e.target.checked)} />
              Cadastrar este tomador ao aprovar (CNPJ: completa endereço pela Receita)
            </label>
            {companyId ? (
              <Link href={`/admin/emissao-notas/${companyId}/tomadores/novo`} target="_blank" className="text-xs text-brand hover:underline">
                Prefiro cadastrar com todos os dados (abre em outra aba; depois recarregue)
              </Link>
            ) : null}
          </div>
        ) : null}

        <Field label="Serviço" htmlFor={`servico-${item.id}`}>
          <Select
            id={`servico-${item.id}`}
            name="serviceId"
            value={servicoId}
            onChange={(e) => {
              const novo = e.target.value;
              // Escolher o serviço traz a descrição padrão dele. Se havia outra
              // descrição (da IA ou digitada), ela fica guardada para "voltar".
              const padrao = descricaoDoServico(novo);
              if (padrao && padrao !== descricao) {
                if (descricao.trim() && descricao !== descricaoDoServico(servicoId)) setDescricaoAnterior(descricao);
                setDescricao(padrao);
              }
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
            rows={3}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </Field>
        {descricaoAnterior && editavel ? (
          <div className="-mt-1 flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => {
                setDescricao(descricaoAnterior);
                setDescricaoAnterior(null);
              }}
            >
              ↩ Voltar para a descrição anterior
            </button>
            <button
              type="button"
              className="text-brand hover:underline"
              onClick={() => {
                setDescricao(`${descricao.trim()} ${descricaoAnterior.trim()}`.trim());
                setDescricaoAnterior(null);
              }}
            >
              + Juntar com a descrição anterior
            </button>
          </div>
        ) : null}
        {companyId && editavel ? (
          <a
            href={`/admin/pedidos-nota/notas/${companyId}${novoNome || item.tomador_nome ? `?q=${encodeURIComponent(novoNome || item.tomador_nome || "")}` : ""}`}
            target="_blank"
            rel="noreferrer"
            className="-mt-1 self-start text-xs text-brand hover:underline"
          >
            Consultar notas já emitidas desta empresa ↗
          </a>
        ) : null}

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
