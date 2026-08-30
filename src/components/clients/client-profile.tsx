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
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { hasPermission } from "@/lib/auth/permissions";
import { deleteAnimalAction, deleteClientAction, updateClientAction, type ClientContactInput } from "@/lib/clients-actions";
import { notify } from "@/lib/notify";
import type { Animal, Client } from "@/data/clients";

type ClientProfileProps = {
  client: Client;
};

const animalPhotosStorageKey = "animeo-animal-photos-v1";

function animalPhotoKey(clientId: string, animalId: string) {
  return `${clientId}:${animalId}`;
}

export function ClientProfile({ client }: ClientProfileProps) {
  const { openNewAppointment } = useAppointments();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const canDelete = hasPermission(currentUser, "DELETE_CLIENTS");
  const [clientInfo, setClientInfo] = useState(client);
  const [animals, setAnimals] = useState(client.animals);
  const [selectedAnimalId, setSelectedAnimalId] = useState(client.animals[0]?.id ?? "");
  const [animalPhotos, setAnimalPhotos] = useState<Record<string, string>>({});
  const [deletingClient, startDeletingClient] = useTransition();
  const [editingClient, setEditingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [addingAnimal, setAddingAnimal] = useState(false);
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

  function deleteClient() {
    if (!window.confirm(`Supprimer définitivement la fiche de ${clientInfo.firstName} ${clientInfo.lastName} et tous ses animaux ? Cette action est irréversible.`)) return;
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
    setAnimals((current) => [...current, created]);
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
    setAnimals((current) => current.map((animal) => (animal.id === updated.id ? updated : animal)));
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
        description={`${animals.length} animal${animals.length > 1 ? "aux" : ""} associé${animals.length > 1 ? "s" : ""} à cette fiche propriétaire.`}
      />

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-animeo-soft text-xl font-black text-animeo-dark">
              {clientInfo.initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-black text-animeo-dark">{clientInfo.firstName} {clientInfo.lastName}</h2>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e4f5ef] px-3 py-1 text-xs font-extrabold text-[#267668]">
                  <span className="h-2 w-2 rounded-full bg-animeo" />
                  Client actif
                </span>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <ContactItem icon={<PhoneIcon />} value={clientInfo.phone} />
                <ContactItem icon={<MailIcon />} value={clientInfo.email} />
                <ContactItem icon={<LocationIcon />} value={clientInfo.address} wide />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton label="Modifier" onClick={() => setEditingClient(true)} />
            <ActionButton label="Ajouter un animal" onClick={() => setAddingAnimal(true)} />
            <button
              type="button"
              onClick={openNewAppointment}
              className="inline-flex items-center rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.18)] transition hover:bg-[#459e90]"
            >
              <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>
              Nouveau rendez-vous
            </button>
            {canDelete ? (
              <button
                type="button"
                disabled={deletingClient}
                onClick={deleteClient}
                className="inline-flex items-center rounded-xl border border-[#f3c9c9] bg-[#fff1f1] px-4 py-2.5 text-sm font-extrabold text-animeo-error transition hover:bg-[#ffe0e0] disabled:opacity-60"
              >
                {deletingClient ? "Suppression…" : "Supprimer le client"}
              </button>
            ) : null}
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
          />
          <AnimalRecord
            animal={selectedAnimal}
            photo={animalPhotos[animalPhotoKey(clientInfo.id, selectedAnimal.id)] ?? selectedAnimal.photo}
            onPhotoChange={(photo) => updateAnimalPhoto(selectedAnimal.id, photo)}
            onAnimalUpdated={handleAnimalUpdated}
          />
          <AnimalSideCards animal={selectedAnimal} onAction={showStubFeedback} />
        </div>
      ) : (
        <Card className="p-10 text-center">
          <p className="font-extrabold text-animeo-dark">Aucun animal associé à ce client.</p>
          <div className="mt-4 flex justify-center">
            <ActionButton label="Ajouter un animal" onClick={() => setAddingAnimal(true)} />
          </div>
        </Card>
      )}

      {editingClient ? (
        <ClientEditModal client={clientInfo} saving={savingClient} onClose={() => setEditingClient(false)} onSave={saveClientInfo} />
      ) : null}

      {addingAnimal ? (
        <AnimalEditModal clientId={clientInfo.id} onClose={() => setAddingAnimal(false)} onSaved={handleAnimalAdded} />
      ) : null}
    </>
  );
}

function AnimalSelector({ animals, clientId, animalPhotos, selectedAnimalId, onSelect, canDelete, onDeleted }: {
  animals: Animal[];
  clientId: string;
  animalPhotos: Record<string, string>;
  selectedAnimalId: string;
  onSelect: (id: string) => void;
  canDelete: boolean;
  onDeleted: (animalId: string) => void;
}) {
  const [deletingId, startDeleting] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function deleteAnimal(animal: Animal) {
    if (!window.confirm(`Supprimer définitivement la fiche de ${animal.name} (historique de consultations et documents inclus) ? Cette action est irréversible.`)) return;
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-animeo-dark">Animaux</h2>
          <p className="mt-0.5 text-xs text-animeo-muted">Sélectionnez une fiche</p>
        </div>
        <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-animeo-soft px-2 text-sm font-black text-animeo-dark">
          {animals.length}
        </span>
      </div>
      {error ? <p role="alert" className="mb-3 rounded-lg bg-[#fff1f1] px-3 py-2 text-xs font-bold text-animeo-error">{error}</p> : null}
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
                  ? "border-animeo bg-animeo-soft shadow-[0_6px_16px_rgba(79,175,159,0.12)]"
                  : "border-[#e3ece9] bg-white hover:border-[#a9d5cd]"
              } ${isDeleting ? "opacity-50" : ""}`}
            >
              <button type="button" onClick={() => onSelect(animal.id)} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br text-2xl ${animal.avatarBackground}`} role="img" aria-label={photo ? `Photo de ${animal.name}` : `Pictogramme de ${animal.name}`}>
                  {photo ? <Image src={photo} alt="" fill unoptimized sizes="48px" className="object-cover" /> : animal.avatar}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold text-animeo-dark">{animal.name}</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-animeo-muted">{animal.species} · {animal.breed}</span>
                </span>
              </button>
              {canDelete ? (
                <button type="button" disabled={Boolean(isDeleting)} onClick={() => deleteAnimal(animal)} title={`Supprimer ${animal.name}`} aria-label={`Supprimer ${animal.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ffe4e4] text-animeo-error ring-1 ring-inset ring-transparent transition hover:bg-[#ffd2d2] hover:ring-animeo-error/40 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100">
                  <TrashIcon />
                </button>
              ) : (
                <Icon name="arrow" className={`h-4 w-4 shrink-0 ${selected ? "text-animeo" : "text-[#a8b3b6]"}`} />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-[#d4e2df] bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo hover:bg-animeo-soft">
      {label}
    </button>
  );
}

function ContactItem({ icon, value, wide = false }: { icon: React.ReactNode; value: string; wide?: boolean }) {
  return (
    <div className={`flex items-start gap-2 text-animeo-muted ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mt-0.5 shrink-0 text-animeo">{icon}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function PhoneIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.12.9.33 1.78.62 2.62a2 2 0 0 1-.45 2.11L8 9.7a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.84.3 1.72.5 2.62.62a2 2 0 0 1 2 2.3Z" /></svg>;
}

function MailIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>;
}

function LocationIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
