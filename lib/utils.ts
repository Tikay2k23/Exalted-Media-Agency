import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculateFulfillmentRate(
  completedPosts: number,
  plannedPosts: number,
) {
  if (!plannedPosts) {
    return 0;
  }

  return Math.min(100, Math.round((completedPosts / plannedPosts) * 100));
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatDate(value: Date | string) {
  return format(new Date(value), "MMM d, yyyy");
}

export function formatDateTime(value: Date | string) {
  return format(new Date(value), "MMM d, yyyy 'at' h:mm a");
}

export function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
