"use client";

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { definirEmpresaPedido, descartarPedido, reextrairPedido } from "@/lib/actions/pedidos-nota";

function Resultado({ s }: { s: { error?: string; ok?: string } | undefined }) {
  if (s?.error) return <Alert>{s.error}</Alert>;
  if (s?.ok) return <Alert tone="success">{s.ok}</Alert>;
  return null;
}

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function EscolherEmpresa({
  pedidoId,
  empresas,
  atual,
}: {
  pedidoId: string;
  empresas: { id: string; nome: string; candidata: boolean }[];
  atual: string | null;
}) {
  const [state, action, pending] = useActionState(definirEmpresaPedido, undefined);
  const [busca, setBusca] = useState("");
  const [escolhida, setEscolhida] = useState(atual ?? empresas.find((e) => e.candidata)?.id ?? "");
  const filtradas = useMemo(() => {
    const b = normalizar(busca.trim());
    const d = busca.replace(/\D/g, "");
    if (!b) return empresas.slice(0, 50);
    return empresas.filter((e) => normalizar(e.nome).includes(b) || (d.length >= 4 && e.nome.replace(/\D/g, "").includes(d))).slice(0, 50);
  }, [busca, empresas]);
  const candidatas = empresas.filter((e) => e.candidata).length;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="companyId" value={escolhida} />
      <div>
        <h2 className="text-sm font-semibold text-foreground">{atual ? "Trocar a empresa" : "De qual empresa é este pedido?"}</h2>
        <p className="text-xs text-foreground/60">
          {candidatas > 1 ? `${candidatas} empresas possíveis aparecem primeiro. ` : ""}
          A escolha fica gravada para este contato/grupo: o próximo #nota dele já vem com a empresa.
        </p>
      </div>
      <Input placeholder="Buscar por nome, código ou CNPJ/CPF" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div className="max-h-60 overflow-y-auto rounded-lg border border-border">
        {filtradas.map((e) => (
          <label key={e.id} className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-muted ${escolhida === e.id ? "bg-brand/10" : ""}`}>
            <input type="radio" name="_empresa" checked={escolhida === e.id} onChange={() => setEscolhida(e.id)} />
            <span>{e.nome}</span>
            {e.candidata ? <span className="text-xs text-brand">sugerida</span> : null}
          </label>
        ))}
        {!filtradas.length ? <p className="px-3 py-2 text-sm text-foreground/60">Nenhuma empresa encontrada.</p> : null}
      </div>
      <div>
        <Button type="submit" loading={pending} disabled={!escolhida || pending}>
          Usar esta empresa e ler o pedido
        </Button>
      </div>
      <Resultado s={state} />
    </form>
  );
}

export function AcoesPedido({ pedidoId, podeReler }: { pedidoId: string; podeReler: boolean }) {
  const [sReler, reler, relendo] = useActionState(reextrairPedido, undefined);
  const [sDesc, descartar, descartando] = useActionState(descartarPedido, undefined);
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {podeReler ? (
          <form action={reler}>
            <input type="hidden" name="pedidoId" value={pedidoId} />
            <Button type="submit" variant="secondary" loading={relendo}>
              Ler de novo
            </Button>
          </form>
        ) : null}
        <form
          action={descartar}
          onSubmit={(e) => {
            const motivo = window.prompt("Motivo do descarte (opcional):");
            if (motivo === null) e.preventDefault();
            else (e.currentTarget.elements.namedItem("motivo") as HTMLInputElement).value = motivo;
          }}
        >
          <input type="hidden" name="pedidoId" value={pedidoId} />
          <input type="hidden" name="motivo" />
          <Button type="submit" variant="ghost" loading={descartando}>
            Descartar pedido
          </Button>
        </form>
      </div>
      <Resultado s={sReler ?? sDesc} />
    </div>
  );
}
