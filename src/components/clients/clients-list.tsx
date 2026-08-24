"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Client } from "@/data/clients";

type ClientsListProps = {
  clients: Client[];
};

export function ClientsList({ clients }: ClientsListProps) {
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");

    if (!normalizedQuery) return clients;

    return clients.filter((client) => {
      const animalNames = client.animals.map((animal) => animal.name).join(" ");
      const searchableContent = `${client.firstName} ${client.lastName} ${client.phone} ${animalNames}`
        .toLocaleLowerCase("fr-FR");

      return searchableContent.includes(normalizedQuery);
    });
  }, [clients, query]);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Retrouvez vos propriétaires, leurs coordonnées et tous leurs animaux."
        action={
          <button
            type="button"
            onClick={() => setFeedback("Le formulaire Nouveau client sera ajouté lors d’une prochaine étape.")}
            className="inline-flex items-center rounded-2xl bg-animeo px-5 py-3 font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
          >
            <span aria-hidden="true" className="mr-2 text-xl leading-none">+</span>
            Nouveau client
          </button>
        }
      />

      {feedback ? (
        <div role="status" className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-sm font-bold text-animeo-dark">
          <span>{feedback} Aucune donnée n’est enregistrée pour le moment.</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Fermer le message" className="text-lg leading-none">×</button>
        </div>
      ) : null}

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
              <p className="text-xl font-black leading-none text-animeo-dark">{clients.length}</p>
              <p className="mt-1 text-xs font-bold text-animeo-muted">clients au total</p>
            </div>
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
                  {filteredClients.map((client) => <ClientTableRow key={client.id} client={client} />)}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:hidden">
              {filteredClients.map((client) => <ClientMobileCard key={client.id} client={client} />)}
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
    </>
  );
}

function ClientTableRow({ client }: { client: Client }) {
  return (
    <tr className="transition hover:bg-animeo-bg/70">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <ClientAvatar initials={client.initials} />
          <div>
            <p className="font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</p>
            <p className="mt-0.5 text-xs font-bold text-animeo">Client actif</p>
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
      <td className="px-6 py-4 text-right">
        <ClientLink id={client.id} />
      </td>
    </tr>
  );
}

function ClientMobileCard({ client }: { client: Client }) {
  return (
    <article className="rounded-2xl border border-[#e1ebe8] bg-white p-4">
      <div className="flex items-center gap-3">
        <ClientAvatar initials={client.initials} />
        <div className="min-w-0">
          <h3 className="truncate font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</h3>
          <p className="text-xs font-bold text-animeo">Client actif</p>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <InfoLine label="Téléphone" value={client.phone} />
        <InfoLine label="Email" value={client.email} />
        <InfoLine label="Ville" value={client.city} />
        <InfoLine label={`Animaux (${client.animals.length})`} value={animalNames(client)} />
        <InfoLine label="Dernière consultation" value={client.lastConsultation} />
      </dl>
      <ClientLink id={client.id} fullWidth />
    </article>
  );
}

function ClientAvatar({ initials }: { initials: string }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-sm font-black text-animeo-dark">
      {initials}
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
