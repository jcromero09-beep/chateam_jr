import type { Icon } from "@phosphor-icons/react";

/**
 * Shared shape/types for the dashboard design-system widgets
 * (StatCard, MetricCard, TicketsDonut, ActivityChart).
 *
 * These are TYPE definitions only — the Dashboard page feeds them with
 * real API data. No mock values are exported.
 */

export type Tone = "primary" | "accent" | "success" | "warning" | "neutral";

export interface Kpi {
  label: string;
  value: string | number;
  sublabel: string;
  tone: Tone;
  icon: Icon;
}

export interface Metric {
  label: string;
  value: string | number;
  tone: Tone;
  /** 0–100 progress bar; omit to hide the bar. */
  progress?: number;
  context: string;
}

export interface TicketSlice {
  label: string;
  value: number;
  color: string;
}

export interface ActivityPoint {
  day: string;
  mensajes: number;
  usuarios: number;
}
