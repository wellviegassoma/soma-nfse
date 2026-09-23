"use client";

import { useState } from "react";
import { convidarUsuario } from "@/lib/actions/usuarios";
import { PermissoesGrid } from "@/components/usuarios/PermissoesGrid";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import type { Permissao } from "@/lib/permissoes/catalogo";

export function NovoUsuarioForm({
  podeEditarGlobais,
  empresasDisponiveis,
  empresaInicialId,
}: {
  podeEditarGlobais: boolean;
  empresasDisponiveis: { id: string; nome: string }[];
  empresaInicialId?: string;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);

  const empresaInicial = empresasDisponiveis.find((e) => e.id === empresaInicialId);

  return (
    <Card className="p-6">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="fullName">
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      </div>

      {erroCadastro && (
        <div className="mb-4">
          <Alert tone="danger">{erroCadastro}</Alert>
        </div>
      )}

      <PermissoesGrid
        podeEditarGlobais={podeEditarGlobais}
        permissoesGlobaisIniciais={[]}
        empresasIniciais={
          empresaInicial
            ? [{ companyId: empresaInicial.id, nome: empresaInicial.nome, permissoes: new Set<Permissao>() }]
            : []
        }
        empresasDisponiveis={empresasDisponiveis}
        textoBotao="Convidar usuário"
        onSalvar={async (permissoesGlobais, empresas) => {
          if (!fullName.trim() || !email.trim()) {
            setErroCadastro("Preencha nome e e-mail antes de salvar.");
            return { error: "Preencha nome e e-mail antes de salvar." };
          }
          setErroCadastro(null);
          const resposta = await convidarUsuario({ email, fullName, permissoesGlobais, empresas });
          if (resposta.error) setErroCadastro(resposta.error);
          return resposta;
        }}
      />
    </Card>
  );
}
