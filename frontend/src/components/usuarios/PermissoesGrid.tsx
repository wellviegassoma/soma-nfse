"use client";

import { useMemo, useState, useTransition } from "react";
import {
  MODULOS_EQUIPE,
  MODULO_LABELS,
  PERMISSOES,
  permissoesDoModulo,
  marcarComCascata,
  desmarcarComCascata,
  type Permissao,
} from "@/lib/permissoes/catalogo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

export type EmpresaGrid = {
  companyId: string;
  nome: string;
  permissoes: Set<Permissao>;
};

const PERMISSOES_EMPRESA = Object.values(PERMISSOES).filter(
  (p) => p.escopo === "EMPRESA" || p.escopo === "AMBOS",
);

function CheckboxPermissao({
  info,
  checked,
  disabled,
  onToggle,
}: {
  info: (typeof PERMISSOES)[Permissao];
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-muted",
        disabled && "cursor-not-allowed opacity-50",
        info.irreversivel && checked && "bg-danger-soft/40",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
      />
      <span>
        <span className={cn("block font-medium text-foreground", info.irreversivel && "text-danger")}>
          {info.label}
          {info.irreversivel && " ⚠"}
        </span>
        <span className="block text-xs text-foreground/50">{info.descricao}</span>
      </span>
    </label>
  );
}

function SecaoGlobal({
  permissoes,
  onToggle,
  disabled,
}: {
  permissoes: Set<Permissao>;
  onToggle: (chave: Permissao) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {MODULOS_EQUIPE.map((modulo) => {
        const infos = permissoesDoModulo(modulo).filter((info) => info.escopo !== "EMPRESA");
        if (infos.length === 0) return null;
        return (
          <div key={modulo} className="rounded-xl border border-border p-4">
            <h3 className="mb-2 text-sm font-semibold text-foreground/70">
              {MODULO_LABELS[modulo]}
            </h3>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {infos.map((info) => (
                <CheckboxPermissao
                  key={info.chave}
                  info={info}
                  checked={permissoes.has(info.chave)}
                  disabled={disabled}
                  onToggle={() => onToggle(info.chave)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardEmpresa({
  empresa,
  onToggle,
  onRemover,
}: {
  empresa: EmpresaGrid;
  onToggle: (companyId: string, chave: Permissao) => void;
  onRemover: (companyId: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{empresa.nome}</h3>
        <button
          type="button"
          onClick={() => onRemover(empresa.companyId)}
          className="text-xs font-medium text-danger hover:underline"
        >
          Remover empresa
        </button>
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {PERMISSOES_EMPRESA.map((info) => (
          <CheckboxPermissao
            key={info.chave}
            info={info}
            checked={empresa.permissoes.has(info.chave)}
            onToggle={() => onToggle(empresa.companyId, info.chave)}
          />
        ))}
      </div>
    </div>
  );
}

export function PermissoesGrid({
  permissoesGlobaisIniciais,
  empresasIniciais,
  empresasDisponiveis,
  podeEditarGlobais,
  onSalvar,
  textoBotao = "Salvar permissões",
}: {
  permissoesGlobaisIniciais: Permissao[];
  empresasIniciais: EmpresaGrid[];
  empresasDisponiveis: { id: string; nome: string }[];
  podeEditarGlobais: boolean;
  onSalvar: (
    permissoesGlobais: Permissao[],
    empresas: { companyId: string; permissoes: Permissao[] }[],
  ) => Promise<{ error?: string; success?: boolean; userId?: string }>;
  textoBotao?: string;
}) {
  const [globais, setGlobais] = useState<Set<Permissao>>(new Set(permissoesGlobaisIniciais));
  const [empresas, setEmpresas] = useState<EmpresaGrid[]>(empresasIniciais);
  const [buscaEmpresa, setBuscaEmpresa] = useState("");
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ error?: string; success?: boolean } | null>(null);

  const idsJaAdicionados = useMemo(() => new Set(empresas.map((e) => e.companyId)), [empresas]);
  const sugestoes = useMemo(() => {
    const termo = buscaEmpresa.trim().toLowerCase();
    if (!termo) return [];
    return empresasDisponiveis
      .filter((e) => !idsJaAdicionados.has(e.id) && e.nome.toLowerCase().includes(termo))
      .slice(0, 8);
  }, [buscaEmpresa, empresasDisponiveis, idsJaAdicionados]);

  function toggleGlobal(chave: Permissao) {
    setResultado(null);
    setGlobais((atual) =>
      atual.has(chave) ? desmarcarComCascata(atual, chave) : marcarComCascata(atual, chave),
    );
  }

  function toggleEmpresa(companyId: string, chave: Permissao) {
    setResultado(null);
    setEmpresas((atual) =>
      atual.map((e) =>
        e.companyId !== companyId
          ? e
          : {
              ...e,
              permissoes: e.permissoes.has(chave)
                ? desmarcarComCascata(e.permissoes, chave)
                : marcarComCascata(e.permissoes, chave),
            },
      ),
    );
  }

  function adicionarEmpresa(id: string, nome: string) {
    setResultado(null);
    setBuscaEmpresa("");
    setEmpresas((atual) => [...atual, { companyId: id, nome, permissoes: new Set() }]);
  }

  function removerEmpresa(companyId: string) {
    setResultado(null);
    setEmpresas((atual) => atual.filter((e) => e.companyId !== companyId));
  }

  function salvar() {
    setResultado(null);
    startTransition(async () => {
      const resposta = await onSalvar(
        [...globais],
        empresas.map((e) => ({ companyId: e.companyId, permissoes: [...e.permissoes] })),
      );
      setResultado(resposta);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {resultado?.error && <Alert tone="danger">{resultado.error}</Alert>}
      {resultado?.success && <Alert tone="success">Salvo.</Alert>}

      {podeEditarGlobais && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-foreground/70">Equipe SOMA (acesso global)</h2>
          <SecaoGlobal permissoes={globais} onToggle={toggleGlobal} disabled={false} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground/70">Empresas clientes</h2>
        <div className="mb-3">
          <Input
            value={buscaEmpresa}
            onChange={(e) => setBuscaEmpresa(e.target.value)}
            placeholder="Buscar empresa pra dar acesso..."
            autoComplete="off"
          />
          {sugestoes.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-lg border border-border">
              {sugestoes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => adicionarEmpresa(s.id, s.nome)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  {s.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {empresas.length === 0 ? (
            <p className="text-sm text-foreground/50">Nenhuma empresa vinculada.</p>
          ) : (
            empresas.map((empresa) => (
              <CardEmpresa
                key={empresa.companyId}
                empresa={empresa}
                onToggle={toggleEmpresa}
                onRemover={removerEmpresa}
              />
            ))
          )}
        </div>
      </section>

      <div>
        <Button type="button" loading={pending} onClick={salvar}>
          {textoBotao}
        </Button>
      </div>
    </div>
  );
}
