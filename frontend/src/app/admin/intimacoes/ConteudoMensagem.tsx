"use client";

import { useState, useTransition } from "react";
import { abrirConteudo } from "@/lib/actions/caixa-postal";

// Ler o conteúdo pela API DÁ CIÊNCIA da intimação (igual a abrir no e-CAC).
// Por isso: confirmação explícita, com o aviso certo para cada caso. Depois
// da primeira leitura o texto vem do banco — sem custo e sem chamar a Receita.
export function ConteudoMensagem({
  mensagemId,
  corpo: corpoSalvo,
  lidoPor,
  jaTemCiencia,
  cienciaAutomatica,
  doDec = false,
}: {
  mensagemId: string;
  corpo: string | null;
  lidoPor: string | null;
  jaTemCiencia: boolean;
  cienciaAutomatica: string | null; // dd/mm/aaaa, quando ainda não houve ciência
  doDec?: boolean; // DeC da SEFAZ-RJ: não dá para abrir só esta pelo SOMA
}) {
  const [corpo, setCorpo] = useState(corpoSalvo);
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function ler() {
    setErro(null);
    iniciar(async () => {
      const r = await abrirConteudo(mensagemId);
      if (r.ok) {
        setCorpo(r.corpo);
        setAberto(true);
        setConfirmando(false);
      } else setErro(r.erro);
    });
  }

  const link = "rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground/80 hover:bg-surface-muted";

  if (corpo) {
    return (
      <div className="mt-2">
        <button type="button" onClick={() => setAberto((v) => !v)} className={link}>
          {aberto ? "Esconder conteúdo" : "Ver conteúdo"}
        </button>
        {aberto && (
          <div className="mt-2 rounded-lg border border-border bg-surface-muted/60 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{corpo}</p>
            {lidoPor && <p className="mt-2 text-xs text-foreground/50">{lidoPor}</p>}
          </div>
        )}
      </div>
    );
  }

  if (doDec) {
    // A Infosimples só abre as não lidas todas de uma vez (dando ciência de
    // todas) — então aqui não há botão: quem for tratar abre no DeC.
    return (
      <p className="mt-2 text-xs text-foreground/60">
        Conteúdo no DeC da SEFAZ-RJ. Abrir lá dá ciência; o SOMA mostra o texto depois que a mensagem for lida.
      </p>
    );
  }

  return (
    <div className="mt-2">
      {!confirmando ? (
        <button type="button" onClick={() => setConfirmando(true)} className={link}>
          Ler conteúdo…
        </button>
      ) : (
        <div
          className={
            jaTemCiencia
              ? "rounded-lg border border-border bg-surface-muted/60 p-3 text-xs text-foreground/80"
              : "rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger"
          }
        >
          {jaTemCiencia ? (
            <p>
              Esta mensagem <strong>já tem ciência</strong>, então ler aqui não muda nenhum prazo. É uma consulta paga ao
              Integra Contador (≈ R$ 0,24) e o texto fica guardado para a equipe.
            </p>
          ) : (
            <p>
              <strong>Ler o conteúdo dá ciência da intimação hoje e o prazo começa a contar</strong>, igual a abrir no
              e-CAC.
              {cienciaAutomatica ? ` Sem abrir, a ciência só aconteceria em ${cienciaAutomatica}.` : ""} Só confirme se
              for tratar agora. Fica registrado no histórico que você deu ciência pelo SOMA.
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={ler}
              disabled={pendente}
              className={
                jaTemCiencia
                  ? "h-8 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground disabled:opacity-50"
                  : "h-8 rounded-md bg-danger px-3 text-xs font-medium text-white disabled:opacity-50"
              }
            >
              {pendente ? "Lendo…" : jaTemCiencia ? "Ler conteúdo" : "Dar ciência e ler"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pendente}
              className="h-8 rounded-md border border-border bg-surface px-3 text-xs font-medium text-foreground/80"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1 text-xs text-danger">{erro}</p>}
    </div>
  );
}
