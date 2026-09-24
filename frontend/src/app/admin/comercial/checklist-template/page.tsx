import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CategoriaForm } from "./CategoriaForm";
import { ToggleCategoriaButton } from "./ToggleCategoriaButton";
import { ItemForm } from "./ItemForm";
import { ToggleItemButton } from "./ToggleItemButton";

export const metadata = { title: "Checklist padrão — Comercial" };

export default async function ChecklistTemplatePage() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const [{ data: categorias }, { data: itens }] = await Promise.all([
    supabase
      .from("comercial_checklist_categorias")
      .select("id, nome, ordem, ativo")
      .order("ordem", { ascending: true }),
    supabase
      .from("comercial_checklist_itens_template")
      .select("id, categoria_id, descricao, ordem, ativo")
      .order("ordem", { ascending: true }),
  ]);

  const itensPorCategoria = new Map<string, typeof itens>();
  for (const item of itens ?? []) {
    const lista = itensPorCategoria.get(item.categoria_id) ?? [];
    lista.push(item);
    itensPorCategoria.set(item.categoria_id, lista);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Checklist padrão — Comercial</h1>
        <p className="text-sm text-foreground/60">
          Categorias e itens copiados pra cada prospect novo (snapshot) — editar aqui não muda o
          checklist de quem já está em andamento.
        </p>
        <Link href="/admin/comercial" className="text-sm font-medium text-foreground/60 hover:underline">
          ← Voltar ao quadro
        </Link>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Nova categoria</h2>
        <CategoriaForm />
      </Card>

      {(categorias ?? []).map((categoria) => (
        <Card key={categoria.id} className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className={`text-sm font-semibold ${categoria.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}>
              {categoria.nome}
            </h2>
            <div className="flex items-center gap-2">
              <CategoriaForm categoria={categoria} compact />
              <ToggleCategoriaButton categoriaId={categoria.id} ativo={categoria.ativo} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {(itensPorCategoria.get(categoria.id) ?? []).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className={item.ativo ? "text-foreground" : "text-foreground/40 line-through"}>
                  {item.descricao}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <ItemForm categoriaId={categoria.id} item={item} compact />
                  <ToggleItemButton itemId={item.id} ativo={item.ativo} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <ItemForm categoriaId={categoria.id} />
          </div>
        </Card>
      ))}
    </div>
  );
}
