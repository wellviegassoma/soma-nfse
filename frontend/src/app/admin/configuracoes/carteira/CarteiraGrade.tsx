"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { salvarResponsaveisEmLoteAction, salvarResponsavelAction } from "@/lib/actions/tarefas";

type Empresa = { id: string; nome: string; pessoa: "PF" | "PJ" | null; regime: string | null; municipio: string | null };
type Opcao = { id: string; nome: string };

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CarteiraGrade({
  empresas,
  departamentos,
  equipe,
  carteira,
}: {
  empresas: Empresa[];
  departamentos: Opcao[];
  equipe: Opcao[];
  carteira: { company_id: string; departamento_id: string; user_id: string }[];
}) {
  const [mapa, setMapa] = useState(() => new Map(carteira.map((c) => [`${c.company_id}|${c.departamento_id}`, c.user_id])));
  const [busca, setBusca] = useState("");
  const [loteDepto, setLoteDepto] = useState(departamentos[0]?.id ?? "");
  const [loteUser, setLoteUser] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return empresas;
    return empresas.filter((e) => semAcento([e.nome, e.pessoa, e.regime, e.municipio].filter(Boolean).join(" ")).includes(q));
  }, [empresas, busca]);
  const semResponsavel = (deptoId: string) => visiveis.filter((e) => !mapa.get(`${e.id}|${deptoId}`)).length;

  const salvar = (companyId: string, departamentoId: string, userId: string | null) =>
    iniciar(async () => {
      const r = await salvarResponsavelAction({ companyId, departamentoId, userId });
      if ("error" in r) return setMsg({ erro: r.error });
      setMapa((m) => {
        const n = new Map(m);
        if (userId) n.set(`${companyId}|${departamentoId}`, userId);
        else n.delete(`${companyId}|${departamentoId}`);
        return n;
      });
      setMsg(null);
    });

  const aplicarLote = () => {
    const depto = departamentos.find((d) => d.id === loteDepto);
    const user = equipe.find((u) => u.id === loteUser);
    if (!depto) return;
    const texto = `${user ? `Colocar ${user.nome}` : "Tirar o responsável"} em ${depto.nome} nas ${visiveis.length} empresa(s) da lista${busca ? " filtrada" : ""}?`;
    if (!window.confirm(texto)) return;
    iniciar(async () => {
      const ids = visiveis.map((e) => e.id);
      const r = await salvarResponsaveisEmLoteAction({ companyIds: ids, departamentoId: loteDepto, userId: loteUser || null });
      if ("error" in r) return setMsg({ erro: r.error });
      setMapa((m) => {
        const n = new Map(m);
        for (const id of ids) {
          if (loteUser) n.set(`${id}|${loteDepto}`, loteUser);
          else n.delete(`${id}|${loteDepto}`);
        }
        return n;
      });
      setMsg({ ok: r.mensagem });
    });
  };

  if (!departamentos.length) {
    return (
      <Card className="p-6 text-sm text-foreground/60">
        Nenhum departamento tem modelo de tarefa ainda — cadastre os modelos primeiro.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar: nome, PF, Simples, Petrópolis…"
          className="h-8 w-72 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
        />
        <span className="text-xs text-foreground/60">{visiveis.length} empresa(s)</span>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="text-foreground/60">Em lote, na lista:</span>
          <select value={loteDepto} onChange={(e) => setLoteDepto(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2 text-sm">
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <select value={loteUser} onChange={(e) => setLoteUser(e.target.value)} className="h-8 rounded-lg border border-border bg-surface px-2 text-sm">
            <option value="">(ninguém)</option>
            {equipe.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={aplicarLote}
            disabled={pendente || !visiveis.length}
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      </div>
      {msg && <div className={cn("text-sm", msg.erro ? "text-danger" : "text-success")}>{msg.erro ?? msg.ok}</div>}

      <Card className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground/50">
              <th className="sticky left-0 z-[1] min-w-[260px] bg-surface px-4 py-2 font-medium">Empresa</th>
              {departamentos.map((d) => (
                <th key={d.id} className="min-w-[180px] px-2 py-2 font-medium">
                  {d.nome}
                  {semResponsavel(d.id) > 0 && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">{semResponsavel(d.id)} sem</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e) => (
              <tr key={e.id} className="border-b border-border/50">
                <td className="sticky left-0 z-[1] bg-surface px-4 py-1.5">
                  <div className="text-foreground">{e.nome}</div>
                  <div className="text-[11px] text-foreground/50">{[e.pessoa, e.regime, e.municipio].filter(Boolean).join(" · ")}</div>
                </td>
                {departamentos.map((d) => {
                  const atual = mapa.get(`${e.id}|${d.id}`) ?? "";
                  return (
                    <td key={d.id} className="px-2 py-1.5">
                      <select
                        value={atual}
                        disabled={pendente}
                        onChange={(ev) => salvar(e.id, d.id, ev.target.value || null)}
                        className={cn(
                          "h-8 w-full rounded-lg border px-2 text-xs",
                          atual ? "border-border bg-surface text-foreground" : "border-amber-300 bg-amber-50 text-foreground/60",
                        )}
                      >
                        <option value="">—</option>
                        {equipe.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nome}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
