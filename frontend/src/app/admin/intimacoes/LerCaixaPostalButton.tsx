"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { lerCaixaPostalAgora } from "@/lib/actions/caixa-postal";

type Empresa = { id: string; nome: string };

// Leitura manual (fora dos horários do cron): uma empresa por chamada, para
// não haver uma requisição longa demais. Só a LISTA — não dá ciência — mas
// cada empresa é uma consulta paga ao Integra Contador (o serviço guarda 1h).
export function LerCaixaPostalButton({ empresas, rotulo }: { empresas: Empresa[]; rotulo: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState({ i: 0, nome: "" });
  const [resumo, setResumo] = useState<{ ok: number; novas: number; falhas: { nome: string; erro: string }[] } | null>(null);

  async function rodar() {
    setConfirmando(false);
    setRodando(true);
    setResumo(null);
    let ok = 0;
    let novas = 0;
    const falhas: { nome: string; erro: string }[] = [];
    let i = 0;
    const trabalhador = async () => {
      while (i < empresas.length) {
        const e = empresas[i++];
        setProgresso({ i, nome: e.nome });
        try {
          const r = await lerCaixaPostalAgora(e.id);
          if (r.ok) {
            ok += 1;
            novas += r.novas;
          } else falhas.push({ nome: e.nome, erro: r.erro });
        } catch {
          falhas.push({ nome: e.nome, erro: "falha de rede" });
        }
      }
    };
    await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
    setResumo({ ok, novas, falhas });
    setRodando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {confirmando ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-foreground/70">
          <span>
            {empresas.length} consultas pagas ao Integra Contador (≈ R$ {(empresas.length * 0.24).toFixed(2).replace(".", ",")} na
            faixa 1). Não dá ciência.
          </span>
          <Button type="button" size="md" onClick={rodar}>
            Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" loading={rodando} onClick={() => setConfirmando(true)} disabled={!empresas.length}>
          {rodando ? `Lendo ${progresso.i}/${empresas.length}…` : rotulo}
        </Button>
      )}
      {rodando && <p className="text-xs text-foreground/50">{progresso.nome}</p>}
      {resumo && (
        <p className="text-xs text-foreground/70">
          {resumo.ok} lida(s), {resumo.novas} mensagem(ns) nova(s) na fila
          {resumo.falhas.length ? `, ${resumo.falhas.length} com erro (lista no fim da página)` : ""}.
        </p>
      )}
    </div>
  );
}
