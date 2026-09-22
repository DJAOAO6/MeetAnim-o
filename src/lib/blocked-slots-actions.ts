"use server";

import { revalidatePath } from "next/cache";
import { currentDb } from "@/lib/organization";
import { requireUser } from "@/lib/auth/dal";

export type BlockedSlot = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
};

function toDate(dateId: string): Date {
  return new Date(`${dateId}T00:00:00.000Z`);
}

function toBlockedSlot(row: { id: string; date: Date; startTime: string; endTime: string; reason: string | null }): BlockedSlot {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    startTime: row.startTime,
    endTime: row.endTime,
    reason: row.reason,
  };
}

export async function getBlockedSlots(): Promise<BlockedSlot[]> {
  const db = await currentDb();
  const rows = await db.blockedSlot.findMany({ orderBy: { date: "asc" } });
  return rows.map(toBlockedSlot);
}

export type CreateBlockedSlotInput = {
  date: string;
  startTime: string;
  endTime: string;
  reason?: string;
};

export type BlockedSlotActionResult = { ok: true; slot: BlockedSlot } | { ok: false; error: string };

export async function createBlockedSlotAction(input: CreateBlockedSlotInput): Promise<BlockedSlotActionResult> {
  const user = await requireUser();
  const db = await currentDb();

  if (input.startTime >= input.endTime) {
    return { ok: false, error: "L’heure de fin doit être après l’heure de début." };
  }

  const conflict = await db.appointment.findFirst({
    where: {
      date: toDate(input.date),
      status: { not: "CANCELLED" },
      start: { gte: input.startTime, lt: input.endTime },
    },
  });
  if (conflict) {
    return { ok: false, error: "Un rendez-vous existe déjà sur cette plage horaire." };
  }

  const row = await db.blockedSlot.create({
    data: {
      date: toDate(input.date),
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason?.trim() || null,
      userId: user.id,
    },
  });

  revalidatePath("/dashboard/agenda");

  return { ok: true, slot: toBlockedSlot(row) };
}

export type DeleteBlockedSlotResult = { ok: true } | { ok: false; error: string };

export async function deleteBlockedSlotAction(id: string): Promise<DeleteBlockedSlotResult> {
  await requireUser();
  const db = await currentDb();
  await db.blockedSlot.delete({ where: { id } });
  revalidatePath("/dashboard/agenda");
  return { ok: true };
}
