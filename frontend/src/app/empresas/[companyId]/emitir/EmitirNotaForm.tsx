"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { issueNfse } from "@/lib/actions/notas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

type Customer = { id: string; name: string; cpf_cnpj: string | null };
type Service = { id: string; name: string; description: string | null };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function EmitirNotaForm({
  companyId,
  customers,
  services,
}: {
  companyId: string;
  customers: Customer[];
  services: Service[];
}) {
  const [step, setStep] = useState<"form" | "review">("form");
  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [competenceDate, setCompetenceDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );

  const [state, formAction, pending] = useActionState(issueNfse, undefined);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId],
  );

  function handleServiceChange(id: string) {
    setServiceId(id);
    const service = services.find((s) => s.id === id);
    if (service?.description && !description) setDescription(service.description);
  }

  if (state?.success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-2xl text-success">
          ✓
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Nota emitida com sucesso
        </h2>
        <p className="text-sm text-foreground/60">
          {selectedCustomer?.name} · {formatMoney(Number(amount.replace(",", ".")))}
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={`/empresas/${companyId}/notas/${state.dpsId}`}>
            <Button variant="secondary" className="w-full sm:w-auto">
              Ver nota
            </Button>
          </Link>
          <Button
            onClick={() => {
              setStep("form");
              setCustomerId("");
              setServiceId("");
              setAmount("");
              setDescription("");
              window.location.reload();
            }}
            className="w-full sm:w-auto"
          >
            Emitir outra nota
          </Button>
        </div>
      </div>
    );
  }

  if (step === "review") {
    return (
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="serviceId" value={serviceId} />
        <input type="hidden" name="amount" value={amount} />
        <input type="hidden" name="description" value={description} />
        <input type="hidden" name="competenceDate" value={competenceDate} />

        <h2 className="text-sm font-semibold text-foreground/70">Confirme a emissão</h2>

        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Card className="divide-y divide-border p-0">
          <Row label="Tomador" value={selectedCustomer?.name ?? "—"} />
          <Row label="Serviço" value={selectedService?.name ?? "—"} />
          <Row label="Valor" value={formatMoney(Number(amount.replace(",", ".")) || 0)} />
          <Row label="Descrição" value={description || "—"} />
        </Card>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setStep("form")}
            disabled={pending}
          >
            Voltar
          </Button>
          <Button type="submit" loading={pending} className="flex-1">
            Emitir
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Tomador" htmlFor="customerId">
        <Select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">Selecione</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.cpf_cnpj ? ` · ${c.cpf_cnpj}` : ""}
            </option>
          ))}
        </Select>
      </Field>

      {customers.length === 0 && (
        <p className="-mt-2 text-xs text-foreground/50">
          Nenhum tomador cadastrado ainda —{" "}
          <Link
            href={`/empresas/${companyId}/tomadores/novo`}
            className="font-medium text-brand hover:underline"
          >
            cadastre um
          </Link>
          .
        </p>
      )}

      <Field label="Serviço" htmlFor="serviceId">
        <Select
          id="serviceId"
          value={serviceId}
          onChange={(e) => handleServiceChange(e.target.value)}
        >
          <option value="">Selecione</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Valor" htmlFor="amount">
        <Input
          id="amount"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <Field label="Data" htmlFor="competenceDate">
        <Input
          id="competenceDate"
          type="date"
          value={competenceDate}
          onChange={(e) => setCompetenceDate(e.target.value)}
        />
      </Field>

      <Field label="Descrição" htmlFor="description">
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <Button
        type="button"
        size="lg"
        className="mt-2"
        disabled={!customerId || !serviceId || !amount || !description || !competenceDate}
        onClick={() => setStep("review")}
      >
        Continuar
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className="text-foreground/50">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
