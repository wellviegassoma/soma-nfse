"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { formatarCnpj, formatarDataHora, STATUS_PILL_CLASSES, type StatusTone } from "@/lib/formatters";
import { EmitirGuiaParcelamentoButton } from "./EmitirGuiaParcelamentoButton";

export type LinhaParcelamento = {
  companyId: string;
  nome: string;
  cnpj: string;
  numeroParcelamento: number;
  situacao: string;
  parcelaAtual: number | null;
  parcelasTotal: number | null;
  parcelasEmAtraso: boolean;
  checkedAt: string;
};

function tonePorSituacao(situacao: string): StatusTone {
  if (situacao === "Em parcelamento") return "success";
  if (situacao.toLowerCase().includes("rescind")) return "danger";
  return "neutral";
}

// Primeira tabela client-interativa do app (busca + filtro sem reload) —
// volume esperado aqui é bem menor que "todas as empresas" (só quem tem
// parcelamento aparece), então um componente pequeno e dedicado basta,
// sem precisar de um DataTable genérico.
export function ParcelamentosTable({ linhas, modalidade }: { linhas: LinhaParcelamento[]; modalidade: string }) {
  const [busca, setBusca] = useState("");
  const [situacaoFiltro, setSituacaoFiltro] = useState("Em parcelamento");

  const situacoesDisponiveis = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.situacao))).sort(),
    [linhas],
  );

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const termoDigitos = termo.replace(/\D/g, "");
    return linhas.filter((l) => {
      if (situacaoFiltro !== "Todas" && l.situacao !== situacaoFiltro) return false;
      if (!termo) return true;
      const bateNome = l.nome.toLowerCase().includes(termo);
      const bateCnpj = termoDigitos.length > 0 && l.cnpj.includes(termoDigitos);
      return bateNome || bateCnpj;
    });
  }, [linhas, busca, situacaoFiltro]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full max-w-xs">
          <Input
            placeholder="Buscar por nome ou CNPJ"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select value={situacaoFiltro} onChange={(e) => setSituacaoFiltro(e.target.value)}>
            <option value="Todas">Todas as situações</option>
            {situacoesDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-xs text-foreground/50">
          {linhasFiltradas.length} de {linhas.length}
        </span>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-foreground/50">
              <th className="border-b border-border px-3 py-2 text-left">Nome</th>
              <th className="border-b border-border px-3 py-2 text-left">CNPJ</th>
              <th className="border-b border-border px-3 py-2 text-left">Situação</th>
              <th className="border-b border-border px-3 py-2 text-right">Parcela</th>
              <th className="border-b border-border px-3 py-2 text-center">Em atraso</th>
              <th className="border-b border-border px-3 py-2 text-left">Consultado em</th>
              <th className="border-b border-border px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhasFiltradas.map((linha) => (
              <tr key={`${linha.companyId}-${linha.numeroParcelamento}`}>
                <td className="whitespace-nowrap px-3 py-2">{linha.nome}</td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground/60">
                  {formatarCnpj(linha.cnpj)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_PILL_CLASSES[tonePorSituacao(linha.situacao)]}`}
                  >
                    {linha.situacao}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  {linha.parcelaAtual != null && linha.parcelasTotal != null
                    ? `${linha.parcelaAtual} de ${linha.parcelasTotal}`
                    : "-"}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      linha.parcelasEmAtraso
                        ? STATUS_PILL_CLASSES.danger
                        : STATUS_PILL_CLASSES.success
                    }`}
                  >
                    {linha.parcelasEmAtraso ? "Sim" : "Não"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-foreground/60">
                  {formatarDataHora(linha.checkedAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  <EmitirGuiaParcelamentoButton
                    companyId={linha.companyId}
                    modalidade={modalidade}
                    numeroParcelamento={linha.numeroParcelamento}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
