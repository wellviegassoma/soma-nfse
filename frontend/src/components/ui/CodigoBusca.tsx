"use client";

import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type OpcaoCodigo = {
  /** Valor gravado (só dígitos). */
  codigo: string;
  /** Código formatado pra leitura (ex.: "04.01.01"). */
  rotulo: string;
  descricao: string;
  /** Linha secundária (ex.: grupo da lista). */
  detalhe?: string;
  /** Palavras extras só pra busca (sinônimos do dia a dia), não exibidas. */
  busca?: string;
};

export type DestaqueCodigo = { codigo: string; nota: string };

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const MAX_RESULTADOS = 60;

/**
 * Campo de código com busca por descrição — a pessoa digita "consulta
 * médica" ou "0401" e escolhe da lista oficial, em vez de ter que saber o
 * código de cor. O valor escolhido vai num <input hidden name={name}>.
 * `destaques` aparecem no topo (ex.: "usado em 11.783 notas dos clientes").
 */
export function CodigoBusca({
  id,
  name,
  value,
  onChange,
  opcoes,
  destaques,
  tituloDestaques = "Mais usados",
  placeholder,
  required,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (codigo: string) => void;
  opcoes: OpcaoCodigo[];
  destaques?: DestaqueCodigo[];
  tituloDestaques?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const listaId = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const porCodigo = useMemo(() => new Map(opcoes.map((o) => [o.codigo, o])), [opcoes]);
  const indice = useMemo(
    () =>
      opcoes.map((o) => ({
        o,
        texto: normalizar(`${o.codigo} ${o.rotulo} ${o.descricao} ${o.detalhe ?? ""} ${o.busca ?? ""}`),
      })),
    [opcoes],
  );

  const selecionada = value ? porCodigo.get(value) : undefined;

  const resultados = useMemo(() => {
    const termos = normalizar(busca).split(/\s+/).filter(Boolean);
    const destaqueOpcoes = (destaques ?? [])
      .map((d) => ({ o: porCodigo.get(d.codigo), nota: d.nota }))
      .filter((d): d is { o: OpcaoCodigo; nota: string } => Boolean(d.o));
    if (termos.length === 0) {
      return { destaque: destaqueOpcoes, demais: opcoes.slice(0, MAX_RESULTADOS).map((o) => ({ o })) };
    }
    const bate = (texto: string) => termos.every((t) => texto.includes(t.replace(/\./g, "")) || texto.includes(t));
    const demais = indice.filter((x) => bate(x.texto)).slice(0, MAX_RESULTADOS).map(({ o }) => ({ o }));
    const codigosDemais = new Set(demais.map((d) => d.o.codigo));
    return {
      destaque: destaqueOpcoes.filter((d) => codigosDemais.has(d.o.codigo)),
      demais,
    };
  }, [busca, destaques, indice, opcoes, porCodigo]);

  const planos = [
    ...resultados.destaque.map((d) => ({ o: d.o, nota: d.nota as string | undefined })),
    ...resultados.demais
      .filter((d) => !resultados.destaque.some((x) => x.o.codigo === d.o.codigo))
      .map((d) => ({ o: d.o, nota: undefined as string | undefined })),
  ];

  function escolher(codigo: string) {
    onChange(codigo);
    setBusca("");
    setAberto(false);
  }

  // Código digitado à mão que não está na lista (ex.: tabela nova do
  // governo) — aceita, mas avisa.
  const digitado = busca.replace(/\D/g, "");
  const aceitaDigitado = digitado.length >= 6 && !porCodigo.has(digitado);

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listaId}
        autoComplete="off"
        required={required && !value}
        placeholder={
          selecionada ? `${selecionada.rotulo} · ${selecionada.descricao}` : value || placeholder
        }
        value={aberto ? busca : selecionada ? `${selecionada.rotulo} · ${selecionada.descricao}` : value}
        onFocus={() => {
          setAberto(true);
          setBusca("");
          setAtivo(0);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => {
          setBusca(e.target.value);
          setAtivo(0);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (!aberto) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((a) => Math.min(a + 1, planos.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (planos[ativo]) escolher(planos[ativo].o.codigo);
            else if (aceitaDigitado) escolher(digitado);
          } else if (e.key === "Escape") {
            setAberto(false);
            inputRef.current?.blur();
          }
        }}
        className="h-11 w-full truncate rounded-lg border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-foreground/60 outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      {aberto && (
        <ul
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {resultados.destaque.length > 0 && (
            <li className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">
              {tituloDestaques}
            </li>
          )}
          {planos.map(({ o, nota }, i) => (
            <li key={o.codigo} role="option" aria-selected={o.codigo === value}>
              {i === resultados.destaque.length && resultados.destaque.length > 0 && (
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-foreground/45">
                  Lista completa
                </div>
              )}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o.codigo)}
                onMouseEnter={() => setAtivo(i)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                  i === ativo && "bg-brand/10",
                  o.codigo === value && "font-medium",
                )}
              >
                <span className="text-foreground">
                  <span className="font-mono text-xs text-foreground/60">{o.rotulo}</span>{" "}
                  {o.descricao}
                </span>
                {(nota || o.detalhe) && (
                  <span className="text-xs text-foreground/50">
                    {nota && <span className="font-medium text-success">{nota}</span>}
                    {nota && o.detalhe && " · "}
                    {o.detalhe}
                  </span>
                )}
              </button>
            </li>
          ))}
          {planos.length === 0 && (
            <li className="px-3 py-2 text-sm text-foreground/50">
              {aceitaDigitado ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(digitado)}
                  className="text-left text-brand hover:underline"
                >
                  Usar o código {digitado} mesmo assim (não está na lista oficial)
                </button>
              ) : (
                "Nada encontrado — tente outra palavra (ex.: “consulta”, “odontologia”, “exame”)."
              )}
            </li>
          )}
          {planos.length === MAX_RESULTADOS && (
            <li className="px-3 py-2 text-xs text-foreground/45">
              Mostrando os primeiros {MAX_RESULTADOS} — digite mais pra refinar.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
