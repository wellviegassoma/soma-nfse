"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { moverProspectEtapa } from "@/lib/actions/comercial";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

type Etapa = { id: string; nome: string; cor: string; tipo: string };
type Prospect = {
  id: string;
  nome: string;
  especialidade: string | null;
  cidade: string | null;
  honorario_soma: number | null;
  etapa_id: string;
  responsavelNome: string | null;
};

function formatMoney(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ProspectCardContent({ prospect }: { prospect: Prospect }) {
  const especialidadeECidade = [prospect.especialidade, prospect.cidade].filter(Boolean).join(" · ");
  return (
    <>
      <span className="text-sm font-medium text-foreground">{prospect.nome}</span>
      {especialidadeECidade && (
        <p className="mt-0.5 text-xs text-foreground/50">{especialidadeECidade}</p>
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-foreground/50">
        <span>{formatMoney(prospect.honorario_soma) ?? "—"}</span>
        <span>{prospect.responsavelNome ?? "—"}</span>
      </div>
    </>
  );
}

function DraggableProspectCard({ prospect, podeEditar }: { prospect: Prospect; podeEditar: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prospect.id,
    disabled: !podeEditar,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "touch-none rounded-xl border border-border bg-surface p-3 shadow-sm",
        podeEditar && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
      {...(podeEditar ? { ...listeners, ...attributes } : {})}
    >
      <Link href={`/admin/comercial/${prospect.id}`} className="block hover:underline">
        <ProspectCardContent prospect={prospect} />
      </Link>
    </div>
  );
}

function DroppableColumn({ etapa, children }: { etapa: Etapa; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto rounded-lg p-1.5 transition-colors",
        isOver && "bg-brand/10 ring-2 ring-brand",
      )}
    >
      {children}
    </div>
  );
}

export function KanbanBoard({
  etapas,
  prospects: prospectsIniciais,
  podeEditar,
}: {
  etapas: Etapa[];
  prospects: Prospect[];
  podeEditar: boolean;
}) {
  const [prospects, setProspects] = useState(prospectsIniciais);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // distance de 8px evita que um clique simples (abrir o detalhe pelo Link)
  // seja interpretado como início de arraste.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const porEtapa = new Map<string, Prospect[]>();
  for (const p of prospects) {
    const lista = porEtapa.get(p.etapa_id) ?? [];
    lista.push(p);
    porEtapa.set(p.etapa_id, lista);
  }
  const activeProspect = activeId ? prospects.find((p) => p.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setError(null);
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const prospectId = active.id as string;
    const etapaDestinoId = over.id as string;
    const prospect = prospects.find((p) => p.id === prospectId);
    if (!prospect || prospect.etapa_id === etapaDestinoId) return;

    const etapaDestino = etapas.find((e) => e.id === etapaDestinoId);
    if (!etapaDestino) return;

    // Etapa TERMINAL_GANHO nunca move direto — abre a tela de confirmação
    // que cria a empresa de verdade (mesma regra do menu antigo).
    if (etapaDestino.tipo === "TERMINAL_GANHO") {
      router.push(`/admin/comercial/${prospectId}/confirmar-cliente`);
      return;
    }

    const etapaAnterior = prospect.etapa_id;
    setProspects((prev) => prev.map((p) => (p.id === prospectId ? { ...p, etapa_id: etapaDestinoId } : p)));
    startTransition(() => {
      moverProspectEtapa(prospectId, etapaDestinoId).catch(() => {
        setProspects((prev) => prev.map((p) => (p.id === prospectId ? { ...p, etapa_id: etapaAnterior } : p)));
        setError("Não foi possível mover o prospect. Tente de novo.");
      });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <DndContext
        id="comercial-kanban"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex gap-4 overflow-x-auto pb-4"
          style={{ height: "calc(100vh - 280px)", minHeight: 360 }}
        >
          {etapas.map((etapa) => {
            const cards = porEtapa.get(etapa.id) ?? [];
            return (
              <div key={etapa.id} className="flex w-[85vw] shrink-0 flex-col gap-3 sm:w-72">
                <div
                  className="flex shrink-0 items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: etapa.cor }}
                >
                  <span>{etapa.nome}</span>
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">{cards.length}</span>
                </div>
                <DroppableColumn etapa={etapa}>
                  {cards.map((prospect) => (
                    <DraggableProspectCard key={prospect.id} prospect={prospect} podeEditar={podeEditar} />
                  ))}
                  {cards.length === 0 && (
                    <p className="px-1 text-xs text-foreground/40">Arraste um prospect pra cá.</p>
                  )}
                </DroppableColumn>
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeProspect && (
            <Card className="w-72 rotate-2 p-3 shadow-lg">
              <ProspectCardContent prospect={activeProspect} />
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
