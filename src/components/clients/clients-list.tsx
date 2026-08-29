"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { ClientEditModal } from "@/components/clients/client-edit-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import { hasPermission } from "@/lib/auth/permissions";
import { createClientAction, deleteClientAction, type ClientContactInput } from "@/lib/clients-actions";
import { notify } from "@/lib/notify";
import type { Animal, Client } from "@/data/clients";

type ClientsListProps = {
  clients: Client[];
  initialQuery?: string;
};

type SpeciesFilter = "Tous" | AnimalSpecies;
type StatusFilter = "Tous les statuts" | "Actif" | "Inactif";
type SortOption = "name" | "recent";

const sortLabels: Record<SortOption, string> = { name: "Nom (A → Z)", recent: "Ajout récent" };

export function ClientsList({ clients, initialQuery = "" }: ClientsListProps) {
  const currentUser = useCurrentUser();
  const canDelete = hasPermission(currentUser, "DELETE_CLIENTS");
  const router = useRouter();

  const [localClients, setLocalClients] = useState(clients);
  const [query, setQuery] = useState(initialQuery);
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("Tous");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous les statuts");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [creatingClient, setCreatingClient] = useState(false);
  const [savingClient, setSavingClient] = useState(false);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");

    const filtered = localClients.filter((client) => {
      const animalNames = client.animals.map((animal) => animal.name).join(" ");
      const searchableContent = `${client.firstName} ${client.lastName} ${client.phone} ${animalNames}`.toLocaleLowerCase("fr-FR");
      const matchesQuery = !normalizedQuery || searchableContent.includes(normalizedQuery);
      const matchesSpecies = speciesFilter === "Tous" || client.animals.some((animal) => animal.species === speciesFilter);
      const matchesStatus = statusFilter === "Tous les statuts" || client.status === statusFilter;
      return matchesQuery && matchesSpecies && matchesStatus;
    });

    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((first, second) => `${first.lastName} ${first.firstName}`.localeCompare(`${second.lastName} ${second.firstName}`, "fr"));
    } else {
      sorted.sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
    }

    return sorted;
  }, [localClients, query, speciesFilter, statusFilter, sortBy]);

  function handleDeleted(clientId: string, label: string) {
    setLocalClients((current) => current.filter((client) => client.id !== clientId));
    notify.success(`${label} a été supprimé.`);
    router.refresh();
  }

  async function saveNewClient(input: ClientContactInput) {
    setSavingClient(true);
    const result = await createClientAction(input);
    setSavingClient(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setLocalClients((current) => [result.client, ...current]);
    notify.success(`${result.client.firstName} ${result.client.lastName} a été ajouté.`);
    setCreatingClient(false);
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Retrouvez vos propriétaires, leurs coordonnées et tous leurs animaux."
        action={
          <button
            type="button"
            onClick={() => setCreatingClient(true)}
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
          >
            <span aria-hidden="true" className="mr-2 text-xl leading-none">+</span>
            Nouveau client
          </button>
        }
      />

      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <label className="relative block flex-1 md:max-w-xl">
            <span className="sr-only">Rechercher un client</span>
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, animal ou téléphone…"
              className="h-12 w-full rounded-2xl border border-[#d9e5e2] bg-animeo-bg pl-11 pr-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white"
            />
          </label>

          <div className="flex items-center gap-3 rounded-2xl bg-animeo-soft px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-animeo-dark">
              <Icon name="clients" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-black leading-none text-animeo-dark">{localClients.length}</p>
              <p className="mt-1 text-xs font-bold text-animeo-muted">clients au total</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[#e5eeeb] pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Espèce</span>
            <div className="flex flex-wrap gap-1.5">
              {(["Tous", ...animalSpeciesList] as SpeciesFilter[]).map((filter) => (
                <button key={filter} type="button" onClick={() => setSpeciesFilter(filter)} aria-pressed={speciesFilter === filter} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${speciesFilter === filter ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-muted">
              Statut
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                <option>Tous les statuts</option>
                <option>Actif</option>
                <option>Inactif</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-muted">
              Trier par
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="h-10 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e5eeeb] px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-extrabold text-animeo-dark">Liste des propriétaires</h2>
            <p className="mt-0.5 text-sm text-animeo-muted">
              {filteredClients.length} résultat{filteredClients.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {filteredClients.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead className="bg-[#fbfdfc] text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
                  <tr>
                    <th className="px-6 py-3.5">Client</th>
                    <th className="px-4 py-3.5">Coordonnées</th>
                    <th className="px-4 py-3.5">Ville</th>
                    <th className="px-4 py-3.5">Animaux</th>
                    <th className="px-4 py-3.5">Dernière consultation</th>
                    <th className="px-6 py-3.5 text-right"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f0]">
                  {filteredClients.map((client) => <ClientTableRow key={client.id} client={client} canDelete={canDelete} onDeleted={handleDeleted} />)}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:hidden">
              {filteredClients.map((client) => <ClientMobileCard key={client.id} client={client} canDelete={canDelete} onDeleted={handleDeleted} />)}
            </div>
          </>
        ) : (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
              <Icon name="clients" className="h-7 w-7" />
            </div>
            <h3 className="mt-4 font-extrabold text-animeo-dark">Aucun client trouvé</h3>
            <p className="mt-1 text-sm text-animeo-muted">Essayez un autre nom, animal ou numéro de téléphone.</p>
          </div>
        )}
      </Card>

      {creatingClient ? (
        <ClientEditModal saving={savingClient} onClose={() => setCreatingClient(false)} onSave={saveNewClient} />
      ) : null}
    </>
  );
}

function useDeleteClient(client: Client, onDeleted: (clientId: string, label: string) => void) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function deleteClient() {
    const label = `${client.firstName} ${client.lastName}`;
    if (!window.confirm(`Supprimer définitivement la fiche de ${label} et tous ses animaux ? Cette action est irréversible.`)) return;
    startTransition(async () => {
      setError(null);
      const result = await deleteClientAction(client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDeleted(client.id, label);
    });
  }

  return { deleteClient, pending, error };
}

function ClientTableRow({ client, canDelete, onDeleted }: { client: Client; canDelete: boolean; onDeleted: (clientId: string, label: string) => void }) {
  const { deleteClient, pending, error } = useDeleteClient(client, onDeleted);

  return (
    <tr className={`transition hover:bg-animeo-bg/70 ${pending ? "opacity-50" : ""}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <AnimalAvatarStack animals={client.animals} />
          <div>
            <p className="font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</p>
            <p className="mt-0.5 text-xs font-bold text-animeo">{client.status === "Actif" ? "Client actif" : "Client inactif"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm font-bold text-animeo-dark">{client.phone}</p>
        <p className="mt-1 text-xs text-animeo-muted">{client.email}</p>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-animeo-muted">{client.city}</td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-animeo-soft text-animeo-dark">
            <Icon name="paw" className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-animeo-dark">
              {client.animals.length} animal{client.animals.length > 1 ? "aux" : ""}
            </p>
            <p className="mt-0.5 max-w-40 truncate text-xs font-semibold text-animeo-muted">
              {animalNames(client)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-animeo-muted">{client.lastConsultation}</td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <ClientLink id={client.id} />
          {canDelete ? <button type="button" disabled={pending} onClick={deleteClient} title="Supprimer ce client" aria-label="Supprimer ce client" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff1f1] text-animeo-error transition hover:bg-[#ffe0e0] disabled:opacity-50"><TrashIcon /></button> : null}
        </div>
        {error ? <p role="alert" className="mt-1.5 text-right text-[11px] font-bold text-animeo-error">{error}</p> : null}
      </td>
    </tr>
  );
}

function ClientMobileCard({ client, canDelete, onDeleted }: { client: Client; canDelete: boolean; onDeleted: (clientId: string, label: string) => void }) {
  const { deleteClient, pending, error } = useDeleteClient(client, onDeleted);

  return (
    <article className={`rounded-2xl border border-[#e1ebe8] bg-white p-4 ${pending ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-3">
        <AnimalAvatarStack animals={client.animals} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</h3>
          <p className="text-xs font-bold text-animeo">{client.status === "Actif" ? "Client actif" : "Client inactif"}</p>
        </div>
        {canDelete ? <button type="button" disabled={pending} onClick={deleteClient} title="Supprimer ce client" aria-label="Supprimer ce client" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff1f1] text-animeo-error transition hover:bg-[#ffe0e0] disabled:opacity-50"><TrashIcon /></button> : null}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <InfoLine label="Téléphone" value={client.phone} />
        <InfoLine label="Email" value={client.email} />
        <InfoLine label="Ville" value={client.city} />
        <InfoLine label={`Animaux (${client.animals.length})`} value={animalNames(client)} />
        <InfoLine label="Dernière consultation" value={client.lastConsultation} />
      </dl>
      {error ? <p role="alert" className="mt-2 text-xs font-bold text-animeo-error">{error}</p> : null}
      <ClientLink id={client.id} fullWidth />
    </article>
  );
}

function AnimalAvatarStack({ animals }: { animals: Animal[] }) {
  if (animals.length === 0) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-bg text-animeo-muted">
        <Icon name="paw" className="h-5 w-5" />
      </span>
    );
  }

  const visible = animals.slice(0, 2);
  const extra = animals.length - visible.length;

  return (
    <div className="flex shrink-0 -space-x-3">
      {visible.map((animal) => (
        <span
          key={animal.id}
          role="img"
          aria-label={animal.photo ? `Photo de ${animal.name}` : `Pictogramme de ${animal.name}`}
          className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-gradient-to-br text-lg shadow-sm ${animal.avatarBackground}`}
        >
          {animal.photo ? <Image src={animal.photo} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : animal.avatar}
        </span>
      ))}
      {extra > 0 ? (
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-white bg-animeo-soft text-xs font-black text-animeo-dark shadow-sm">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

function ClientLink({ id, fullWidth = false }: { id: string; fullWidth?: boolean }) {
  return (
    <Link
      href={`/dashboard/clients/${id}`}
      className={`${fullWidth ? "mt-4 flex w-full" : "inline-flex"} items-center justify-center rounded-xl bg-animeo-soft px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]`}
    >
      Voir la fiche
      <Icon name="arrow" className="ml-1 h-4 w-4" />
    </Link>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-animeo-muted">{label}</dt>
      <dd className="max-w-[60%] break-words text-right font-bold text-animeo-dark">{value}</dd>
    </div>
  );
}

function animalNames(client: Client) {
  return client.animals.map((animal) => animal.name).join(", ") || "Aucun animal";
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-animeo-muted">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
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
