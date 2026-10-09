"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { AnimalEditModal } from "@/components/clients/animal-edit-modal";
import { AnimalRecord } from "@/components/clients/animal-record";
import { AnimalSideCards } from "@/components/clients/animal-side-cards";
import { ClientEditModal } from "@/components/clients/client-edit-modal";
import { ReminderScheduleModal, type ReminderFormValue } from "@/components/reminders/reminder-schedule-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Mail, MapPin, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { hasPermission } from "@/lib/auth/permissions";
import { archiveClientsAction, deleteAnimalAction, deleteClientAction, restoreClientsAction, updateClientAction, upcomingAppointmentsOfClientsAction, type ClientContactInput } from "@/lib/clients-actions";
import { archiveConfirmationMessage, archivedOnLabel } from "@/lib/client-archive";
import { toTelHref } from "@/lib/phone";
import { saveReminderAction } from "@/lib/reminders-actions";
import { notify } from "@/lib/notify";
import type { Animal, Client } from "@/data/clients";
import { hasModule } from "@/lib/modules";
import { pluralizeAnimals } from "@/lib/format";

type ClientProfileProps = {
  client: Client;
  // Présélectionne un animal précis à l'ouverture (ex. lien "Voir la fiche"
  // depuis un arrêt de tournée) — ignoré s'il ne correspond à aucun animal
  // de ce client.
  initialAnimalId?: string;
};

const animalPhotosStorageKey = "animeo-animal-photos-v1";

function animalPhotoKey(clientId: string, animalId: string) {
  return `${clientId}:${animalId}`;
}

export function ClientProfile({ client, initialAnimalId }: ClientProfileProps) {
  const currentModules = useCurrentUser()?.modules ?? [];
  const { openNewAppointment } = useAppointments();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canDelete = hasPermission(currentUser, "DELETE_CLIENTS");
  const [clientInfo, setClientInfo] = useState(client);
  const [animals, setAnimals] = useState(client.animals);
  const [selectedAnimalId, setSelectedAnimalId] = useState(() => {
    if (initialAnimalId && client.animals.some((animal) => animal.id === initialAnimalId)) return initialAnimalId;
    return client.animals[0]?.id ?? "";
  });
  const [animalPhotos, setAnimalPhotos] = useState<Record<string, string>>({});
  const [deletingClient, startDeletingClient] = useTransition();
  const [archiving, startArchiving] = useTransition();
  const [editingClient, setEditingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [addingAnimal, setAddingAnimal] = useState(false);
  const [schedulingReminder, setSchedulingReminder] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const selectedAnimal = animals.find((animal) => animal.id === selectedAnimalId) ?? animals[0];

  useEffect(() => {
    let cancelled = false;
    try {
      const savedPhotos = window.localStorage.getItem(animalPhotosStorageKey);
      if (savedPhotos) {
        const parsedPhotos = JSON.parse(savedPhotos) as Record<string, string>;
        queueMicrotask(() => {
          if (!cancelled) setAnimalPhotos(parsedPhotos);
        });
      }
    } catch {
      // Les pictogrammes par défaut restent affichés si le stockage est indisponible.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  function showStubFeedback(message: string) {
    notify.info(`${message} — simulation locale, aucune donnée n’a été enregistrée.`);
  }

  // Contrairement aux 3 autres boutons de AnimalSideCards (documents,
  // toujours stub — voir showStubFeedback), "Programmer un rappel" a déjà
  // un vrai équivalent fonctionnel sur /dashboard/rappels : on le relie ici
  // au lieu de simuler (AUDIT-PRODUIT-2026-08-30.md, finding P0 §6).
  async function saveReminder(value: ReminderFormValue) {
    setSavingReminder(true);
    const result = await saveReminderAction(value);
    setSavingReminder(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    notify.success(`Un rappel a été programmé pour ${selectedAnimal?.name ?? "cet animal"}.`);
    setSchedulingReminder(false);
    router.refresh();
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [archiveQuestion, setArchiveQuestion] = useState<string | null>(null);

  function deleteClient() {
    setConfirmingDelete(false);
    startDeletingClient(async () => {
      const result = await deleteClientAction(clientInfo.id);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      router.push("/dashboard/clients");
      router.refresh();
    });
  }

  /** Archiver : la fiche sort de la liste, de la recherche et des relances ; rien n'est supprimé. */
  function askToArchive() {
    startArchiving(async () => {
      // Les rendez-vous à venir sont annoncés dans la question : il faut les
      // connaître avant de la poser.
      const upcoming = await upcomingAppointmentsOfClientsAction([clientInfo.id]);
      setArchiveQuestion(archiveConfirmationMessage(1, `${clientInfo.firstName} ${clientInfo.lastName}`, upcoming));
    });
  }

  function archiveClient() {
    setArchiveQuestion(null);
    startArchiving(async () => {
      const name = `${clientInfo.firstName} ${clientInfo.lastName}`;
      const result = await archiveClientsAction([clientInfo.id]);
      if (!result.ok) return void notify.error(result.error);
      setClientInfo((current) => ({ ...current, archivedAt: new Date().toISOString() }));
      notify.success(`${name} est archivé.`, { action: { label: "Annuler", onClick: restoreClient } });
      router.refresh();
    });
  }

  function restoreClient() {
    startArchiving(async () => {
      const result = await restoreClientsAction([clientInfo.id]);
      if (!result.ok) return void notify.error(result.error);
      setClientInfo((current) => ({ ...current, archivedAt: null }));
      notify.success(`${clientInfo.firstName} ${clientInfo.lastName} est de retour dans la liste.`);
      router.refresh();
    });
  }

  async function saveClientInfo(input: ClientContactInput) {
    setSavingClient(true);
    const result = await updateClientAction(clientInfo.id, input);
    setSavingClient(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setClientInfo((current) => ({ ...current, ...result.client, animals: current.animals }));
    notify.success("Fiche client mise à jour.");
    setEditingClient(false);
    router.refresh();
  }

  function handleAnimalAdded(created: Animal) {
    setAnimals((current) => sortAnimals([...current, created]));
    setSelectedAnimalId(created.id);
    notify.success(`${created.name} a été ajouté à la fiche.`);
    setAddingAnimal(false);
    router.refresh();
  }

  function handleAnimalDeleted(animalId: string) {
    setAnimals((current) => {
      const next = current.filter((animal) => animal.id !== animalId);
      if (selectedAnimalId === animalId) setSelectedAnimalId(next[0]?.id ?? "");
      return next;
    });
    router.refresh();
  }

  function handleAnimalUpdated(updated: Animal) {
    setAnimals((current) => sortAnimals(current.map((animal) => (animal.id === updated.id ? updated : animal))));
    notify.success(`Fiche de ${updated.name} mise à jour.`);
    router.refresh();
  }

  function updateAnimalPhoto(animalId: string, photo: string | null) {
    setAnimalPhotos((current) => {
      const next = { ...current };
      const key = animalPhotoKey(client.id, animalId);
      if (photo) next[key] = photo;
      else delete next[key];

      try {
        window.localStorage.setItem(animalPhotosStorageKey, JSON.stringify(next));
        // Le message précise "dans ce navigateur" — une information que le
        // simple changement visuel de la vignette ne transmet pas (la
        // photo n'est pas persistée côté serveur, contrairement au reste
        // de la fiche).
        notify.success(photo ? "Photo de l’animal enregistrée dans ce navigateur." : "Photo supprimée. Le pictogramme par défaut est de nouveau utilisé.");
        return next;
      } catch {
        notify.error("La photo est trop volumineuse pour être enregistrée dans ce navigateur.");
        return current;
      }
    });
  }

  return (
    <>
      <Link href="/dashboard/clients" className="mb-5 inline-flex items-center gap-1 text-sm font-extrabold text-animeo-muted transition hover:text-animeo">
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
        Retour aux clients
      </Link>

      <PageHeader
        title={`${clientInfo.firstName} ${clientInfo.lastName}`}
        description={`${capitalizeFirst(pluralizeAnimals(animals.length))} associé${animals.length > 1 ? "s" : ""} à cette fiche propriétaire.`}
      />

      {clientInfo.archivedAt ? (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-2xl border border-animeo-border bg-animeo-bg px-5 py-4 text-sm text-animeo-dark sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong className="font-extrabold">{archivedOnLabel(clientInfo.archivedAt)}.</strong>{" "}
            Il n’apparaît plus dans la liste, la recherche, la carte ni les relances. Son historique est conservé.
          </p>
          <Button type="button" onClick={restoreClient} disabled={archiving} className="shrink-0">
            {archiving ? "Restauration…" : "Restaurer"}
          </Button>
        </div>
      ) : null}

      <Card className="relative mb-6 p-5 sm:p-6">
        {canDelete ? (
          // Enveloppe : le bouton à icône est déjà `relative` (son infobulle),
          // il ne peut pas être placé en `absolute` lui-même.
          <div className="absolute right-4 top-4 sm:right-5 sm:top-5">
            <IconButton variant="danger" label="Supprimer le client" disabled={deletingClient} onClick={() => setConfirmingDelete(true)} tooltipSide="bottom" tooltipAlign="end">
              <Trash2 aria-hidden="true" className="h-5 w-5" />
            </IconButton>
          </div>
        ) : null}
        {/* pr-16 : la place de la corbeille, pour que ni le nom ni les
            boutons ne passent dessous. */}
        <div className={`flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between ${canDelete ? "pr-14 sm:pr-16" : ""}`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-animeo-soft text-xl font-black text-animeo-dark">
              {clientInfo.initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-black text-animeo-dark">{clientInfo.firstName} {clientInfo.lastName}</h2>
                {clientInfo.archivedAt ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-animeo-bg px-3 py-1 text-xs font-extrabold text-animeo-muted ring-1 ring-inset ring-animeo-border">Archivé</span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full bg-animeo-positive-soft px-3 py-1 text-xs font-extrabold text-animeo-hover">
                    <span className="h-2 w-2 rounded-full bg-animeo" />
                    {clientInfo.status === "Actif" ? "Client actif" : "Client inactif"}
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <ContactItem icon={<Phone aria-hidden="true" className="h-4 w-4" />} value={clientInfo.phone} href={toTelHref(clientInfo.phone) ?? undefined} />
                <ContactItem icon={<Mail aria-hidden="true" className="h-4 w-4" />} value={clientInfo.email} />
                <ContactItem icon={<MapPin aria-hidden="true" className="h-4 w-4" />} value={clientInfo.address} wide />
              </div>
            </div>
          </div>

          {/* Une action pleine, puis les secondaires. « Supprimer le client »
              est une corbeille à l'écart, en haut à droite de la carte. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => openNewAppointment(undefined, { clientId: clientInfo.id, animalId: selectedAnimal?.id })} icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}>
              Nouveau rendez-vous
            </Button>
            <Button type="button" variant="secondary" onClick={() => setEditingClient(true)} icon={<Pencil aria-hidden="true" className="h-4 w-4" />}>Modifier</Button>
            {clientInfo.archivedAt ? null : (
              <Button type="button" variant="secondary" onClick={askToArchive} disabled={archiving}>
                {archiving ? "Archivage…" : "Archiver"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {selectedAnimal ? (
        <div className="grid items-start gap-6 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <AnimalSelector
            animals={animals}
            clientId={clientInfo.id}
            animalPhotos={animalPhotos}
            selectedAnimalId={selectedAnimal.id}
            onSelect={setSelectedAnimalId}
            canDelete={canDelete}
            onDeleted={handleAnimalDeleted}
            onAdd={() => setAddingAnimal(true)}
          />
          <AnimalRecord
            animal={selectedAnimal}
            clientId={clientInfo.id}
            photo={animalPhotos[animalPhotoKey(clientInfo.id, selectedAnimal.id)] ?? selectedAnimal.photo}
            onPhotoChange={(photo) => updateAnimalPhoto(selectedAnimal.id, photo)}
            onAnimalUpdated={handleAnimalUpdated}
          />
          <AnimalSideCards animal={selectedAnimal} onAction={showStubFeedback} onScheduleReminder={() => setSchedulingReminder(true)} showReminder={hasModule(currentModules, "REMINDERS")} />
        </div>
      ) : (
        <Card className="p-10 text-center">
          <p className="font-extrabold text-animeo-dark">Aucun animal associé à ce client.</p>
          <div className="mt-4 flex justify-center">
            <Button type="button" variant="secondary" onClick={() => setAddingAnimal(true)} icon={<Plus aria-hidden="true" className="h-4 w-4" />}>Ajouter un animal</Button>
          </div>
        </Card>
      )}

      {confirmingDelete ? (
        <ConfirmModal
          title="Supprimer ce client ?"
          message={`Supprimer définitivement la fiche de ${clientInfo.firstName} ${clientInfo.lastName} et tous ses animaux ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={deleteClient}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}

      {archiveQuestion ? (
        <ConfirmModal title="Archiver ce client ?" message={archiveQuestion} confirmLabel="Archiver" destructive={false} onConfirm={archiveClient} onClose={() => setArchiveQuestion(null)} />
      ) : null}

      {editingClient ? (
        <ClientEditModal client={clientInfo} saving={savingClient} onClose={() => setEditingClient(false)} onSave={saveClientInfo} />
      ) : null}

      {schedulingReminder && selectedAnimal ? (
        <ReminderScheduleModal
          clients={[{ id: clientInfo.id, name: `${clientInfo.firstName} ${clientInfo.lastName}`, animals: [{ id: selectedAnimal.id, name: selectedAnimal.name, species: selectedAnimal.species }] }]}
          saving={savingReminder}
          onClose={() => setSchedulingReminder(false)}
          onSave={saveReminder}
        />
      ) : null}

      {addingAnimal ? (
        <AnimalEditModal clientId={clientInfo.id} onClose={() => setAddingAnimal(false)} onSaved={handleAnimalAdded} />
      ) : null}
    </>
  );
}

function AnimalSelector({ animals, clientId, animalPhotos, selectedAnimalId, onSelect, canDelete, onDeleted, onAdd }: {
  animals: Animal[];
  clientId: string;
  animalPhotos: Record<string, string>;
  selectedAnimalId: string;
  onSelect: (id: string) => void;
  canDelete: boolean;
  onDeleted: (animalId: string) => void;
  onAdd: () => void;
}) {
  const [deletingId, startDeleting] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Animal | null>(null);

  function deleteAnimal(animal: Animal) {
    setConfirming(null);
    setPendingId(animal.id);
    startDeleting(async () => {
      setError(null);
      const result = await deleteAnimalAction(animal.id);
      if (!result.ok) {
        setError(result.error);
        setPendingId(null);
        return;
      }
      onDeleted(animal.id);
      setPendingId(null);
    });
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-extrabold text-animeo-dark">Animaux · {animals.length}</h2>
          <p className="mt-0.5 text-xs text-animeo-muted">Sélectionnez une fiche</p>
        </div>
        <Button type="button" variant="secondary" onClick={onAdd} icon={<Plus aria-hidden="true" className="h-4 w-4" />}>Ajouter un animal</Button>
      </div>
      {confirming ? (
        <ConfirmModal
          title="Supprimer cet animal ?"
          message={`Supprimer définitivement la fiche de ${confirming.name} (historique de consultations et documents inclus) ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={() => deleteAnimal(confirming)}
          onClose={() => setConfirming(null)}
        />
      ) : null}
      {error ? <p role="alert" className="mb-3 rounded-lg bg-animeo-danger-soft px-3 py-2 text-xs font-bold text-animeo-danger">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
        {animals.map((animal) => {
          const selected = animal.id === selectedAnimalId;
          const photo = animalPhotos[animalPhotoKey(clientId, animal.id)] ?? animal.photo;
          const isDeleting = deletingId && pendingId === animal.id;

          return (
            <div
              key={animal.id}
              className={`flex w-full items-center gap-2 rounded-2xl border p-3 transition ${
                selected
                  ? "border-animeo bg-animeo-soft shadow-[0_6px_16px_color-mix(in_srgb,var(--theme-brand)_12%,transparent)]"
                  : "border-animeo-border-soft bg-white hover:border-animeo-border-strong"
              } ${isDeleting ? "opacity-50" : ""}`}
            >
              <button type="button" onClick={() => onSelect(animal.id)} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br text-2xl ${animal.avatarBackground}`} role="img" aria-label={photo ? `Photo de ${animal.name}` : `Pictogramme de ${animal.name}`}>
                  {photo ? <Image src={photo} alt="" fill unoptimized sizes="48px" className="object-cover" /> : animal.avatar}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold text-animeo-dark">{animal.name}</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-animeo-muted">{animal.species} · {animal.breed}</span>
                  {animal.place ? <span className="mt-0.5 block truncate text-xs font-bold text-animeo">Vit au {animal.place.name}, {animal.place.city}</span> : null}
                </span>
              </button>
              {canDelete ? (
                <IconButton variant="danger" label={`Supprimer ${animal.name}`} tooltip="Supprimer" disabled={Boolean(isDeleting)} onClick={() => setConfirming(animal)} tooltipAlign="end">
                  <Trash2 aria-hidden="true" className="h-5 w-5" />
                </IconButton>
              ) : (
                <Icon name="arrow" className={`h-4 w-4 shrink-0 ${selected ? "text-animeo" : "text-animeo-subtle"}`} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ContactItem({ icon, value, href, wide = false }: { icon: React.ReactNode; value: string; href?: string; wide?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-animeo-muted ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mt-0.5 shrink-0 text-animeo">{icon}</span>
      {href ? (
        <a href={href} className="font-semibold text-animeo-dark hover:text-animeo hover:underline">{value}</a>
      ) : (
        <span className="font-semibold">{value}</span>
      )}
    </div>
  );
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1);
}

/** Animaux par ordre alphabétique, comme le serveur les renvoie (accents et majuscules ignorés). */
function sortAnimals(animals: Animal[]): Animal[] {
  return [...animals].sort((first, second) => first.name.localeCompare(second.name, "fr", { sensitivity: "base" }));
}
