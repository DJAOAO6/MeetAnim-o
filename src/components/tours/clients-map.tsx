"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { SimulatedMap } from "@/components/tours/simulated-map";
import type { AnimalSpecies, MapClient } from "@/data/tours";

type SpeciesFilter = "Tous les clients" | AnimalSpecies;

type ClientsMapProps = {
  clients: MapClient[];
};

const speciesFilters: SpeciesFilter[] = ["Tous les clients", "Chien", "Chat", "Cheval", "NAC"];

export function ClientsMap({ clients }: ClientsMapProps) {
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("Tous les clients");
  const [dueOnly, setDueOnly] = useState(false);
  const [cityFilter, setCityFilter] = useState("Toutes les villes");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");
  const cities = Array.from(new Set(clients.map((client) => client.city))).sort((first, second) => first.localeCompare(second, "fr"));

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return clients.filter((client) => {
      const matchesSpecies = speciesFilter === "Tous les clients" || client.species === speciesFilter;
      const matchesReminder = !dueOnly || client.dueForReminder;
      const matchesCity = cityFilter === "Toutes les villes" || client.city === cityFilter;
      const matchesQuery = !normalizedQuery || `${client.ownerName} ${client.animalName}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      return matchesSpecies && matchesReminder && matchesCity && matchesQuery;
    });
  }, [cityFilter, clients, dueOnly, query, speciesFilter]);

  const selectedClient = filteredClients.find((client) => client.id === selectedId) ?? filteredClients[0];
  const points = filteredClients.map((client) => ({
    id: client.id,
    x: client.position.x,
    y: client.position.y,
    label: client.avatar,
    title: `${client.ownerName} · ${client.animalName} · ${client.city}`,
    accent: client.dueForReminder ? "orange" as const : "green" as const,
  }));

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)] xl:items-end">
          <label className="relative block">
            <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Recherche</span>
            <SearchIcon />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client ou un animal" className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg pl-10 pr-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white" />
          </label>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Espèce</span>
              <div className="flex flex-wrap gap-1.5">
                {speciesFilters.map((filter) => (
                  <button key={filter} type="button" onClick={() => setSpeciesFilter(filter)} aria-pressed={speciesFilter === filter} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${speciesFilter === filter ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>{filter}</button>
                ))}
                <button type="button" onClick={() => setDueOnly((current) => !current)} aria-pressed={dueOnly} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${dueOnly ? "bg-animeo-accent text-animeo-dark" : "bg-[#fff9ec] text-[#a66d16]"}`}>À relancer</button>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="city-filter" className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Ville</label>
              <select id="city-filter" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="h-10 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                <option>Toutes les villes</option>
                {cities.map((city) => <option key={city}>{city}</option>)}
              </select>
              <span className="text-xs font-bold text-animeo-muted">{filteredClients.length} client{filteredClients.length > 1 ? "s" : ""} visible{filteredClients.length > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-extrabold text-animeo-dark">Répartition des clients</h2>
              <p className="mt-0.5 text-xs text-animeo-muted">Cliquez sur un point pour afficher sa fiche</p>
            </div>
            <div className="flex gap-3 text-[10px] font-bold text-animeo-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-animeo" />Client</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-animeo-accent" />À relancer</span>
            </div>
          </div>
          <SimulatedMap
            points={points}
            selectedId={selectedClient?.id}
            onSelect={setSelectedId}
            heightClassName="h-[610px]"
            overlay={selectedClient ? <MapClientPopup client={selectedClient} /> : undefined}
          />
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-6">
          <div className="border-b border-[#e5eeeb] px-5 py-4">
            <h2 className="font-extrabold text-animeo-dark">Clients visibles</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">Sélection synchronisée avec la carte</p>
          </div>
          {filteredClients.length > 0 ? (
            <div className="max-h-[650px] divide-y divide-[#edf2f0] overflow-y-auto">
              {filteredClients.map((client) => (
                <button key={client.id} type="button" onClick={() => setSelectedId(client.id)} className={`flex w-full items-center gap-3 p-4 text-left transition ${selectedClient?.id === client.id ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">{client.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-animeo-dark">{client.ownerName}</span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-animeo-muted">{client.animalName} · {client.species}</span>
                    <span className="mt-1 block truncate text-[10px] text-animeo-muted">{client.city} · {client.lastConsultation}</span>
                  </span>
                  {client.dueForReminder ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-animeo-accent" title="À relancer" /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><Icon name="map" className="mx-auto h-8 w-8 text-animeo-muted" /><p className="mt-3 text-sm font-bold text-animeo-muted">Aucun client ne correspond aux filtres.</p></div>
          )}
        </Card>
      </div>

      <div className="rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-xs font-semibold leading-relaxed text-animeo-dark">
        Simulation V1 : aucun géocodage, rayon kilométrique ou itinéraire réel. Les petits ruminants seront ajoutés seulement en V2.
      </div>
    </div>
  );
}

function MapClientPopup({ client }: { client: MapClient }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_12px_30px_rgba(24,59,69,0.18)] backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-2xl">{client.avatar}</span>
        <div className="min-w-0">
          <h3 className="truncate font-black text-animeo-dark">{client.ownerName}</h3>
          <p className="mt-0.5 text-xs font-extrabold text-animeo">{client.animalName}</p>
          <p className="text-[10px] font-semibold text-animeo-muted">{client.species} · {client.breed}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-[11px]">
        <PopupLine label="Ville" value={client.city} />
        <PopupLine label="Dernière consultation" value={client.lastConsultation} />
        <PopupLine label="Prochain rappel" value={client.nextReminder} />
      </dl>
      <Link href={`/dashboard/clients/${client.clientId}`} className="mt-4 flex w-full items-center justify-center rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#459e90]">Voir la fiche client</Link>
    </div>
  );
}

function PopupLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="text-right font-extrabold text-animeo-dark">{value}</dd></div>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="absolute bottom-3 left-3.5 h-5 w-5 text-animeo-muted"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
