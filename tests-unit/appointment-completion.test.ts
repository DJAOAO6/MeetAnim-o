import { test } from "node:test";
import assert from "node:assert/strict";
import { markAppointmentCompleted, undoCompletion } from "../src/lib/appointment-completion";
import type { ScopedPrismaClient } from "../src/lib/db";

/** Une base en mémoire, juste ce qu'il faut : rendez-vous et consultations. */
function fakeDb(appointments: Array<{ id: string; status: string; animalId: string | null }>) {
  const consultations: Array<{ id: number; appointmentId: string | null; animalId: string }> = [];
  const rows = appointments.map((row) => ({ ...row, completedAt: null as Date | null, date: new Date("2026-10-05T00:00:00Z"), serviceName: "Séance", mode: "CABINET", price: 60 }));
  const db = {
    appointment: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: string; completedAt: Date } }) => {
        const row = rows.find((item) => item.id === where.id && item.status === where.status);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((row) => row.id === where.id)!, data),
    },
    consultation: {
      upsert: async ({ where, create }: { where: { appointmentId: string }; create: { appointmentId: string; animalId: string } }) => {
        const existing = consultations.find((item) => item.appointmentId === where.appointmentId);
        if (existing) return existing;
        const created = { id: consultations.length + 1, appointmentId: create.appointmentId, animalId: create.animalId };
        consultations.push(created);
        return created;
      },
      deleteMany: async ({ where }: { where: { appointmentId: string } }) => {
        const before = consultations.length;
        for (let index = consultations.length - 1; index >= 0; index -= 1) if (consultations[index].appointmentId === where.appointmentId) consultations.splice(index, 1);
        return { count: before - consultations.length };
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return { db: db as unknown as ScopedPrismaClient, rows, consultations };
}

test("réaliser deux fois ne crée qu'une consultation", async () => {
  const { db, rows, consultations } = fakeDb([{ id: "a", status: "CONFIRMED", animalId: "rex" }]);
  assert.equal(await markAppointmentCompleted(db, "a"), true);
  assert.equal(await markAppointmentCompleted(db, "a"), false, "déjà réalisé : rien ne se passe");
  assert.equal(rows[0].status, "COMPLETED");
  assert.ok(rows[0].completedAt instanceof Date);
  assert.deepEqual(consultations.map((item) => item.appointmentId), ["a"]);
});

test("une demande en attente ou un rendez-vous annulé ne se réalisent pas", async () => {
  const { db, consultations } = fakeDb([{ id: "p", status: "PENDING", animalId: "rex" }, { id: "c", status: "CANCELLED", animalId: "rex" }]);
  assert.equal(await markAppointmentCompleted(db, "p"), false);
  assert.equal(await markAppointmentCompleted(db, "c"), false);
  assert.equal(consultations.length, 0);
});

test("sans animal rattaché, réalisé sans consultation", async () => {
  const { db, rows, consultations } = fakeDb([{ id: "a", status: "CONFIRMED", animalId: null }]);
  assert.equal(await markAppointmentCompleted(db, "a"), true);
  assert.equal(rows[0].status, "COMPLETED");
  assert.equal(consultations.length, 0);
});

test("annuler après réalisation retire la consultation et la date de réalisation", async () => {
  const { db, rows, consultations } = fakeDb([{ id: "a", status: "CONFIRMED", animalId: "rex" }, { id: "b", status: "CONFIRMED", animalId: "rex" }]);
  await markAppointmentCompleted(db, "a");
  await markAppointmentCompleted(db, "b");
  assert.equal(await undoCompletion(db as unknown as Parameters<typeof undoCompletion>[0], "a"), true);
  assert.deepEqual(consultations.map((item) => item.appointmentId), ["b"], "seule la consultation de ce rendez-vous");
  assert.equal(rows[0].completedAt, null);
});
