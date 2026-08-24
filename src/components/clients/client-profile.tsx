"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimalRecord } from "@/components/clients/animal-record";
import { AnimalSideCards } from "@/components/clients/animal-side-cards";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Animal, Client } from "@/data/clients";

type ClientProfileProps = {
  client: Client;
};

export function ClientProfile({ client }: ClientProfileProps) {
  const [selectedAnimalId, setSelectedAnimalId] = useState(client.animals[0]?.id ?? "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const selectedAnimal = client.animals.find((animal) => animal.id === selectedAnimalId) ?? client.animals[0];

  function showFeedback(message: string) {
    setFeedback(`${message} — simulation locale, aucune donnée n’a été enregistrée.`);
  }

  return (
    <>
      <Link href="/dashboard/clients" className="mb-5 inline-flex items-center gap-1 text-sm font-extrabold text-animeo-muted transition hover:text-animeo">
        <Icon name="arrow" className="h-4 w-4 rotate-180" />
        Retour aux clients
      </Link>

      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        description={`${client.animals.length} animal${client.animals.length > 1 ? "aux" : ""} associé${client.animals.length > 1 ? "s" : ""} à cette fiche propriétaire.`}
      />

      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-animeo-soft text-xl font-black text-animeo-dark">
              {client.initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-black text-animeo-dark">{client.firstName} {client.lastName}</h2>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#e4f5ef] px-3 py-1 text-xs font-extrabold text-[#267668]">
                  <span className="h-2 w-2 rounded-full bg-animeo" />
                  Client actif
                </span>
              </div>
              <div className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <ContactItem icon={<PhoneIcon />} value={client.phone} />
                <ContactItem icon={<MailIcon />} value={client.email} />
                <ContactItem icon={<LocationIcon />} value={client.address} wide />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton label="Modifier" onClick={() => showFeedback("La modification du client sera ajoutée ici")} />
            <ActionButton label="Ajouter un animal" onClick={() => showFeedback("Le formulaire Ajouter un animal sera ajouté ici")} />
            <button
              type="button"
              onClick={() => showFeedback("La création d’un rendez-vous sera ajoutée ici")}
              className="inline-flex items-center rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.18)] transition hover:bg-[#459e90]"
            >
              <span aria-hidden="true" className="mr-2 text-lg leading-none">+</span>
              Nouveau rendez-vous
            </button>
          </div>
        </div>
      </Card>

      {feedback ? (
        <div role="status" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-sm font-bold text-animeo-dark">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Fermer le message" className="text-lg leading-none">×</button>
        </div>
      ) : null}

      {selectedAnimal ? (
        <div className="grid items-start gap-6 2xl:grid-cols-[260px_minmax(0,1fr)_300px]">
          <AnimalSelector
            animals={client.animals}
            selectedAnimalId={selectedAnimal.id}
            onSelect={setSelectedAnimalId}
          />
          <AnimalRecord animal={selectedAnimal} />
          <AnimalSideCards animal={selectedAnimal} onAction={showFeedback} />
        </div>
      ) : (
        <Card className="p-10 text-center">
          <p className="font-extrabold text-animeo-dark">Aucun animal associé à ce client.</p>
        </Card>
      )}
    </>
  );
}

function AnimalSelector({ animals, selectedAnimalId, onSelect }: {
  animals: Animal[];
  selectedAnimalId: string;
  onSelect: (id: string) => void;
}) {
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
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
        {animals.map((animal) => {
          const selected = animal.id === selectedAnimalId;

          return (
            <button
              key={animal.id}
              type="button"
              onClick={() => onSelect(animal.id)}
              aria-pressed={selected}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                selected
                  ? "border-animeo bg-animeo-soft shadow-[0_6px_16px_rgba(79,175,159,0.12)]"
                  : "border-[#e3ece9] bg-white hover:border-[#a9d5cd]"
              }`}
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl ${animal.avatarBackground}`} role="img" aria-label={`Portrait fictif de ${animal.name}`}>
                {animal.avatar}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold text-animeo-dark">{animal.name}</span>
                <span className="mt-0.5 block truncate text-xs font-semibold text-animeo-muted">{animal.species} · {animal.breed}</span>
              </span>
              <Icon name="arrow" className={`h-4 w-4 shrink-0 ${selected ? "text-animeo" : "text-[#a8b3b6]"}`} />
            </button>
          );
        })}
      </div>
    </Card>
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
