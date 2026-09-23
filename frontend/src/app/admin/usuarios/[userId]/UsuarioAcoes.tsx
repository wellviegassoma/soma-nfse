"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reenviarConvite,
  suspenderUsuario,
  reativarUsuario,
  removerAcessos,
} from "@/lib/actions/usuarios";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export function UsuarioAcoes({
  userId,
  email,
  ativo,
}: {
  userId: string;
  email: string | null;
  ativo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mensagem, setMensagem] = useState<{ tipo: "success" | "danger"; texto: string } | null>(null);
  const router = useRouter();

  function acao(fn: () => Promise<{ error?: string; success?: boolean }>, sucesso: string) {
    startTransition(async () => {
      const resposta = await fn();
      if (resposta.error) {
        setMensagem({ tipo: "danger", texto: resposta.error });
      } else {
        setMensagem({ tipo: "success", texto: sucesso });
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {mensagem && <Alert tone={mensagem.tipo}>{mensagem.texto}</Alert>}
      <div className="flex flex-wrap gap-2">
        {email && (
          <Button
            type="button"
            variant="ghost"
            loading={pending}
            onClick={() => acao(() => reenviarConvite(email), "Convite reenviado.")}
          >
            Reenviar convite
          </Button>
        )}
        {ativo ? (
          <Button
            type="button"
            variant="ghost"
            loading={pending}
            onClick={() =>
              acao(() => suspenderUsuario(userId), "Usuário suspenso — perdeu acesso imediatamente.")
            }
          >
            Suspender acesso
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            loading={pending}
            onClick={() => acao(() => reativarUsuario(userId), "Usuário reativado.")}
          >
            Reativar acesso
          </Button>
        )}
        <Button
          type="button"
          variant="danger"
          loading={pending}
          onClick={() => {
            if (!confirm("Remover TODOS os acessos desse usuário (equipe e empresas)?")) return;
            acao(() => removerAcessos(userId), "Todos os acessos foram removidos.");
          }}
        >
          Remover todos os acessos
        </Button>
      </div>
    </div>
  );
}
