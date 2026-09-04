import type { ImportSummary } from "@/lib/clients-import-actions";

export type RunState =
  | { phase: "running"; done: number; total: number }
  | { phase: "chunk_failed"; done: number; total: number; error: string }
  | { phase: "finishing"; total: number }
  | { phase: "done"; summary: ImportSummary }
  | { phase: "undoing" }
  | { phase: "undone"; deletedClients: number; deletedAnimals: number; preservedClients: number };
