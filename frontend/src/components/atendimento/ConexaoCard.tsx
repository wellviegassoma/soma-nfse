"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { useAtendimentoRealtime } from "@/lib/atendimento/useRealtimeChannel";

type Conexao = {
  id: string;
  nome: string;
  tipo: string;
  numero: string | null;
  status: string;
  qr_code: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  DESCONECTADO: "Desconectado",
  PAREANDO: "Pareando",
  CONECTADO: "Conectado",
};

const STATUS_CLASS: Record<string, string> = {
  DESCONECTADO: "text-danger",
  PAREANDO: "text-warning",
  CONECTADO: "text-success",
};

export function ConexaoCard({ conexao: inicial }: { conexao: Conexao }) {
  const [conexao, setConexao] = useState(inicial);

  useAtendimentoRealtime<Conexao>(
    `atendimento-conexao-${inicial.id}`,
    { event: "UPDATE", table: "atendimento_conexoes", filter: `id=eq.${inicial.id}` },
    (payload) => setConexao(payload.new as Conexao),
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-foreground">{conexao.nome}</span>
        <span className={`text-xs font-medium ${STATUS_CLASS[conexao.status] ?? ""}`}>
          {STATUS_LABEL[conexao.status] ?? conexao.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-foreground/55">
        {conexao.numero ? `+${conexao.numero}` : conexao.tipo}
      </p>
      {conexao.status === "PAREANDO" && conexao.qr_code && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada pelo whatsapp-connector, não vale otimização de imagem remota */}
          <img src={conexao.qr_code} alt="QR Code para parear o WhatsApp" className="h-48 w-48" />
          <p className="text-center text-xs text-foreground/55">
            WhatsApp no celular → Aparelhos conectados → escaneie este código.
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-foreground/40">ID: {conexao.id}</p>
    </Card>
  );
}
