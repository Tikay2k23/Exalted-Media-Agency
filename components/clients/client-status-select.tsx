"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Select } from "@/components/ui/select";

const options = [
  { value: "ACTIVE", label: "Active" },
  { value: "AT_RISK", label: "At Risk" },
  { value: "ON_HOLD", label: "On Hold" },
  { value: "COMPLETED", label: "Completed" },
];

export function ClientStatusSelect({
  clientId,
  value,
  disabled,
}: {
  clientId: string;
  value: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
    setError(null);
  }, [value]);

  async function handleChange(nextValue: string) {
    const previousValue = localValue;
    setError(null);
    setLocalValue(nextValue);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ status: nextValue }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setLocalValue(previousValue);
        setError(data?.error ?? "Unable to update status.");
        return;
      }

      router.refresh();
    } catch (updateError) {
      console.error("[client-status-select] Failed to update status.", updateError);
      setLocalValue(previousValue);
      setError("Unable to update status.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={localValue}
          disabled={disabled || isSaving}
          onChange={(event) => {
            void handleChange(event.target.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
