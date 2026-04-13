"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

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
  const [isPending, startTransition] = useTransition();
  const [localValue, setLocalValue] = useState(value);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={localValue}
        disabled={disabled || isPending}
        onChange={(event) => {
          const nextValue = event.target.value;
          setLocalValue(nextValue);

          startTransition(async () => {
            await fetch(`/api/clients/${clientId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ status: nextValue }),
            });

            router.refresh();
          });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      {isPending ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-400" /> : null}
    </div>
  );
}
