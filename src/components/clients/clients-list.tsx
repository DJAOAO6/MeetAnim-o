"use client";

import { candidateWords, queryWords, scoreMatch } from "@/lib/fuzzy-match";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Upload, UserPlus } from "lucide-react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { NewClientModal } from "@/components/clients/new-client-modal";
import { ClientImportModal } from "@/components/clients/client-import-modal";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { SplitButton } from "@/components/ui/split-button";
import { TextLink } from "@/components/ui/text-link";
import { Icon } from "@/components/ui/icon";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import { hasPermission } from "@/lib/auth/permissions";
import { archiveClientsAction, deleteClientsAction, restoreClientsAction, upcomingAppointmentsOfClientsAction } from "@/lib/clients-actions";
import { archiveConfirmationMessage } from "@/lib/client-archive";
import { notify } from "@/lib/notify";
import type { Animal, Client } from "@/data/clients";
import { hasModule } from "@/lib/modules";
import { pluralizeAnimals } from "@/lib/format";

type ClientsListProps = {
  clients: Client[];
  initialQuery?: string;
  /** Ouvre le formulaire « Nouveau client » à l'arrivée. */
  initialCreating?: boolean;
};

type SpeciesFilter = "Tous" | AnimalSpecies;
// « Archivés » (chantier C5) : les seuls à montrer les fiches archivées,
// qu'aucun autre filtre ne fait réapparaître.
type StatusFilter = "Tous les statuts" | "Actif" | "Inactif" | "Archivés";
type SortOption = "name" | "recent";

const sortLabels: Record<SortOption, string> = { name: "Nom (A → Z)", recent: "Ajout récent" };

export function ClientsList({ clients, initialQuery = "", initialCreating = false }: ClientsListProps) {
  const currentUser = useCurrentUser();
  const canDelete = hasPermission(currentUser, "DELETE_CLIENTS");
  const router = useRouter();

  const [localClients, setLocalClients] = useState(clients);
  // Les créations/suppressions individuelles s'appliquent en optimiste sur
  // localClients (voir plus bas), mais un import en masse ne connaît que des
  // compteurs, pas les fiches elles-mêmes — router.refresh() redonne au
  // Server Component parent des `clients` à jour, qu'il faut resynchroniser
  // ici plutôt que de rester bloqué sur l'état du tout premier rendu.
  // Ajustement pendant le rendu (recommandation React officielle pour "reset
  // un état local quand une prop change") plutôt qu'un effet, qui
  // déclencherait un rendu en cascade évitable.
  const [previousClients, setPreviousClients] = useState(clients);
  if (clients !== previousClients) {
    setPreviousClients(clients);
    setLocalClients(clients);
  }
  const [query, setQuery] = useState(initialQuery);
  // Une nouvelle recherche de l'en-tête (?q=) alors que la liste est déjà
  // affichée : elle remplace le filtre en cours.
  const [previousInitialQuery, setPreviousInitialQuery] = useState(initialQuery);
  if (initialQuery !== previousInitialQuery) {
    setPreviousInitialQuery(initialQuery);
    setQuery(initialQuery);
  }
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("Tous");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tous les statuts");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [creatingClient, setCreatingClient] = useState(initialCreating);
  const [importingClients, setImportingClients] = useState(false);
  // Suppression façon Gmail : jamais de bouton visible sur une fiche. Les
  // cases à cocher elles-mêmes restent masquées tant que le mode sélection
  // n'est pas activé explicitement (bouton "Sélectionner") — pas seulement
  // le bandeau d'action groupée, qui n'apparaît qu'une fois une sélection faite.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Les deux questions de la barre de sélection, posées dans une fenêtre du logiciel.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [archiveQuestion, setArchiveQuestion] = useState<string | null>(null);
  const [deletingSelected, startDeleteSelected] = useTransition();
  const [archiving, startArchiving] = useTransition();
  const archivedCount = localClients.filter((client) => client.archivedAt !== null).length;

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // Mots cherchables de chaque fiche, normalisés une fois par liste : même
  // recherche tolérante que l'en-tête (« helene » trouve « Hélène »).
  const searchIndex = useMemo(
    () => new Map(localClients.map((client) => [client.id, candidateWords([client.firstName, client.lastName, client.city, ...client.animals.map((animal) => animal.name)], [client.phone])])),
    [localClients],
  );

  const filteredClients = useMemo(() => {
    const words = queryWords(query);
    const scores = new Map<string, number>();

    const filtered = localClients.filter((client) => {
      if (words.length > 0) {
        const score = scoreMatch(words, searchIndex.get(client.id) ?? []);
        if (score === 0) return false;
        scores.set(client.id, score);
      }
      const matchesSpecies = speciesFilter === "Tous" || client.animals.some((animal) => animal.species === speciesFilter);
      const matchesStatus = statusFilter === "Archivés"
        ? client.archivedAt !== null
        : client.archivedAt === null && (statusFilter === "Tous les statuts" || client.status === statusFilter);
      return matchesSpecies && matchesStatus;
    });

    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((first, second) => `${first.lastName} ${first.firstName}`.localeCompare(`${second.lastName} ${second.firstName}`, "fr"));
    } else {
      sorted.sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime());
    }
    // Pendant une recherche, les meilleures correspondances d'abord (le tri
    // choisi départage les ex æquo).
    if (words.length > 0) sorted.sort((first, second) => (scores.get(second.id) ?? 0) - (scores.get(first.id) ?? 0));

    return sorted;
  }, [localClients, searchIndex, query, speciesFilter, statusFilter, sortBy]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = filteredClients.map((client) => client.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  function deleteSelected() {
    setConfirmingDelete(false);
    const ids = Array.from(selectedIds);
    startDeleteSelected(async () => {
      const result = await deleteClientsAction(ids);
      if (result.deletedIds.length > 0) {
        const deletedSet = new Set(result.deletedIds);
        setLocalClients((current) => current.filter((client) => !deletedSet.has(client.id)));
        setSelectedIds((current) => {
          const next = new Set(current);
          result.deletedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      if (result.failedNames.length === 0) {
        notify.success(result.deletedIds.length > 1 ? `${result.deletedIds.length} clients ont été supprimés.` : "Le client a été supprimé.");
        setSelectionMode(false);
      } else {
        notify.error(`Échec pour : ${result.failedNames.join(", ")}.`);
      }
      router.refresh();
    });
  }

  /** Marque localement les fiches archivées ou restaurées, sans attendre le rechargement. */
  function markArchived(ids: string[], archivedAt: string | null) {
    const changed = new Set(ids);
    setLocalClients((current) => current.map((client) => (changed.has(client.id) ? { ...client, archivedAt } : client)));
    setSelectedIds((current) => new Set([...current].filter((id) => !changed.has(id))));
  }

  function restore(ids: string[], message: string) {
    startArchiving(async () => {
      const result = await restoreClientsAction(ids);
      if (!result.ok) return void notify.error(result.error);
      markArchived(ids, null);
      notify.success(message);
      router.refresh();
    });
  }

  /**
   * Archivage groupé : la confirmation annonce les rendez-vous à venir (ils
   * sont conservés), puis un toast propose « Annuler » pendant 8 s.
   */
  function askToArchiveSelected() {
    const ids = Array.from(selectedIds);
    startArchiving(async () => {
      // Les rendez-vous à venir sont annoncés dans la question : il faut les
      // connaître avant de la poser.
      const upcoming = await upcomingAppointmentsOfClientsAction(ids);
      const single = ids.length === 1 ? localClients.find((client) => client.id === ids[0]) : undefined;
      setArchiveQuestion(archiveConfirmationMessage(ids.length, single ? `${single.firstName} ${single.lastName}` : null, upcoming));
    });
  }

  function archiveSelected() {
    setArchiveQuestion(null);
    const ids = Array.from(selectedIds);
    startArchiving(async () => {
      const result = await archiveClientsAction(ids);
      if (!result.ok) return void notify.error(result.error);
      markArchived(result.ids, new Date().toISOString());
      setSelectionMode(false);
      const count = result.ids.length;
      notify.success(count > 1 ? `${count} clients archivés.` : "Client archivé.", {
        action: { label: "Annuler", onClick: () => restore(result.ids, count > 1 ? `${count} clients restaurés.` : "Client restauré.") },
      });
      router.refresh();
    });
  }

  function restoreSelected() {
    const ids = Array.from(selectedIds);
    restore(ids, ids.length > 1 ? `${ids.length} clients restaurés.` : "Client restauré.");
    setSelectionMode(false);
  }

  /** Nouveau client (et ses animaux) enregistré : sa fiche s'ouvre. */
  function openNewClient(client: Client) {
    setLocalClients((current) => [client, ...current]);
    setCreatingClient(false);
    notify.success(`${client.firstName} ${client.lastName} a été ajouté${client.animals.length ? `, avec ${pluralizeAnimals(client.animals.length)}` : ""}.`);
    router.push(`/dashboard/clients/${client.id}`);
  }

  return (
    <>
      <PageHeader
        title="Clients"
        description="Retrouvez vos propriétaires, leurs coordonnées et tous leurs animaux."
        action={
          <>
            {/* Ouvre une autre page : un lien, pas un bouton. */}
            <TextLink href="/dashboard/clients/lieux" arrow>Lieux des animaux</TextLink>
            {/* Une seule action pleine. L'import, plus rare, est rangé dans le
                menu accolé — quand le module est ouvert ; sinon, un simple
                bouton, un menu vide n'ayant pas de sens. */}
            {hasModule(currentUser?.modules, "CLIENT_IMPORT") ? (
              <SplitButton
                icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}
                onClick={() => setCreatingClient(true)}
                menuLabel="Autres façons d’ajouter des clients"
                items={[
                  { label: "Nouveau client", icon: <UserPlus aria-hidden="true" className="h-4 w-4 shrink-0" />, onSelect: () => setCreatingClient(true) },
                  { label: "Importer des clients", icon: <Upload aria-hidden="true" className="h-4 w-4 shrink-0" />, onSelect: () => setImportingClients(true) },
                ]}
              >
                Nouveau client
              </SplitButton>
            ) : (
              <Button type="button" onClick={() => setCreatingClient(true)} icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}>Nouveau client</Button>
            )}
          </>
        }
      />

      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <label className="relative block flex-1 md:max-w-xl">
            <span className="sr-only">Rechercher un client</span>
            <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-animeo-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom, animal ou téléphone…"
              className="h-12 w-full rounded-2xl border border-animeo-border bg-animeo-bg pl-11 pr-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white"
            />
          </label>

          <div className="flex items-center gap-3 rounded-2xl bg-animeo-soft px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-animeo-dark">
              <Icon name="clients" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-black leading-none text-animeo-dark">{localClients.length - archivedCount}</p>
              <p className="mt-1 text-xs font-bold text-animeo-muted">clients au total</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-animeo-border-soft pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Espèce</span>
            <div className="flex flex-wrap gap-1.5">
              {(["Tous", ...animalSpeciesList] as SpeciesFilter[]).map((filter) => (
                <button key={filter} type="button" onClick={() => setSpeciesFilter(filter)} aria-pressed={speciesFilter === filter} className={`min-h-11 rounded-xl px-3 py-2 text-xs font-extrabold transition sm:min-h-0 ${speciesFilter === filter ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-muted">
              Statut
              <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setSelectedIds(new Set()); }} className="h-10 rounded-xl border border-animeo-border bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                <option>Tous les statuts</option>
                <option>Actif</option>
                <option>Inactif</option>
                <option value="Archivés">Archivés ({archivedCount})</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-muted">
              Trier par
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="h-10 rounded-xl border border-animeo-border bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                {Object.entries(sortLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
        </div>
      </Card>

      {confirmingDelete ? (
        <ConfirmModal
          title={selectedIds.size === 1 ? "Supprimer ce client ?" : `Supprimer ces ${selectedIds.size} clients ?`}
          message={selectedIds.size === 1
            ? "Supprimer définitivement cette fiche client et ses animaux ? Cette action est irréversible."
            : `Supprimer définitivement ces ${selectedIds.size} fiches clients et leurs animaux ? Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={deleteSelected}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
      {archiveQuestion ? (
        <ConfirmModal title={selectedIds.size === 1 ? "Archiver ce client ?" : "Archiver ces clients ?"} message={archiveQuestion} confirmLabel="Archiver" destructive={false} onConfirm={archiveSelected} onClose={() => setArchiveQuestion(null)} />
      ) : null}

      {selectionMode && selectedIds.size > 0 ? (
        <div className="sticky top-4 z-30 mb-4 flex flex-col gap-3 rounded-2xl bg-animeo-dark px-5 py-4 text-white shadow-[0_12px_32px_rgb(var(--theme-shadow-rgb)/0.22)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-white/10 px-2 font-black">{selectedIds.size}</span>
            <p className="font-extrabold">{selectedIds.size} client{selectedIds.size > 1 ? "s" : ""} sélectionné{selectedIds.size > 1 ? "s" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>Désélectionner</Button>
            {/* Archiver : réversible, ouvert à tous. Supprimer : définitif, sur permission. */}
            {statusFilter === "Archivés" ? (
              <Button type="button" variant="secondary" onClick={restoreSelected} disabled={archiving}>
                {archiving ? "Restauration…" : "Restaurer"}
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={askToArchiveSelected} disabled={archiving}>
                {archiving ? "Archivage…" : "Archiver"}
              </Button>
            )}
            {canDelete ? (
              <Button type="button" variant="danger" onClick={() => setConfirmingDelete(true)} disabled={deletingSelected} icon={<Trash2 aria-hidden="true" className="h-4 w-4" />}>
                {deletingSelected ? "Suppression…" : "Supprimer"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-animeo-border-soft px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-extrabold text-animeo-dark">Liste des propriétaires</h2>
            <p className="mt-0.5 text-sm text-animeo-muted">
              {filteredClients.length} résultat{filteredClients.length > 1 ? "s" : ""}
            </p>
          </div>
          {filteredClients.length > 0 || selectionMode ? (
            <Button type="button" variant="secondary" active={selectionMode} aria-pressed={selectionMode} onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))} className="shrink-0">
              {selectionMode ? "Terminé" : "Sélectionner"}
            </Button>
          ) : null}
        </div>

        {filteredClients.length > 0 ? (
          <>
            {/* Seuil xl et non lg : à 1024 px, la barre latérale fixe laisse
                686 px utiles — un tableau de 980 px y imposait un défilement
                horizontal permanent, et faisait glisser la page entière de
                côté. Les cartes, elles, tiennent parfaitement dans cette
                largeur. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[880px] border-collapse text-left">
                <thead className="bg-animeo-surface-alt text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
                  <tr>
                    {selectionMode ? (
                      <th className="w-12 px-6 py-3.5">
                        <input
                          type="checkbox"
                          checked={filteredClients.length > 0 && filteredClients.every((client) => selectedIds.has(client.id))}
                          onChange={toggleAllVisible}
                          aria-label="Sélectionner tous les clients affichés"
                          className="h-4 w-4 accent-animeo-brand"
                        />
                      </th>
                    ) : null}
                    <th className="px-6 py-3.5">Client</th>
                    <th className="px-4 py-3.5">Coordonnées</th>
                    <th className="px-4 py-3.5">Ville</th>
                    <th className="px-4 py-3.5">Animaux</th>
                    <th className="px-4 py-3.5">Dernière consultation</th>
                    <th className="hidden px-6 py-3.5 text-right 2xl:table-cell"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-animeo-border-soft">
                  {filteredClients.map((client) => (
                    <ClientTableRow
                      key={client.id}
                      client={client}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(client.id)}
                      onToggleSelected={() => toggleSelected(client.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 p-4 sm:grid-cols-2 xl:hidden">
              {filteredClients.map((client) => (
                <ClientMobileCard
                  key={client.id}
                  client={client}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(client.id)}
                  onToggleSelected={() => toggleSelected(client.id)}
                />
              ))}
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
        <NewClientModal onClose={() => setCreatingClient(false)} onCreated={openNewClient} />
      ) : null}

      {importingClients ? (
        <ClientImportModal onClose={() => setImportingClients(false)} onImported={() => router.refresh()} />
      ) : null}
    </>
  );
}

/**
 * Toute la ligne ouvre la fiche : un vrai lien sur le nom, étendu à la
 * ligne par un pseudo-élément (clic molette, Cmd+clic et clavier restent
 * ceux d'un lien). En mode sélection, un clic sur la ligne coche la case.
 */
function ClientTableRow({ client, selectionMode, selected, onToggleSelected }: { client: Client; selectionMode: boolean; selected: boolean; onToggleSelected: () => void }) {
  const name = `${client.firstName} ${client.lastName}`;
  return (
    <tr
      onClick={selectionMode ? onToggleSelected : undefined}
      className={`relative transition ${selectionMode ? "cursor-pointer" : ""} ${selected ? "bg-animeo-soft/55" : "hover:bg-animeo-bg/70"}`}
    >
      {selectionMode ? (
        <td className="px-6 py-4">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} onClick={(event) => event.stopPropagation()} aria-label={`Sélectionner ${name}`} className="relative z-10 h-4 w-4 accent-animeo-brand" />
        </td>
      ) : null}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <AnimalAvatarStack animals={client.animals} />
          <div>
            {selectionMode ? (
              <p className="font-extrabold text-animeo-dark">{name}</p>
            ) : (
              <Link href={`/dashboard/clients/${client.id}`} className="font-extrabold text-animeo-dark outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">{name}</Link>
            )}
            <p className="mt-0.5 text-xs font-bold text-animeo">{client.archivedAt ? "Client archivé" : client.status === "Actif" ? "Client actif" : "Client inactif"}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="text-sm font-bold text-animeo-dark">{client.phone}</p>
        {/* break-all : une adresse email est une chaîne insécable ; sans
            coupure, elle imposait sa largeur à toute la colonne et poussait
            le tableau au-delà de la place disponible. */}
        <p className="mt-1 break-all text-xs text-animeo-muted">{client.email}</p>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-animeo-muted">{client.city}</td>
      <td className="px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-animeo-soft text-animeo-dark">
            <Icon name="paw" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="max-w-48 truncate text-sm font-extrabold text-animeo-dark" title={animalNames(client)}>
              {animalNames(client)}
            </p>
            <p className="mt-0.5 text-xs text-animeo-muted">
              {pluralizeAnimals(client.animals.length)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 text-sm font-semibold text-animeo-muted">{client.lastConsultation}</td>
      {/* Sous 1536 px, la colonne déborderait : toute la ligne ouvre déjà la fiche. */}
      <td className="hidden px-6 py-4 2xl:table-cell">
        <div className="flex items-center justify-end">
          <ClientLink id={client.id} />
        </div>
      </td>
    </tr>
  );
}

/** Même principe que la ligne du tableau : toute la carte ouvre la fiche. */
function ClientMobileCard({ client, selectionMode, selected, onToggleSelected }: { client: Client; selectionMode: boolean; selected: boolean; onToggleSelected: () => void }) {
  const name = `${client.firstName} ${client.lastName}`;
  return (
    <article
      onClick={selectionMode ? onToggleSelected : undefined}
      className={`relative rounded-2xl border p-4 ${selectionMode ? "cursor-pointer" : ""} ${selected ? "border-animeo bg-animeo-soft/50" : "border-animeo-border bg-white"}`}
    >
      <div className="flex items-center gap-3">
        {selectionMode ? (
          <input type="checkbox" checked={selected} onChange={onToggleSelected} onClick={(event) => event.stopPropagation()} aria-label={`Sélectionner ${name}`} className="relative z-10 h-4 w-4 shrink-0 accent-animeo-brand" />
        ) : null}
        <AnimalAvatarStack animals={client.animals} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-extrabold text-animeo-dark">
            {selectionMode ? name : (
              <Link href={`/dashboard/clients/${client.id}`} className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline">{name}</Link>
            )}
          </h3>
          <p className="text-xs font-bold text-animeo">{client.archivedAt ? "Client archivé" : client.status === "Actif" ? "Client actif" : "Client inactif"}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="truncate text-sm font-extrabold text-animeo-dark">{animalNames(client)}</p>
        <p className="mt-0.5 text-xs text-animeo-muted">{pluralizeAnimals(client.animals.length)}</p>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <InfoLine label="Téléphone" value={client.phone} />
        <InfoLine label="Email" value={client.email} />
        <InfoLine label="Ville" value={client.city} />
        <InfoLine label="Dernière consultation" value={client.lastConsultation} />
      </dl>
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
      // Le nom est déjà le lien de la ligne au clavier : pas de second arrêt.
      tabIndex={-1}
      onClick={(event) => event.stopPropagation()}
      className={`relative z-10 whitespace-nowrap ${fullWidth ? "mt-4 flex w-full" : "inline-flex"} min-h-11 items-center justify-center rounded-xl bg-animeo-soft px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft-strong`}
    >
      {/* « Voir » suffit à l'œil (toute la ligne ouvre la fiche) ; le nom
          complet reste celui du lien. */}
      Voir<span className="sr-only"> la fiche</span>
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

