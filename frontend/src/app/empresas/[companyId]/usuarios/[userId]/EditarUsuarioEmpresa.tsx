"use client";

import { salvarPermissoesUsuarioEmpresa } from "@/lib/actions/usuarios";
import { EmpresaPermissoesGrid } from "@/components/usuarios/EmpresaPermissoesGrid";
import type { Permissao } from "@/lib/permissoes/catalogo";

export function EditarUsuarioEmpresa({
  userId,
  companyId,
  permissoesDisponiveis,
  permissoesIniciais,
}: {
  userId: string;
  companyId: string;
  permissoesDisponiveis: Permissao[];
  permissoesIniciais: Permissao[];
}) {
  return (
    <EmpresaPermissoesGrid
      permissoesDisponiveis={permissoesDisponiveis}
      permissoesIniciais={permissoesIniciais}
      onSalvar={(permissoes) => salvarPermissoesUsuarioEmpresa(userId, companyId, permissoes)}
    />
  );
}
