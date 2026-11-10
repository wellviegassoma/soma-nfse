"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { issueNfse } from "@/lib/actions/notas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { hojeBrasilia } from "@/lib/competencia";
import { calcularRetencoes, lerPercentual, tomadorRetem } from "@/lib/retencoes-nota";
import type { NotaRecente, PrefillEmissao } from "@/lib/emissao-prefill";

type Customer = { id: string; name: string; cpf_cnpj: string | null };
type Service = {
  id: string;
  name: string;
  description: string | null;
  tipo_retencao_issqn?: number | null;
  iss_rate?: number | null;
  retencao_irrf_aliquota?: number | null;
  retencao_pis_cofins_csll_aliquota?: number | null;
};

function pctTexto(v: number | null | undefined) {
  return v != null ? String(v).replace(".", ",") : "";
}

function padroesRetencao(service: Service | undefined, issAliquotaPadrao?: number | null) {
  return {
    issRetido: (service?.tipo_retencao_issqn ?? 1) !== 1,
    aliquotaIss: pctTexto(service?.iss_rate ?? issAliquotaPadrao),
    irrfPct: pctTexto(service?.retencao_irrf_aliquota),
    csrfPct: pctTexto(service?.retencao_pis_cofins_csll_aliquota),
  };
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function EmitirNotaForm({
  companyId,
  customers,
  services,
  allowRetroactiveEmission,
  mesCorrente,
  basePath,
  taxRegime,
  issAliquotaPadrao,
  prefill,
}: {
  companyId: string;
  customers: Customer[];
  services: Service[];
  allowRetroactiveEmission: boolean;
  mesCorrente: string;
  /** Usado pra montar os links internos ("ver nota", "novo tomador") — o
   * mesmo form é reaproveitado no portal do cliente (/empresas/[companyId])
   * e no módulo de emissão da equipe (/admin/emissao-notas/[companyId]). */
  basePath?: string;
  taxRegime?: string | null;
  issAliquotaPadrao?: number | null;
  prefill?: PrefillEmissao;
}) {
  const base = basePath ?? `/empresas/${companyId}`;
  const emitirHref = basePath ?? `/empresas/${companyId}/emitir`;
  // Começa preenchido quando é "Emitir de novo" (?de=) ou, senão, com o
  // serviço que a empresa mais usa — só se ele ainda estiver ativo.
  const inicial = prefill?.inicial;
  const servicoInicial =
    [inicial?.serviceId, prefill?.servicoMaisUsado, services.length === 1 ? services[0].id : undefined]
      .filter(Boolean)
      .find((id) => services.some((s) => s.id === id)) ?? "";
  const clienteInicial =
    inicial && customers.some((c) => c.id === inicial.customerId) ? inicial.customerId : "";
  const padraoInicial = padroesRetencao(
    services.find((s) => s.id === servicoInicial),
    issAliquotaPadrao,
  );
  const frequentes = (prefill?.tomadoresFrequentes ?? [])
    .map((id) => customers.find((c) => c.id === id))
    .filter((c): c is Customer => Boolean(c));

  const [step, setStep] = useState<"form" | "review">("form");
  const [customerId, setCustomerId] = useState(clienteInicial);
  const [serviceId, setServiceId] = useState(servicoInicial);
  const [amount, setAmount] = useState(inicial?.amount ?? "");
  const [description, setDescription] = useState(
    inicial?.description ?? services.find((s) => s.id === servicoInicial)?.description ?? "",
  );
  const [competenceDate, setCompetenceDate] = useState(hojeBrasilia);
  const [issRetido, setIssRetido] = useState(padraoInicial.issRetido);
  const [aliquotaIss, setAliquotaIss] = useState(padraoInicial.aliquotaIss);
  const [irrfPct, setIrrfPct] = useState(padraoInicial.irrfPct);
  const [csrfPct, setCsrfPct] = useState(padraoInicial.csrfPct);
  const [inssPct, setInssPct] = useState("");
  const simples = taxRegime === "SIMPLES_NACIONAL";

  const [state, formAction, pending] = useActionState(issueNfse, undefined);

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);
  const selectedService = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);

  const retem = tomadorRetem(selectedCustomer?.cpf_cnpj);
  const valorNum = Number(amount.replace(",", ".")) || 0;
  const pcts = {
    issRetido: retem && issRetido,
    aliquotaIss: lerPercentual(aliquotaIss),
    irrfPct: retem ? lerPercentual(irrfPct) : null,
    csrfPct: retem ? lerPercentual(csrfPct) : null,
    inssPct: retem ? lerPercentual(inssPct) : null,
  };
  const pctInvalido = [pcts.aliquotaIss, pcts.irrfPct, pcts.csrfPct, pcts.inssPct].some(
    (v) => v != null && (Number.isNaN(v) || v < 0 || v > 100),
  );
  const retencoes = calcularRetencoes(valorNum, {
    ...pcts,
    aliquotaIss: Number.isNaN(pcts.aliquotaIss) ? null : pcts.aliquotaIss,
  });
  const faltaAliquotaIss = pcts.issRetido && simples && !(pcts.aliquotaIss && pcts.aliquotaIss > 0);

  const competenciaForaDoMes = !allowRetroactiveEmission && competenceDate.slice(0, 7) !== mesCorrente;

  const [copiada, setCopiada] = useState<NotaRecente | null>(null);

  function copiarNota(nota: NotaRecente) {
    setCopiada(nota);
    setStep("form");
    setCustomerId(nota.customerId && customers.some((c) => c.id === nota.customerId) ? nota.customerId : "");
    const servico =
      nota.serviceId && services.some((s) => s.id === nota.serviceId) ? nota.serviceId : serviceId;
    if (servico) {
      setServiceId(servico);
      const padrao = padroesRetencao(
        services.find((s) => s.id === servico),
        issAliquotaPadrao,
      );
      setIssRetido(padrao.issRetido);
      setAliquotaIss(padrao.aliquotaIss);
      setIrrfPct(padrao.irrfPct);
      setCsrfPct(padrao.csrfPct);
      setInssPct("");
    }
    setAmount(nota.valor ? String(nota.valor).replace(".", ",") : "");
    setDescription(nota.descricao || services.find((s) => s.id === servico)?.description || "");
    setCompetenceDate(hojeBrasilia());
    if (typeof window !== "undefined" && window.innerWidth < 1024)
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const ultimas = prefill?.ultimasNotas ?? [];
  const painelUltimas = (
    <Card className="flex flex-col p-0">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-foreground">Últimas notas emitidas</h2>
        <p className="text-xs text-foreground/55">
          Clique em Copiar pra preencher o formulário e mude só o que for diferente.
        </p>
      </div>
      {ultimas.length === 0 ? (
        <p className="px-5 py-6 text-sm text-foreground/50">Nenhuma nota recente dessa empresa.</p>
      ) : (
        <ul className="divide-y divide-border">
          {ultimas.map((n) => (
            <li key={`${n.origem}-${n.id}`} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">{n.tomadorNome}</span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {formatMoney(n.valor)}
                  </span>
                </div>
                <div className="truncate text-xs text-foreground/55" title={n.descricao}>
                  {n.data ? dataCurta(n.data) : ""}
                  {n.descricao ? ` · ${n.descricao}` : ""}
                </div>
                {!n.customerId && (
                  <div className="text-xs text-warning">Tomador ainda não cadastrado aqui</div>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => copiarNota(n)}
                disabled={pending}
              >
                Copiar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border px-5 py-3">
        <Link href={`${base}/notas`} className="text-xs font-medium text-brand hover:underline">
          Ver todas as notas
        </Link>
      </div>
    </Card>
  );

  function handleServiceChange(id: string) {
    setServiceId(id);
    const service = services.find((s) => s.id === id);
    if (service?.description && !description) setDescription(service.description);
    // Retenções começam com o padrão do serviço — ajustáveis nesta nota.
    const padrao = padroesRetencao(service, issAliquotaPadrao);
    setIssRetido(padrao.issRetido);
    setAliquotaIss(padrao.aliquotaIss);
    setIrrfPct(padrao.irrfPct);
    setCsrfPct(padrao.csrfPct);
    setInssPct("");
  }

  if (state?.success) {
    return (
      <Card className="flex max-w-lg flex-col gap-4 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-foreground">Nota emitida com sucesso</h2>
        <p className="text-sm text-foreground/60">
          {selectedCustomer?.name} · {formatMoney(Number(amount.replace(",", ".")))}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={`${base}/notas/${state.dpsId}`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Ver nota
            </Button>
          </Link>
          <a href={`${emitirHref}?de=${state.dpsId}`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Outra igual para este tomador
            </Button>
          </a>
          <a href={emitirHref}>
            <Button className="w-full sm:w-auto">Emitir outra nota</Button>
          </a>
        </div>
      </Card>
    );
  }

  if (step === "review") {
    return (
      <Card className="max-w-lg p-6 sm:p-8">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="serviceId" value={serviceId} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="description" value={description} />
          <input type="hidden" name="competenceDate" value={competenceDate} />
          <input type="hidden" name="issRetido" value={pcts.issRetido ? "1" : "0"} />
          <input type="hidden" name="aliquotaIss" value={aliquotaIss} />
          <input type="hidden" name="irrfPct" value={retem ? irrfPct : ""} />
          <input type="hidden" name="csrfPct" value={retem ? csrfPct : ""} />
          <input type="hidden" name="inssPct" value={retem ? inssPct : ""} />

          <h2 className="text-sm font-semibold text-foreground/70">Confirme a emissão</h2>

          {state?.error && (
            <Alert tone="danger">
              <p>{state.error}</p>
              {state.motivos && state.motivos.length > 0 && (
                <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
                  {state.motivos.map((m, i) => (
                    <li key={m.codigo ?? i}>
                      <span className="font-medium">{m.mensagem}</span>
                      {m.acao && <span> {m.acao}</span>}
                      {m.onde === "tomador" && customerId && (
                        <>
                          {" "}
                          <Link href={`${base}/tomadores/${customerId}`} className="underline">
                            Abrir cadastro do tomador
                          </Link>
                        </>
                      )}
                      {m.codigo && <span className="ml-1 text-xs opacity-60">({m.codigo})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          <Card className="divide-y divide-border p-0">
            <Row
              label="Tomador"
              value={selectedCustomer?.name ?? "—"}
              editHref={customerId ? `${base}/tomadores/${customerId}` : undefined}
            />
            <Row label="Serviço" value={selectedService?.name ?? "—"} />
            <Row label="Valor" value={formatMoney(Number(amount.replace(",", ".")) || 0)} />
            <Row label="Descrição" value={description || "—"} />
            {retencoes.iss > 0 && (
              <Row label="ISS retido pelo tomador" value={`− ${formatMoney(retencoes.iss)}`} />
            )}
            {retencoes.irrf > 0 && <Row label="IRRF retido" value={`− ${formatMoney(retencoes.irrf)}`} />}
            {retencoes.csrf > 0 && (
              <Row label="PIS/COFINS/CSLL retidos" value={`− ${formatMoney(retencoes.csrf)}`} />
            )}
            {retencoes.inss > 0 && <Row label="INSS retido" value={`− ${formatMoney(retencoes.inss)}`} />}
            <Row label="Líquido a receber" value={formatMoney(retencoes.liquido)} />
          </Card>

          <div className="flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={() => setStep("form")} disabled={pending}>
              Voltar
            </Button>
            <Button type="submit" loading={pending} className="flex-1">
              Emitir
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <Card className="flex flex-col gap-4 p-6 sm:p-8">
        {(inicial || copiada) && (
          <Alert tone="success">
            {copiada
              ? `Copiado da nota de ${copiada.tomadorNome.replace(/\.$/, "")}. Confira o valor, a data e a descrição.`
              : "Repetindo uma nota anterior. Confira o valor, a data e a descrição."}
          </Alert>
        )}
        {copiada && !customerId && (
          <Alert tone="warning">
            O tomador dessa nota ({copiada.tomadorNome}) ainda não está cadastrado aqui.{" "}
            <Link href={`${base}/tomadores/novo`} className="underline">
              Cadastrar tomador
            </Link>{" "}
            ou escolha outro abaixo.
          </Alert>
        )}
        {frequentes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground/55">Tomadores mais usados</span>
            <div className="flex flex-wrap gap-1.5">
              {frequentes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCustomerId(c.id)}
                  className={`max-w-full truncate rounded-full border px-3 py-1 text-xs ${c.id === customerId ? "border-brand bg-brand/10 font-medium text-brand" : "border-border text-foreground/75 hover:border-brand"}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Tomador" htmlFor="customerId">
          <Select id="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Selecione</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {customerId && (
          <Link
            href={`${base}/tomadores/${customerId}`}
            className="-mt-2 text-xs font-medium text-brand hover:underline"
          >
            Editar cadastro deste tomador
          </Link>
        )}

        {customers.length === 0 &&
          (basePath ? (
            <p className="-mt-2 text-xs text-foreground/50">
              Nenhum tomador cadastrado ainda pra essa empresa —{" "}
              <Link href={`${base}/tomadores/novo`} className="font-medium text-brand hover:underline">
                cadastre um
              </Link>
              .
            </p>
          ) : (
            <p className="-mt-2 text-xs text-foreground/50">
              Nenhum tomador cadastrado ainda —{" "}
              <Link href={`${base}/tomadores/novo`} className="font-medium text-brand hover:underline">
                cadastre um
              </Link>
              .
            </p>
          ))}

        <Field label="Serviço" htmlFor="serviceId">
          <Select id="serviceId" value={serviceId} onChange={(e) => handleServiceChange(e.target.value)}>
            <option value="">Selecione</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Valor" htmlFor="amount">
          <Input
            id="amount"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label="Data" htmlFor="competenceDate">
          <Input
            id="competenceDate"
            type="date"
            value={competenceDate}
            onChange={(e) => setCompetenceDate(e.target.value)}
          />
        </Field>
        {competenciaForaDoMes && (
          <Alert tone="warning">
            Essa data está fora do mês corrente. Emissão retroativa está desabilitada para essa empresa — peça
            pra SOMA habilitar em Dados fiscais se for necessário.
          </Alert>
        )}

        <Field label="Descrição" htmlFor="description">
          <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        {selectedService && selectedCustomer && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <p className="text-sm font-semibold text-foreground">Impostos retidos pelo tomador</p>
            {!retem ? (
              <p className="text-xs text-foreground/55">
                Tomador pessoa física: não há retenção. O líquido é o valor da nota.
              </p>
            ) : (
              <>
                <p className="-mt-2 text-xs text-foreground/55">
                  Já vem com o padrão do serviço. Mude só se este tomador desconta algo diferente (ex.: órgão
                  público ou empresa grande costuma reter IRRF 1,5% e PIS/COFINS/CSLL 4,65%).
                </p>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={issRetido}
                    onChange={(e) => setIssRetido(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-brand"
                  />
                  O tomador vai reter o ISS
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {issRetido && (
                    <Field
                      label={simples ? "Alíquota do ISS (%), obrigatória" : "Alíquota do ISS (%)"}
                      htmlFor="aliquotaIss"
                      hint={simples ? "No Simples, use a alíquota de ISS do DAS do mês." : undefined}
                    >
                      <Input
                        id="aliquotaIss"
                        inputMode="decimal"
                        placeholder="2,00"
                        value={aliquotaIss}
                        onChange={(e) => setAliquotaIss(e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label="IRRF (%)" htmlFor="irrfPct">
                    <Input
                      id="irrfPct"
                      inputMode="decimal"
                      placeholder="0"
                      value={irrfPct}
                      onChange={(e) => setIrrfPct(e.target.value)}
                    />
                  </Field>
                  <Field label="PIS/COFINS/CSLL (%)" htmlFor="csrfPct">
                    <Input
                      id="csrfPct"
                      inputMode="decimal"
                      placeholder="0"
                      value={csrfPct}
                      onChange={(e) => setCsrfPct(e.target.value)}
                    />
                  </Field>
                  <Field label="INSS (%)" htmlFor="inssPct">
                    <Input
                      id="inssPct"
                      inputMode="decimal"
                      placeholder="0"
                      value={inssPct}
                      onChange={(e) => setInssPct(e.target.value)}
                    />
                  </Field>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between text-foreground/60">
                <span>Valor da nota</span>
                <span>{formatMoney(valorNum)}</span>
              </div>
              {retencoes.total > 0 && (
                <div className="flex justify-between text-foreground/60">
                  <span>Retido pelo tomador</span>
                  <span>− {formatMoney(retencoes.total)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-foreground">
                <span>Líquido a receber</span>
                <span>{formatMoney(retencoes.liquido)}</span>
              </div>
            </div>
            {pctInvalido && (
              <Alert tone="warning">Algum percentual está inválido. Use um número entre 0 e 100.</Alert>
            )}
            {faltaAliquotaIss && (
              <Alert tone="warning">Informe a alíquota do ISS para reter o ISS no Simples.</Alert>
            )}
          </div>
        )}

        <Button
          type="button"
          size="lg"
          className="mt-2"
          disabled={
            !customerId ||
            !serviceId ||
            !amount ||
            !description ||
            !competenceDate ||
            competenciaForaDoMes ||
            pctInvalido ||
            faltaAliquotaIss
          }
          onClick={() => setStep("review")}
        >
          Continuar
        </Button>
      </Card>
      {painelUltimas}
    </div>
  );
}

function dataCurta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

function Row({ label, value, editHref }: { label: string; value: string; editHref?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-foreground/50">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-medium text-foreground">{value}</span>
        {editHref && (
          <Link href={editHref} className="text-xs font-medium text-brand hover:underline">
            editar
          </Link>
        )}
      </span>
    </div>
  );
}
