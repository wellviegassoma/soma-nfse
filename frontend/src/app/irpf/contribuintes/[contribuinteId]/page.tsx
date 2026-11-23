import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listarEquipe } from "@/lib/tarefas";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarCpf, formatarData, formatarMoeda } from "@/lib/formatters";
import {
  STATUS_LABEL,
  STATUS_TOM,
  DEPENDENCIA_LABEL,
  TIPO_CONTA_LABEL,
  dataBr,
  exercicioAtual,
  type ResumoGravado,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";
import { EditarContribuinte } from "./EditarContribuinte";
import { CriarDeclaracaoButton } from "./CriarDeclaracaoButton";
import { DocumentosContribuinte } from "./DocumentosContribuinte";

export const metadata = { title: "IRPF — Contribuinte" };

export default async function ContribuintePage(props: PageProps<"/irpf/contribuintes/[contribuinteId]">) {
  const { contribuinteId } = await props.params;
  const supabase = await createClient();
  const [{ data: c }, { data: decls }, equipe] = await Promise.all([
    supabase.from("irpf_contribuintes").select("*").eq("id", contribuinteId).maybeSingle(),
    supabase
      .from("irpf_declaracoes")
      .select("id, exercicio, status, resumo")
      .eq("contribuinte_id", contribuinteId)
      .order("exercicio", { ascending: false }),
    listarEquipe(),
  ]);
  if (!c) notFound();
  const lista = (decls ?? []).map((d) => ({ ...d, resumo: d.resumo as ResumoGravado | null, status: d.status as StatusDeclaracao }));
  const proximo = exercicioAtual();
  const declIds = lista.map((d) => d.id);
  const { data: docsRaw } = declIds.length
    ? await supabase
        .from("irpf_arquivos")
        .select("id, declaracao_id, nome_arquivo, descricao, created_at")
        .eq("tipo", "DOCUMENTO")
        .in("declaracao_id", declIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const exercicioDe = new Map(lista.map((d) => [d.id, d.exercicio]));
  const documentos = (docsRaw ?? []).map((a) => ({
    id: a.id as string,
    declaracaoId: a.declaracao_id as string,
    exercicio: exercicioDe.get(a.declaracao_id as string) ?? proximo,
    nome: a.nome_arquivo as string,
    descricao: a.descricao as string | null,
    criadoEm: formatarData(a.created_at as string) ?? "",
  }));
  const exerciciosDoc = [...new Set([proximo, proximo - 1, ...lista.map((d) => d.exercicio)])].sort((a, b) => b - a);
  const temProximo = lista.some((d) => d.exercicio === proximo);

  const linhas: { campo: string; f: (r: ResumoGravado) => number }[] = [
    { campo: "Rendimentos tributáveis", f: (r) => r.totais.rendimentosTributaveis },
    { campo: "Rendimentos isentos", f: (r) => r.totais.rendimentosIsentos },
    { campo: "Tributação exclusiva", f: (r) => r.totais.rendimentosExclusivos },
    { campo: "Deduções / desconto", f: (r) => r.totais.deducoes },
    { campo: "Imposto devido", f: (r) => r.totais.impostoDevido },
    { campo: "A restituir", f: (r) => r.totais.impostoRestituir },
    { campo: "A pagar", f: (r) => r.totais.impostoPagar },
    { campo: "Bens em 31/12", f: (r) => r.totais.bensAtual },
    { campo: "Dívidas em 31/12", f: (r) => r.totais.dividasAtual },
    { campo: "Patrimônio líquido", f: (r) => r.totais.bensAtual - r.totais.dividasAtual },
  ];
  const comResumo = lista.filter((d) => d.resumo).slice().reverse();
  const ultimoResumo = lista.find((d) => d.resumo)?.resumo ?? null;
  const responsavel = c.responsavel_id ? equipe.find((e) => e.id === c.responsavel_id)?.nome ?? null : null;
  const fone = (t: string | null) =>
    t ? (t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : t) : null;
  const endereco = [
    [c.tipo_logradouro, c.logradouro].filter(Boolean).join(" "),
    c.numero,
    c.complemento,
    c.bairro,
  ]
    .filter(Boolean)
    .join(", ");
  const cidade = [c.municipio, c.uf].filter(Boolean).join(" / ");
  const dadosCadastro: [string, string | null][] = [
    ["Endereço", endereco || null],
    ["Cidade", cidade || null],
    ["CEP", c.cep ? `${c.cep.slice(0, 5)}-${c.cep.slice(5)}` : null],
    ["E-mail", c.email],
    ["Celular", fone(c.celular)],
    ["Telefone", fone(c.telefone_fixo)],
    ["Título de eleitor", c.titulo_eleitor],
    ["Ocupação (código RFB)", c.ocupacao_codigo],
    ["Natureza da ocupação (código RFB)", c.natureza_ocupacao_codigo],
    ["Cônjuge", c.tem_conjuge === null ? null : c.tem_conjuge ? `Sim${c.cpf_conjuge ? ` · CPF ${formatarCpf(c.cpf_conjuge)}` : ""}` : "Não"],
    [
      "Restituição / débito",
      c.tipo_conta === "4"
        ? "Pix (chave CPF)"
        : c.banco
          ? `${TIPO_CONTA_LABEL[c.tipo_conta ?? ""] ?? "Conta"} · banco ${c.banco} · ag. ${c.agencia ?? "—"} · conta ${c.conta ?? "—"}${c.conta_dv ? `-${c.conta_dv}` : ""}`
          : null,
    ],
    ["Doença grave / deficiência", c.doenca_grave === null ? null : c.doenca_grave ? "Sim" : "Não"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/irpf/contribuintes" className="text-xs text-foreground/50 hover:text-foreground">
          ← Contribuintes
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{c.nome}</h1>
        <p className="text-sm text-foreground/60">
          CPF {formatarCpf(c.cpf)}
          {c.nascimento && <> · nascimento {dataBr(c.nascimento)}</>}
        </p>
        <p className="text-sm text-foreground/60">
          Responsável pela declaração: <span className="font-medium text-foreground">{responsavel ?? "não definido"}</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <div className="text-sm font-semibold text-foreground/70">Declarações</div>
              {!temProximo && <CriarDeclaracaoButton contribuinteId={contribuinteId} exercicio={proximo} />}
            </div>
            <div className="divide-y divide-border">
              {lista.map((d) => (
                <Link
                  key={d.id}
                  href={`/irpf/declaracoes/${d.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-surface-muted"
                >
                  <span className="font-medium">{d.exercicio}</span>
                  <span className="flex-1 text-foreground/60">
                    {d.resumo
                      ? d.resumo.resultado === "PAGAR"
                        ? `Pagar ${formatarMoeda(d.resumo.totais.impostoPagar)}`
                        : d.resumo.resultado === "RESTITUIR"
                          ? `Restituir ${formatarMoeda(d.resumo.totais.impostoRestituir)}`
                          : "Sem saldo"
                      : "sem arquivo"}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_PILL_CLASSES[STATUS_TOM[d.status]])}>
                    {STATUS_LABEL[d.status]}
                  </span>
                </Link>
              ))}
              {lista.length === 0 && <div className="px-5 py-4 text-sm text-foreground/50">Nenhuma declaração.</div>}
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
              Cadastro {c.cadastro_exercicio ? `(da declaração ${c.cadastro_exercicio})` : ""}
            </div>
            {c.cadastro_exercicio ? (
              <dl className="grid gap-x-6 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
                {dadosCadastro.map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-foreground/50">{k}</dt>
                    <dd className="text-foreground">{v ?? <span className="text-foreground/35">—</span>}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="px-5 py-4 text-sm text-foreground/50">Sem .DEC importado — o cadastro vem da declaração.</div>
            )}
            {ultimoResumo && ultimoResumo.dependentes.length > 0 && (
              <div className="border-t border-border px-5 py-3 text-sm">
                <div className="mb-1 text-xs text-foreground/50">Dependentes</div>
                <ul className="flex flex-col gap-0.5">
                  {ultimoResumo.dependentes.map((d, i) => (
                    <li key={i}>
                      {d.nome}
                      <span className="text-foreground/50">
                        {" "}
                        · {DEPENDENCIA_LABEL[d.codigo] ?? `código ${d.codigo}`}
                        {d.nascimento && ` · nasc. ${dataBr(d.nascimento)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {comResumo.length > 1 && (
            <Card className="overflow-x-auto">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">Evolução ano a ano</div>
              <table className="w-full text-sm">
                <thead className="text-xs text-foreground/50">
                  <tr>
                    <th className="px-5 py-2 text-left font-medium" />
                    {comResumo.map((d) => (
                      <th key={d.id} className="px-3 py-2 text-right font-medium">
                        {d.exercicio}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {linhas.map((l) => (
                    <tr key={l.campo}>
                      <td className="px-5 py-1.5 text-foreground/70">{l.campo}</td>
                      {comResumo.map((d) => (
                        <td key={d.id} className="px-3 py-1.5 text-right tabular-nums">
                          {formatarMoeda(l.f(d.resumo!))}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-5">
        <DocumentosContribuinte
          contribuinteId={contribuinteId}
          exercicios={exerciciosDoc}
          padrao={proximo}
          documentos={documentos}
        />
        <EditarContribuinte
          id={c.id}
          nome={c.nome}
          email={c.email}
          telefone={c.telefone}
          responsavelId={c.responsavel_id}
          observacoes={c.observacoes}
          ativo={c.ativo}
          equipe={equipe}
        />
        </div>
      </div>
    </div>
  );
}
