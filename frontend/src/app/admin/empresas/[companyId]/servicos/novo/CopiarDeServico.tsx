"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

/** "Começar a partir de": recarrega a página com ?copiar=<id> (ou vazio). */
export function CopiarDeServico({
  companyId,
  servicos,
  atual,
}: {
  companyId: string;
  servicos: { id: string; nome: string }[];
  atual: string;
}) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
      Começar a partir de
      <Select
        value={atual}
        onChange={(e) => {
          const id = e.target.value;
          router.replace(`/admin/empresas/${companyId}/servicos/novo${id ? `?copiar=${id}` : ""}`);
        }}
      >
        <option value="">Serviço em branco</option>
        {servicos.map((s) => (
          <option key={s.id} value={s.id}>
            Copiar “{s.nome}”
          </option>
        ))}
      </Select>
    </label>
  );
}
