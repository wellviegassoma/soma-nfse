"use client";

import { useEffect, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { revelarSenhaGovbrAction, salvarSenhaGovbrAction } from "@/lib/actions/irpf";

/**
 * Senha do gov.br do contribuinte (cifrada no banco). Revelar mostra a senha
 * por 30 segundos e fica registrado na auditoria (quem e quando).
 */
export function AcessoGovbr({
  contribuinteId,
  cpf,
  temSenha,
  atualizadaEm,
  atualizadaPor,
}: {
  contribuinteId: string;
  cpf: string;
  temSenha: boolean;
  atualizadaEm: string | null;
  atualizadaPor: string | null;
}) {
  const [revelada, setRevelada] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!revelada) return;
    const t = setTimeout(() => setRevelada(null), 30_000);
    return () => clearTimeout(t);
  }, [revelada]);

  const copiar = async (texto: string, rotulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setMsg(`${rotulo} copiado.`);
    } catch {
      setMsg("Não foi possível copiar.");
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground/70">Acesso gov.br</div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground/55">Usuário (CPF)</span>
        <button type="button" className="font-mono text-foreground hover:text-brand" onClick={() => copiar(cpf, "CPF")} title="Copiar">
          {cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-foreground/55">Senha</span>
        {revelada ? (
          <button type="button" className="font-mono text-foreground hover:text-brand" onClick={() => copiar(revelada, "Senha")} title="Copiar">
            {revelada}
          </button>
        ) : temSenha ? (
          <span className="font-mono text-foreground/60">••••••••</span>
        ) : (
          <span className="text-foreground/40">não cadastrada</span>
        )}
      </div>
      {temSenha && atualizadaEm && (
        <div className="text-[11px] text-foreground/45">
          Atualizada em {new Date(atualizadaEm).toLocaleDateString("pt-BR")}
          {atualizadaPor ? ` por ${atualizadaPor}` : ""}
        </div>
      )}

      {editando ? (
        <div className="flex flex-col gap-2">
          <Input
            type="text"
            autoComplete="off"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Nova senha do gov.br"
            className="h-10 font-mono text-sm"
          />
          <div className="flex gap-2">
            <Button
              className="h-9"
              loading={pending}
              disabled={!nova.trim()}
              onClick={() =>
                start(async () => {
                  const r = await salvarSenhaGovbrAction({ contribuinteId, senha: nova });
                  if ("error" in r) setMsg(r.error);
                  else {
                    setMsg("Senha salva.");
                    setNova("");
                    setEditando(false);
                    setRevelada(null);
                  }
                })
              }
            >
              Salvar
            </Button>
            <Button variant="ghost" className="h-9" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {temSenha && !revelada && (
            <Button
              variant="secondary"
              className="h-9"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await revelarSenhaGovbrAction(contribuinteId);
                  if ("error" in r) setMsg(r.error);
                  else {
                    setRevelada(r.senha);
                    setMsg("Visível por 30 segundos. Clique na senha para copiar.");
                  }
                })
              }
            >
              Revelar
            </Button>
          )}
          <Button variant="secondary" className="h-9" onClick={() => setEditando(true)}>
            {temSenha ? "Trocar senha" : "Cadastrar senha"}
          </Button>
          {temSenha && (
            <Button
              variant="ghost"
              className="h-9 text-danger"
              loading={pending}
              onClick={() => {
                if (!confirm("Apagar a senha do gov.br deste contribuinte?")) return;
                start(async () => {
                  const r = await salvarSenhaGovbrAction({ contribuinteId, senha: "" });
                  setMsg("error" in r ? r.error : "Senha apagada.");
                  setRevelada(null);
                });
              }}
            >
              Apagar
            </Button>
          )}
        </div>
      )}
      <p className="text-[11px] text-foreground/40">A senha fica cifrada. Cada vez que alguém revela, o sistema registra quem e quando.</p>
      {msg && <span className="text-xs text-foreground/60">{msg}</span>}
    </Card>
  );
}
