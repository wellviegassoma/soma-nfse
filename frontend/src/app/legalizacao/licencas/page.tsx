import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarCpfCnpj } from "@/lib/formatters";
import { temPermissao } from "@/lib/auth";
import { RenovarButton } from "./RenovarButton";
import { SITUACAO_LABELS, SITUACAO_TONES, textoDias, type Situacao } from "@/lib/legalizacao-licencas";
import {
  FILTROS,
  carregarPainelLicencas,
  lerParametros,
  type Filtro,
  type ParametrosPainel,
} from "@/lib/legalizacao-painel";

export const metadata = { title: "Alvarás e licenças — Legalização" };

const LIMITE_LINHAS = 400;

function url(p: ParametrosPainel, mudar: Partial<ParametrosPainel>, base = "/legalizacao/licencas"): string {
  const final = { ...p, ...mudar };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(final)) {
    if (v && !(k === "f" && v === "todas")) qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

function dataBr(d: string | null): string {
  return d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";
}

const CARDS: { situacao: Situacao | "TOTAL"; filtro: Filtro; classe: string }[] = [
  { situacao: "TOTAL", filtro: "todas", classe: "border-brand/40 bg-brand/5" },
  { situacao: "EM_DIA", filtro: "todas", classe: "bg-success-soft" },
  { situacao: "A_VENCER", filtro: "90", classe: "bg-warning-soft" },
  { situacao: "VENCIDA", filtro: "vencidas", classe: "bg-danger-soft" },
  { situacao: "EM_RENOVACAO", filtro: "em_renovacao", classe: "" },
  { situacao: "SEM_VENCIMENTO", filtro: "sem_vencimento", classe: "" },
  { situacao: "PENDENTE", filtro: "pendentes", classe: "" },
];

export default async function LicencasPage(props: PageProps<"/legalizacao/licencas">) {
  const p = lerParametros(await props.searchParams);
  const [painel, podeEditar] = await Promise.all([carregarPainelLicencas(p), temPermissao("legalizacao.editar")]);
  const total = painel.totalFiltradas;
  const visiveis = painel.linhas.slice(0, LIMITE_LINHAS);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Alvarás e licenças</h1>
          <p className="text-sm text-foreground/60">
            Vencimento das licenças de cada cliente — o que está vencido, a vencer ou ainda sem cadastro.
          </p>
        </div>
        <a href={url(p, {}, "/legalizacao/licencas/exportar")}>
          <Button variant="secondary">↓ Exportar CSV</Button>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {CARDS.map((c) => {
          const valor = c.situacao === "TOTAL" ? total : painel.contagem[c.situacao];
          const rotulo = c.situacao === "TOTAL" ? "Total" : SITUACAO_LABELS[c.situacao];
          return (
            <Link key={c.situacao} href={url(p, { f: c.filtro })}>
              <Card className={cn("p-4 transition-shadow hover:shadow-md", c.classe)}>
                <div className="text-2xl font-semibold text-foreground">{valor}</div>
                <div className="text-xs text-foreground/60">{rotulo}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      {painel.empresasSemMunicipio > 0 && (
        <Link
          href={url(p, { municipio: "sem" })}
          className="rounded-lg border border-warning/30 bg-warning-soft/50 px-4 py-2.5 text-sm text-foreground/80 hover:underline"
        >
          {painel.empresasSemMunicipio} cliente(s) ativo(s) sem município no cadastro — a regra de vencimento
          do município não é aplicada a eles. Ver quais →
        </Link>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-3">
          {FILTROS.map(([f, label]) => (
            <Link
              key={f}
              href={url(p, { f })}
              className={cn(
                "rounded-t-lg px-3 py-2 text-xs font-medium",
                p.f === f ? "bg-foreground text-background" : "text-foreground/60 hover:bg-surface-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <form className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-6">
          {p.f !== "todas" && <input type="hidden" name="f" value={p.f} />}
          <div className="sm:col-span-6">
            <Input name="q" defaultValue={p.q} placeholder="Cliente, código, CNPJ/CPF, tipo ou número…" />
          </div>
          <label className="flex flex-col gap-1 text-xs text-foreground/50 sm:col-span-2">
            Tipo
            <Select name="tipo" defaultValue={p.tipo}>
              <option value="">Todos os tipos</option>
              {painel.tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground/50 sm:col-span-2">
            Município
            <Select name="municipio" defaultValue={p.municipio}>
              <option value="">Todos</option>
              {painel.municipios.map((m) => (
                <option key={m.ibge} value={m.ibge}>
                  {m.nome} ({m.total})
                </option>
              ))}
              <option value="sem">Sem município cadastrado</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            Vencimento de
            <Input type="date" name="de" defaultValue={p.de} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground/50">
            Vencimento até
            <Input type="date" name="ate" defaultValue={p.ate} />
          </label>
          <div className="flex gap-2 sm:col-span-6">
            <Button type="submit" variant="secondary">
              Filtrar
            </Button>
            {(p.q || p.tipo || p.municipio || p.de || p.ate) && (
              <Link href={url({ f: p.f, q: "", tipo: "", municipio: "", de: "", ate: "" }, {})}>
                <Button type="button" variant="ghost">
                  Limpar filtros
                </Button>
              </Link>
            )}
          </div>
        </form>

        {visiveis.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhuma licença neste filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b border-border text-left text-xs text-foreground/50">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-3 py-2.5 font-medium">Tipo e número</th>
                  <th className="px-3 py-2.5 font-medium">Órgão / município</th>
                  <th className="px-3 py-2.5 font-medium">Vencimento</th>
                  <th className="px-3 py-2.5 font-medium">Dias para vencer</th>
                  <th className="px-3 py-2.5 font-medium">Situação</th>
                  <th className="px-3 py-2.5 font-medium">Responsável</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visiveis.map((l) => (
                  <tr key={`${l.companyId}:${l.tipoId}`} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">
                        {l.codigoCliente && <span className="mr-1 text-foreground/40">#{l.codigoCliente}</span>}
                        {l.empresa}
                      </div>
                      <div className="text-xs text-foreground/50">{formatarCpfCnpj(l.documento) ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground">{l.tipo}</div>
                      <div className="text-xs text-foreground/50">{l.numero ? `Nº ${l.numero}` : ""}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="text-foreground/80">{l.orgao ?? "—"}</div>
                      <div className="text-xs text-foreground/50">{l.municipio ?? "sem município"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-foreground/80">{dataBr(l.dataVencimento)}</td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-xs font-medium",
                        l.situacao === "VENCIDA" ? "text-danger" : l.situacao === "A_VENCER" ? "text-warning" : "text-foreground/60",
                      )}
                    >
                      {textoDias(l.dias)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_PILL_CLASSES[SITUACAO_TONES[l.situacao]],
                        )}
                      >
                        {SITUACAO_LABELS[l.situacao]}
                      </span>
                      {l.renovacao?.etapa && (
                        <div className="mt-1 text-[11px] text-foreground/50">{l.renovacao.etapa}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-foreground/70">
                      {l.renovacao ? (l.renovacao.responsavel ?? "—") : ""}
                      {l.renovacao?.protocolo && (
                        <div className="text-[11px] text-foreground/50">Prot. {l.renovacao.protocolo}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {l.renovacao ? (
                          <Link
                            href={`/legalizacao/processos/${l.renovacao.processoId}`}
                            className="text-xs font-medium text-brand hover:underline"
                          >
                            Ver renovação
                          </Link>
                        ) : (
                          podeEditar &&
                          (l.situacao === "VENCIDA" || l.situacao === "A_VENCER") && (
                            <RenovarButton companyId={l.companyId} tipoId={l.tipoId} />
                          )
                        )}
                        <Link
                          href={`/legalizacao/empresas/${l.companyId}/gerenciar`}
                          className="text-xs font-medium text-brand hover:underline"
                        >
                          {l.situacao === "PENDENTE" ? "Cadastrar" : "Abrir"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {painel.linhas.length > LIMITE_LINHAS && (
          <div className="border-t border-border px-4 py-3 text-xs text-foreground/50">
            Mostrando {LIMITE_LINHAS} de {painel.linhas.length} — use os filtros ou exporte o CSV para ver tudo.
          </div>
        )}
      </Card>
    </div>
  );
}
