import Link from "next/link";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Selo, STATUS_PEDIDO, FONTE_EMPRESA } from "./status";

export const metadata = { title: "Pedidos de nota — Painel SOMA" };

const FILTROS = [
  { chave: "abertos", rotulo: "Para resolver", status: ["RECEBIDO", "EXTRAINDO", "AGUARDANDO_APROVACAO", "PARCIAL", "ERRO"] },
  { chave: "emitidos", rotulo: "Emitidos", status: ["EMITIDA"] },
  { chave: "descartados", rotulo: "Descartados", status: ["DESCARTADO"] },
  { chave: "todos", rotulo: "Todos", status: null },
] as const;

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function PedidosNotaPage(props: { searchParams: Promise<{ f?: string }> }) {
  await requirePermissao("notas.emitir");
  const { f } = await props.searchParams;
  const filtro = FILTROS.find((x) => x.chave === f) ?? FILTROS[0];

  const supabase = await createClient();
  let q = supabase
    .from("pedidos_nota")
    .select(
      "id, created_at, status, contato_nome, contato_eh_grupo, empresa_fonte, erro, company:companies(legal_name, trade_name), itens:pedido_nota_itens(status, valor)",
    )
    .order("created_at", { ascending: filtro.chave === "abertos" })
    .limit(200);
  if (filtro.status) q = q.in("status", [...filtro.status]);
  const { data: pedidos, error } = await q;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Pedidos de nota</h1>
        <p className="text-sm text-foreground/60">
          Pedidos sinalizados com <code>#nota</code> no Digisac. A IA monta o rascunho; nada é emitido sem aprovação.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTROS.map((x) => (
          <Link
            key={x.chave}
            href={`/admin/pedidos-nota?f=${x.chave}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${x.chave === filtro.chave ? "bg-brand text-brand-foreground" : "text-foreground/70 hover:bg-surface-muted"}`}
          >
            {x.rotulo}
          </Link>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        {error ? (
          <p className="p-6 text-sm text-danger">Não consegui carregar os pedidos: {error.message}</p>
        ) : !pedidos?.length ? (
          <p className="p-6 text-sm text-foreground/60">Nenhum pedido aqui.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-foreground/50">
              <tr>
                <th className="px-4 py-2.5">Quando</th>
                <th className="px-4 py-2.5">Contato</th>
                <th className="px-4 py-2.5">Empresa</th>
                <th className="px-4 py-2.5">Notas</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const empresa = Array.isArray(p.company) ? p.company[0] : p.company;
                const itens = (p.itens ?? []) as { status: string; valor: number | null }[];
                const ativos = itens.filter((i) => i.status !== "DESCARTADO");
                const total = ativos.reduce((s, i) => s + Number(i.valor ?? 0), 0);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-muted/50">
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <Link href={`/admin/pedidos-nota/${p.id}`} className="font-medium text-brand hover:underline">
                        {quando(p.created_at)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      {p.contato_nome ?? "—"}
                      {p.contato_eh_grupo ? <span className="ml-1 text-xs text-foreground/50">(grupo)</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      {empresa ? (
                        <>
                          {empresa.trade_name || empresa.legal_name}
                          {p.empresa_fonte ? <span className="block text-xs text-foreground/50">{FONTE_EMPRESA[p.empresa_fonte]}</span> : null}
                        </>
                      ) : (
                        <span className="text-warning">escolher empresa</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {ativos.length ? `${ativos.length} · ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Selo s={p.status} mapa={STATUS_PEDIDO} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
