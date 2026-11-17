"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { adicionarGrupoEmpresa, buscarGruposDigisac, removerGrupoEmpresa } from "@/lib/actions/grupos-whatsapp";
import type { DigisacGrupo } from "@/lib/digisac/client";

export type GrupoVinculado = {
  id: string;
  contactId: string;
  nome: string | null;
  fonte: string;
  outrasEmpresas: string[];
};

const FONTE: Record<string, string> = {
  CADASTRO: "cadastrado aqui",
  NOME_INICIAL: "pelo nome idêntico",
  CNPJ_COMANDO: "pelo #nota com CNPJ",
  PAINEL: "escolhido no painel de pedidos",
};

function Remover({ companyId, vinculoId }: { companyId: string; vinculoId: string }) {
  const [, action, pending] = useActionState(removerGrupoEmpresa, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="vinculoId" value={vinculoId} />
      <Button type="submit" variant="ghost" loading={pending} className="h-8 px-2 text-xs">
        Remover
      </Button>
    </form>
  );
}

export function GruposWhatsappForm({ companyId, vinculados }: { companyId: string; vinculados: GrupoVinculado[] }) {
  const [state, adicionar, adicionando] = useActionState(adicionarGrupoEmpresa, undefined);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<DigisacGrupo[]>([]);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [buscando, startBusca] = useTransition();
  const jaTem = new Set(vinculados.map((v) => v.contactId));

  useEffect(() => {
    if (busca.trim().length < 2) return;
    const t = setTimeout(() => {
      startBusca(async () => {
        const r = await buscarGruposDigisac(busca);
        setResultados(r.grupos);
        setErroBusca(r.error ?? null);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Grupos do WhatsApp</h2>
        <p className="text-sm text-foreground/60">
          Grupos do Digisac desta empresa. Um <code>#nota</code> num desses grupos já sai com esta empresa. Se o grupo
          atende mais de uma empresa, vincule-o em todas: a IA escolhe pela conversa e, na dúvida, o painel pergunta.
        </p>
      </div>

      {vinculados.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {vinculados.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-foreground">{v.nome ?? "(grupo sem nome)"}</span>
                <span className="ml-2 text-xs text-foreground/50">{FONTE[v.fonte] ?? v.fonte}</span>
                {v.outrasEmpresas.length ? (
                  <span className="block text-xs text-foreground/60">Também neste grupo: {v.outrasEmpresas.join(", ")}</span>
                ) : null}
              </div>
              <Remover companyId={companyId} vinculoId={v.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-foreground/60">Nenhum grupo vinculado.</p>
      )}

      <div className="flex flex-col gap-2">
        <Input placeholder="Buscar grupo no Digisac (ex.: SOMA + nome)" value={busca} onChange={(e) => {
            setBusca(e.target.value);
            if (e.target.value.trim().length < 2) setResultados([]);
          }}
        />
        {buscando ? <p className="text-xs text-foreground/50">Buscando…</p> : null}
        {erroBusca ? <Alert>{erroBusca}</Alert> : null}
        {resultados.length ? (
          <ul className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {resultados.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm hover:bg-surface-muted">
                <span>
                  {g.nome}
                  {g.ultimaMensagem ? (
                    <span className="ml-2 text-xs text-foreground/50">última conversa {new Date(g.ultimaMensagem).toLocaleDateString("pt-BR")}</span>
                  ) : null}
                </span>
                {jaTem.has(g.id) ? (
                  <span className="text-xs text-success">vinculado</span>
                ) : (
                  <form action={adicionar}>
                    <input type="hidden" name="companyId" value={companyId} />
                    <input type="hidden" name="contactId" value={g.id} />
                    <input type="hidden" name="nome" value={g.nome} />
                    <Button type="submit" variant="secondary" loading={adicionando} className="h-8 px-3 text-xs">
                      Vincular
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {state?.error ? <Alert>{state.error}</Alert> : state?.ok ? <Alert tone="success">{state.ok}</Alert> : null}
    </div>
  );
}
