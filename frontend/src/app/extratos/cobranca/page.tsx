import Link from "next/link";
import { requireUser, temPermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarCobranca, responsaveisContabeis } from "@/lib/extratos-cobranca";
import { nomeCompetencia } from "@/lib/extratos-cobranca-mensagem";
import { CobrancaLista } from "./CobrancaLista";
import { ReguaCard } from "./ReguaCard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { executarRegua } from "@/lib/extratos-regua";

export const metadata = { title: "Extratos — Cobrança" };

export default async function CobrancaExtratosPage(props: PageProps<"/extratos/cobranca">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const responsaveis = await responsaveisContabeis();

  const competencia =
    typeof sp.competencia === "string" && /^\d{4}-\d{2}$/.test(sp.competencia) ? sp.competencia : mesAnteriorBrasilia();
  const incluirAnteriores = sp.anteriores === "1";
  // Padrão: a carteira de quem está vendo, se tiver; senão todas.
  const responsavelParam = typeof sp.responsavel === "string" ? sp.responsavel : null;
  const responsavelId =
    responsavelParam === "todos"
      ? null
      : responsavelParam && responsaveis.some((r) => r.id === responsavelParam)
        ? responsavelParam
        : responsaveis.some((r) => r.id === user.id)
          ? user.id
          : null;

  const [empresas, podeEnviar, cfg, previaRegua] = await Promise.all([
    carregarCobranca({ responsavelId, competencia, incluirAnteriores }),
    temPermissao("extratos.editar"),
    createClient().then((db) =>
      db.from("extrato_regua_config").select("ativa, dia_cobranca, dia_lembrete, alterado_por, updated_at").eq("id", true).maybeSingle().then((r) => r.data),
    ),
    executarRegua({ previa: true }).catch(() => null),
  ]);
  const alteradoPor = cfg?.alterado_por
    ? await createAdminClient().from("profiles").select("full_name, email").eq("id", cfg.alterado_por).single().then((r) => (r.data ? ((r.data.full_name || r.data.email) as string) : null))
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/extratos" className="text-xs text-brand underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Cobrança de extratos</h1>
        <p className="text-sm text-foreground/60">
          Empresas da carteira com extrato de {nomeCompetencia(competencia)} pendente. A mensagem vai para o grupo do
          WhatsApp da empresa pelo Digisac.
        </p>
      </div>

      <ReguaCard
        inicial={{
          ativa: cfg?.ativa ?? false,
          diaCobranca: cfg?.dia_cobranca ?? 3,
          diaLembrete: cfg?.dia_lembrete ?? 8,
          alteradoPor,
          alteradoEm: cfg?.updated_at ?? null,
        }}
        podeEditar={podeEnviar}
        previa={{
          tipo: previaRegua && "tipo" in previaRegua ? (previaRegua.tipo ?? null) : null,
          quantidade: previaRegua?.itens.length ?? 0,
          motivo: previaRegua?.motivo ?? null,
        }}
      />

      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-56 flex-col gap-1 text-xs text-foreground/60">
            Responsável pela contabilidade
            <Select name="responsavel" defaultValue={responsavelId ?? "todos"} className="h-10 text-sm">
              <option value="todos">Todos</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome} ({r.empresas})
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-foreground/60">
            Competência
            <Input type="month" name="competencia" defaultValue={competencia} className="h-10 w-44" />
          </label>
          <label className="flex h-10 items-center gap-2 text-sm text-foreground/80">
            <input type="checkbox" name="anteriores" value="1" defaultChecked={incluirAnteriores} />
            Incluir meses anteriores em aberto
          </label>
          <Button type="submit" variant="secondary">
            Filtrar
          </Button>
        </form>
        <p className="mt-2 text-xs text-foreground/50">
          Meses anteriores só entram para contas com data de início do controle preenchida (em Gerenciar contas).
        </p>
      </Card>

      <CobrancaLista
        empresas={empresas}
        competencia={competencia}
        incluirAnteriores={incluirAnteriores}
        podeEnviar={podeEnviar}
      />
    </div>
  );
}
