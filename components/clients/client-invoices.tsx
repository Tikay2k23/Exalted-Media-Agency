"use client";

import { BanknoteArrowDown, LoaderCircle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  failureReason: string | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: "emerald" | "amber" | "rose" | "sky" | "slate" }> = {
  DRAFT: { label: "Draft", tone: "slate" },
  SENT: { label: "Awaiting payment", tone: "sky" },
  PARTIALLY_PAID: { label: "Part paid", tone: "amber" },
  PAID: { label: "Paid", tone: "emerald" },
  OVERDUE: { label: "Overdue", tone: "rose" },
  FAILED: { label: "Payment failed", tone: "rose" },
  REFUNDED: { label: "Refunded", tone: "slate" },
  VOID: { label: "Void", tone: "slate" },
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function ClientInvoices({
  clientId,
  invoices,
  canEdit,
}: {
  clientId: string;
  invoices: InvoiceRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [raising, setRaising] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasPaid = invoices.some((invoice) => invoice.status === "PAID");

  function raiseInvoice(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/clients/${clientId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountDue: Number(formData.get("amountDue")),
          dueAt: String(formData.get("dueAt") ?? ""),
          notes: String(formData.get("notes") ?? "").trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't raise this invoice.");
        return;
      }

      setRaising(false);
      router.refresh();
    });
  }

  function submitPayment(invoiceId: string, formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(formData.get("amount")),
          method: String(formData.get("method") ?? "BANK_TRANSFER"),
          status: String(formData.get("status") ?? "SUCCEEDED"),
          reference: String(formData.get("reference") ?? "").trim(),
          failureReason: String(formData.get("failureReason") ?? "").trim(),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "We couldn't record this payment.");
        return;
      }

      setPayingId(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Invoices and payments</CardTitle>
          <CardDescription>
            What has been invoiced, and what has actually landed. Production is gated on a
            paid invoice.
          </CardDescription>
        </div>
        {canEdit && !raising ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setRaising(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Raise invoice
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {invoices.length > 0 && !hasPaid ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            No invoice on this account is paid yet, so the account cannot move into
            production.
          </p>
        ) : null}

        {invoices.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
            No invoice has been raised yet. Raise one, then record the payment when funds
            clear.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoices.map((invoice) => {
              const status = STATUS_LABEL[invoice.status] ?? {
                label: invoice.status,
                tone: "slate" as const,
              };
              const outstanding = invoice.amountDue - invoice.amountPaid;

              return (
                <li key={invoice.id} className="space-y-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {invoice.invoiceNumber} · {invoice.currency}{" "}
                        {invoice.amountDue.toLocaleString()}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {invoice.status === "PAID"
                          ? `Paid in full${invoice.paidAt ? ` on ${formatDate(invoice.paidAt)}` : ""}`
                          : `${invoice.currency} ${outstanding.toLocaleString()} outstanding${
                              invoice.dueAt ? ` · due ${formatDate(invoice.dueAt)}` : ""
                            }`}
                      </p>
                      {invoice.failureReason ? (
                        <p className="mt-1 text-sm text-rose-700">{invoice.failureReason}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {canEdit && invoice.status !== "PAID" && payingId !== invoice.id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="gap-1.5"
                          onClick={() => setPayingId(invoice.id)}
                        >
                          <BanknoteArrowDown className="h-3.5 w-3.5" />
                          Record payment
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {payingId === invoice.id ? (
                    <form
                      action={(formData) => submitPayment(invoice.id, formData)}
                      className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
                    >
                      <Field label="Amount received">
                        <Input
                          name="amount"
                          type="number"
                          min="0.01"
                          step="0.01"
                          defaultValue={outstanding > 0 ? outstanding : undefined}
                          required
                        />
                      </Field>
                      <Field label="Method">
                        <select name="method" defaultValue="BANK_TRANSFER" className={fieldClass}>
                          <option value="BANK_TRANSFER">Bank transfer</option>
                          <option value="CARD">Card</option>
                          <option value="DIRECT_DEBIT">Direct debit</option>
                          <option value="PAYPAL">PayPal</option>
                          <option value="CHEQUE">Cheque</option>
                          <option value="CASH">Cash</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </Field>
                      <Field label="Outcome">
                        <select name="status" defaultValue="SUCCEEDED" className={fieldClass}>
                          <option value="SUCCEEDED">Received</option>
                          <option value="PENDING">Pending / clearing</option>
                          <option value="FAILED">Failed</option>
                        </select>
                      </Field>
                      <Field label="Reference">
                        <Input name="reference" placeholder="Bank reference or receipt" />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="If it failed, why?">
                          <Input
                            name="failureReason"
                            placeholder="Needed only when the outcome is Failed"
                          />
                        </Field>
                      </div>
                      <div className="flex gap-3 sm:col-span-2">
                        <Button type="submit" disabled={isPending} className="gap-2">
                          {isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <BanknoteArrowDown className="h-4 w-4" />
                          )}
                          Save payment
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setPayingId(null)}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {raising ? (
          <form
            action={raiseInvoice}
            className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2"
          >
            <Field label="Amount">
              <Input name="amountDue" type="number" min="0" step="0.01" required />
            </Field>
            <Field label="Due date">
              <Input name="dueAt" type="date" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input name="notes" placeholder="What this invoice covers" />
              </Field>
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <Button type="submit" disabled={isPending} className="gap-2">
                {isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Raise invoice
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRaising(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
