// [Fase2·G.0] Helper del design system: merge de clases Tailwind (dedup-safe).
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic, dedup-safe. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
