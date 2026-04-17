"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatEnumLabel } from "@/lib/utils";

type PipelineClient = {
  id: string;
  companyName: string;
  clientName: string;
  status: string;
  serviceType: string;
  updatedAt: Date;
  assignedUser: {
    name: string;
  } | null;
};

type StageColumn = {
  id: string;
  name: string;
  color: string;
  clients: PipelineClient[];
};

function toneForStatus(status: string): "sky" | "amber" | "rose" | "emerald" {
  switch (status) {
    case "AT_RISK":
      return "rose";
    case "ON_HOLD":
      return "amber";
    case "COMPLETED":
      return "emerald";
    default:
      return "sky";
  }
}

function ClientCardBody({
  client,
  canMove,
}: {
  client: PipelineClient;
  canMove: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{client.companyName}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-400">
              {client.clientName}
            </p>
          </div>
          {canMove ? (
            <div className="rounded-xl border border-slate-200 p-2 text-slate-400">
              <GripVertical className="h-4 w-4" />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={toneForStatus(client.status)}>{formatEnumLabel(client.status)}</Badge>
          <Badge tone="slate">{formatEnumLabel(client.serviceType)}</Badge>
          <span className="text-xs text-slate-500">
            {client.assignedUser?.name ?? "Unassigned"}
          </span>
        </div>

        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
          Updated {formatDate(client.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

function DraggableClientCard({
  client,
  stageId,
  canMove,
}: {
  client: PipelineClient;
  stageId: string;
  canMove: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: client.id,
    data: { stageId },
    disabled: !canMove,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
      }}
      className={isDragging ? "opacity-60" : ""}
    >
      <div
        className="rounded-2xl border border-transparent"
        {...listeners}
        {...attributes}
      >
        <ClientCardBody client={client} canMove={canMove} />
      </div>
    </div>
  );
}

function StaticClientCard({
  client,
  canMove,
}: {
  client: PipelineClient;
  canMove: boolean;
}) {
  return <ClientCardBody client={client} canMove={canMove} />;
}

function PipelineColumn({
  stage,
  canMove,
}: {
  stage: StageColumn;
  canMove: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[24rem] rounded-[1.75rem] border p-4 transition ${
        isOver ? "border-sky-300 bg-sky-50/60" : "border-slate-200 bg-white/70"
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-slate-900">{stage.name}</h3>
        </div>
        <Badge tone="slate">{stage.clients.length}</Badge>
      </div>

      <div className="space-y-3">
        {stage.clients.map((client) => (
          <DraggableClientCard
            key={client.id}
            client={client}
            stageId={stage.id}
            canMove={canMove}
          />
        ))}
      </div>
    </div>
  );
}

function StaticPipelineColumn({
  stage,
  canMove,
}: {
  stage: StageColumn;
  canMove: boolean;
}) {
  return (
    <div className="min-h-[24rem] rounded-[1.75rem] border border-slate-200 bg-white/70 p-4 transition">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="font-semibold text-slate-900">{stage.name}</h3>
        </div>
        <Badge tone="slate">{stage.clients.length}</Badge>
      </div>

      <div className="space-y-3">
        {stage.clients.map((client) => (
          <StaticClientCard key={client.id} client={client} canMove={canMove} />
        ))}
      </div>
    </div>
  );
}

export function PipelineBoard({
  initialStages,
  canMove,
}: {
  initialStages: StageColumn[];
  canMove: boolean;
}) {
  const router = useRouter();
  const [stages, setStages] = useState(initialStages);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  function moveCardLocally(clientId: string, targetStageId: string) {
    let movedClient: PipelineClient | null = null;

    const nextStages = stages.map((stage) => {
      const remainingClients = stage.clients.filter((client) => {
        if (client.id === clientId) {
          movedClient = client;
          return false;
        }

        return true;
      });

      return {
        ...stage,
        clients: remainingClients,
      };
    });

    return nextStages.map((stage) =>
      stage.id === targetStageId && movedClient
        ? { ...stage, clients: [movedClient, ...stage.clients] }
        : stage,
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!canMove || !event.over) {
      return;
    }

    const clientId = String(event.active.id);
    const targetStageId = String(event.over.id);
    const sourceStageId = String(event.active.data.current?.stageId ?? "");

    if (!targetStageId || sourceStageId === targetStageId) {
      return;
    }

    const previous = stages;
    const next = moveCardLocally(clientId, targetStageId);
    setStages(next);

    startTransition(async () => {
      const response = await fetch("/api/pipeline/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId,
          stageId: targetStageId,
        }),
      });

      if (!response.ok) {
        setStages(previous);
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {isPending ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Saving pipeline changes...
        </div>
      ) : null}

      {isMounted ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
            {stages.map((stage) => (
              <PipelineColumn key={stage.id} stage={stage} canMove={canMove} />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
          {stages.map((stage) => (
            <StaticPipelineColumn key={stage.id} stage={stage} canMove={canMove} />
          ))}
        </div>
      )}
    </div>
  );
}
