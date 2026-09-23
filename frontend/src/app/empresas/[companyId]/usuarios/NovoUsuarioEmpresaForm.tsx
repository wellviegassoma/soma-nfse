"use client";

import { useState } from "react";
import { convidarUsuarioEmpresa } from "@/lib/actions/usuarios";
import { EmpresaPermissoesGrid } from "@/components/usuarios/EmpresaPermissoesGrid";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import type { Permissao } from "@/lib/permissoes/catalogo";

export function NovoUsuarioEmpresaForm({
  companyId,
  permissoesDisponiveis,
}: {
  companyId: string;
  permissoesDisponiveis: Permissao[];
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  if (enviado) {
    return <Alert tone="success">Convite enviado.</Alert>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor="fullNameEmpresa">
          <Input id="fullNameEmpresa" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="E-mail" htmlFor="emailEmpresa">
          <Input
            id="emailEmpresa"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
      </div>

      {erro && <Alert tone="danger">{erro}</Alert>}

      <EmpresaPermissoesGrid
        permissoesDisponiveis={permissoesDisponiveis}
        permissoesIniciais={[]}
        onSalvar={async (permissoes) => {
          if (!fullName.trim() || !email.trim()) {
            setErro("Preencha nome e e-mail antes de salvar.");
            return { error: "Preencha nome e e-mail antes de salvar." };
          }
          setErro(null);
          const resposta = await convidarUsuarioEmpresa({ companyId, email, fullName, permissoes });
          if (resposta.error) {
            setErro(resposta.error);
            return resposta;
          }
          setEnviado(true);
          return { success: true };
        }}
      />
    </div>
  );
}
