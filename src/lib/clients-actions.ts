"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";

export type ClientActionResult = { ok: true } | { ok: false; error: string };

export async function deleteClientAction(clientId: string): Promise<ClientActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer des clients." };
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) return { ok: false, error: "Client introuvable." };

  await prisma.client.delete({ where: { id: clientId } });
  await logAudit({ userId: user.id, action: "CLIENT_DELETED", entityType: "Client", entityId: clientId });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { ok: true };
}

export async function deleteAnimalAction(animalId: string): Promise<ClientActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "DELETE_CLIENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer un animal." };
  }

  const animal = await prisma.animal.findUnique({ where: { id: animalId }, select: { id: true, clientId: true, name: true } });
  if (!animal) return { ok: false, error: "Animal introuvable." };

  await prisma.animal.delete({ where: { id: animalId } });
  await logAudit({ userId: user.id, action: "ANIMAL_DELETED", entityType: "Animal", entityId: animalId, metadata: { clientId: animal.clientId, name: animal.name } });

  revalidatePath(`/dashboard/clients/${animal.clientId}`);
  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard/carte");
  revalidatePath("/dashboard/rappels");

  return { ok: true };
}
