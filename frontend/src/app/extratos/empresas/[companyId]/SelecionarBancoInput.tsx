"use client";

import { useMemo, useState } from "react";
import { BANCOS_BRASIL } from "@/lib/bancos-brasil";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function SelecionarBancoInput({
  nomeInicial,
  codigoInicial,
}: {
  nomeInicial?: string;
  codigoInicial?: string | null;
}) {
  const [termo, setTermo] = useState(
    nomeInicial ? `${codigoInicial ? `${codigoInicial} — ` : ""}${nomeInicial}` : "",
  );
  const [aberto, setAberto] = useState(false);
  const [selecionado, setSelecionado] = useState<{ codigo: string; nome: string } | null>(
    nomeInicial && codigoInicial ? { codigo: codigoInicial, nome: nomeInicial } : null,
  );

  const resultados = useMemo(() => {
    const alvo = normalizar(termo.trim());
    if (!alvo || selecionado) return [];
    return BANCOS_BRASIL.filter(
      (b) => b.codigo.includes(alvo) || normalizar(b.nome).includes(alvo),
    ).slice(0, 8);
  }, [termo, selecionado]);

  return (
    <Field label="Banco" htmlFor="banco-busca">
      <div className="relative">
        <Input
          id="banco-busca"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setSelecionado(null);
            setAberto(true);
          }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          placeholder="Digite o código ou nome do banco..."
          autoComplete="off"
          required
        />
        {/* Se o usuário digitar um banco que não está na lista (cooperativa
            local, banco raro...), ainda dá pra salvar com esse texto livre,
            só sem código — não trava o cadastro numa lista incompleta. */}
        <input type="hidden" name="banco" value={selecionado?.nome ?? termo.trim()} />
        <input type="hidden" name="codigoBanco" value={selecionado?.codigo ?? ""} />
        {aberto && termo.trim() && !selecionado && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
            {resultados.length > 0 ? (
              resultados.map((banco) => (
                <button
                  key={banco.codigo}
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelecionado(banco);
                    setTermo(`${banco.codigo} — ${banco.nome}`);
                    setAberto(false);
                  }}
                >
                  <span className="font-mono text-xs text-foreground/50">{banco.codigo}</span>
                  <span className="text-foreground">{banco.nome}</span>
                </button>
              ))
            ) : (
              <div className="px-4 py-2.5 text-xs text-foreground/50">
                Nenhum banco encontrado na lista — pode salvar com esse nome mesmo assim.
              </div>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
