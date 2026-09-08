"use client";

import { useActionState, useMemo, useState } from "react";
import { criarAgendamento } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import {
  FREQUENCIAS,
  FREQUENCIA_LABELS,
  formatarBRL,
  type AgendamentoTipo,
} from "@/lib/financeiro";
import {
  calcularRetencoes,
  NATUREZAS_SERVICO,
  NATUREZA_SERVICO_LABELS,
  type NaturezaServico,
} from "@/lib/financeiro-retencoes";

type Opcao = { id: string; nome: string };

const RETENCOES = [
  { campo: "retIss", label: "ISS", chave: "iss" },
  { campo: "retIrrf", label: "IRRF", chave: "irrf" },
  { campo: "retCsll", label: "CSLL", chave: "csll" },
  { campo: "retInss", label: "INSS", chave: "inss" },
  { campo: "retPis", label: "PIS", chave: "pis" },
  { campo: "retCofins", label: "COFINS", chave: "cofins" },
  { campo: "retOutras", label: "Outras", chave: "outras" },
] as const;

type Props = {
  companyId: string;
  tipo: AgendamentoTipo;
  contatos: { id: string; nome: string }[];
  categorias: Opcao[];
  centrosCusto: Opcao[];
};

/**
 * O formulário tem estado próprio (valor, retenções, parcelas) que precisa
 * zerar depois de um envio bem-sucedido. Em vez de chamar setState dentro de
 * um efeito — que dispara render em cascata — os campos vivem num componente
 * interno remontado por `key`, derivada do timestamp que a action devolve no
 * sucesso.
 */
export function AgendamentoForm(props: Props) {
  const [state, formAction, pending] = useActionState(criarAgendamento, undefined);
  return (
    <Campos
      key={state?.at ?? 0}
      {...props}
      state={state}
      formAction={formAction}
      pending={pending}
    />
  );
}

function Campos({
  companyId,
  tipo,
  contatos,
  categorias,
  centrosCusto,
  state,
  formAction,
  pending,
}: Props & {
  state: Awaited<ReturnType<typeof criarAgendamento>>;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [valorBruto, setValorBruto] = useState("");
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);
  const [natureza, setNatureza] = useState<NaturezaServico>("NENHUMA");
  const [prestadorSimples, setPrestadorSimples] = useState(false);
  const [issAliquota, setIssAliquota] = useState("");
  const [retencoes, setRetencoes] = useState<Record<string, string>>({});
  const [parcelas, setParcelas] = useState("1");

  const sugestao = useMemo(() => {
    const bruto = Number(valorBruto.replace(",", "."));
    if (!bruto) return null;
    return calcularRetencoes({
      valorBruto: bruto,
      natureza,
      prestadorSimples,
      issAliquota: issAliquota ? Number(issAliquota.replace(",", ".")) : null,
    });
  }, [valorBruto, natureza, prestadorSimples, issAliquota]);

  function aplicarSugestao() {
    if (!sugestao) return;
    const novo: Record<string, string> = {};
    for (const r of RETENCOES) {
      const v = sugestao[r.chave];
      novo[r.campo] = v ? String(v) : "";
    }
    setRetencoes(novo);
    setMostrarDetalhes(true);
  }

  const nParcelas = Math.max(1, Number(parcelas) || 1);
  const brutoNum = Number(valorBruto.replace(",", ".")) || 0;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="tipo" value={tipo} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Vencimento" htmlFor="vencimento">
          <Input id="vencimento" name="vencimento" type="date" required />
        </Field>
        <Field
          label="Previsto para"
          htmlFor="previstoPara"
          hint="Opcional. Data em que espera pagar, se diferente."
        >
          <Input id="previstoPara" name="previstoPara" type="date" />
        </Field>
        <Field label={tipo === "PAGAR" ? "Fornecedor" : "Cliente"} htmlFor="contatoId">
          <Select id="contatoId" name="contatoId" defaultValue="">
            <option value="">Sem contato</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Valor bruto" htmlFor="valorBruto">
          <Input
            id="valorBruto"
            name="valorBruto"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={valorBruto}
            onChange={(e) => setValorBruto(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <Field label="Categoria" htmlFor="categoriaId">
          <Select id="categoriaId" name="categoriaId" required defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </Field>
        {centrosCusto.length > 0 && (
          <Field label="Centro de custo" htmlFor="centroCustoId">
            <Select id="centroCustoId" name="centroCustoId" defaultValue="">
              <option value="">Nenhum</option>
              {centrosCusto.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Descrição" htmlFor="descricao">
          <Input id="descricao" name="descricao" placeholder="Ex.: Honorários setembro" />
        </Field>
        <Field label="Referência" htmlFor="referencia">
          <Input id="referencia" name="referencia" placeholder="Nota, contrato, CNPJ..." />
        </Field>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface-muted/40 p-4">
        <Field label="Parcelas" htmlFor="parcelas">
          <div className="w-24">
            <Input
              id="parcelas"
              name="parcelas"
              type="number"
              min="1"
              max="360"
              value={parcelas}
              onChange={(e) => setParcelas(e.target.value)}
            />
          </div>
        </Field>
        {nParcelas > 1 && (
          <>
            <Field label="Frequência" htmlFor="frequencia">
              <div className="w-40">
                <Select id="frequencia" name="frequencia" defaultValue="MENSAL">
                  {FREQUENCIAS.map((f) => (
                    <option key={f} value={f}>
                      {FREQUENCIA_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            <p className="pb-3 text-xs text-foreground/60">
              {nParcelas} parcelas
              {brutoNum > 0 && ` de aproximadamente ${formatarBRL(brutoNum / nParcelas)}`} — a
              sobra de centavos vai na primeira.
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMostrarDetalhes((v) => !v)}
        className="self-start text-sm font-medium text-brand hover:underline"
      >
        {mostrarDetalhes ? "− Ocultar" : "+ Retenções, desconto, juros e multa"}
      </button>

      {mostrarDetalhes && (
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
          {tipo === "PAGAR" && (
            <div className="flex flex-col gap-3 rounded-lg bg-surface-muted/40 p-3">
              <p className="text-xs font-medium text-foreground/70">
                Calcular retenção (sugestão — confira antes de usar)
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Natureza do serviço" htmlFor="natureza">
                  <Select
                    id="natureza"
                    value={natureza}
                    onChange={(e) => setNatureza(e.target.value as NaturezaServico)}
                  >
                    {NATUREZAS_SERVICO.map((n) => (
                      <option key={n} value={n}>
                        {NATUREZA_SERVICO_LABELS[n]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Alíquota de ISS retido (%)" htmlFor="issAliquota">
                  <Input
                    id="issAliquota"
                    type="number"
                    step="0.01"
                    min="0"
                    value={issAliquota}
                    onChange={(e) => setIssAliquota(e.target.value)}
                    placeholder="Conforme o município"
                  />
                </Field>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 text-xs text-foreground/70">
                    <input
                      type="checkbox"
                      checked={prestadorSimples}
                      onChange={(e) => setPrestadorSimples(e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-brand"
                    />
                    Prestador optante do Simples
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={aplicarSugestao}
                    disabled={!sugestao}
                  >
                    Calcular e preencher
                  </Button>
                </div>
              </div>
              {sugestao && sugestao.notas.length > 0 && (
                <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-foreground/60">
                  {sugestao.notas.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-4">
            {RETENCOES.map((r) => (
              <Field key={r.campo} label={r.label} htmlFor={r.campo}>
                <Input
                  id={r.campo}
                  name={r.campo}
                  type="number"
                  step="0.01"
                  min="0"
                  value={retencoes[r.campo] ?? ""}
                  onChange={(e) =>
                    setRetencoes((prev) => ({ ...prev, [r.campo]: e.target.value }))
                  }
                  placeholder="0,00"
                />
              </Field>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Desconto" htmlFor="desconto">
              <Input id="desconto" name="desconto" type="number" step="0.01" min="0" placeholder="0,00" />
            </Field>
            <Field label="Juros" htmlFor="juros">
              <Input id="juros" name="juros" type="number" step="0.01" min="0" placeholder="0,00" />
            </Field>
            <Field label="Multa" htmlFor="multa">
              <Input id="multa" name="multa" type="number" step="0.01" min="0" placeholder="0,00" />
            </Field>
          </div>
        </div>
      )}

      <div>
        <Button type="submit" loading={pending}>
          {tipo === "PAGAR" ? "Agendar pagamento" : "Agendar recebimento"}
        </Button>
      </div>
    </form>
  );
}
