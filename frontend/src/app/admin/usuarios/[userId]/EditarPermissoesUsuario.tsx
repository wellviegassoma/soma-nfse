"use client";

import { salvarPermissoesUsuario } from "@/lib/actions/usuarios";
import { PermissoesGrid, type EmpresaGrid } from "@/components/usuarios/PermissoesGrid";
import type { Permissao } from "@/lib/permissoes/catalogo";

export function EditarPermissoesUsuario({
  userId,
  podeEditarGlobais,
  permissoesGlobaisIniciais,
  empresasIniciais,
  empresasDisponiveis,
}: {
  userId: string;
  podeEditarGlobais: boolean;
  permissoesGlobaisIniciais: Permissao[];
  empresasIniciais: EmpresaGrid[];
  empresasDisponiveis: { id: string; nome: string }[];
}) {
  return (
    <PermissoesGrid
      podeEditarGlobais={podeEditarGlobais}
      permissoesGlobaisIniciais={permissoesGlobaisIniciais}
      empresasIniciais={empresasIniciais}
      empresasDisponiveis={empresasDisponiveis}
      onSalvar={(permissoesGlobais, empresas) =>
        salvarPermissoesUsuario(userId, permissoesGlobais, empresas)
      }
    />
  );
}
