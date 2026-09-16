"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Building2, Car, ChevronDown, MapPin, PawPrint, Plus, Route, UserPlus, X } from "lucide-react";
import { Field, inputClassName, textareaClassName } from "@/components/settings/settings-fields";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { ClientSearch } from "@/components/appointments/client-search";
import { AppointmentAvailabilityIndicator } from "@/components/appointments/appointment-availability-indicator";
import { recurrenceLabels, useDurationOptions, type AppointmentDraft, type AppointmentPlace, type RecurrenceFrequency } from "@/components/appointments/use-appointment-draft";
import { appointmentStatusLabels, type AppointmentStatus } from "@/data/appointments";
import { initialsFor } from "@/lib/format";
import { listTourRunsForDateAction, type TourRunOption } from "@/lib/appointment-tour-actions";
import type { ClientPickerOption } from "@/data/clients";
import type { GeocodedAddress } from "@/data/geocoding";
import type { ServiceSettings } from "@/data/settings";

/**
 * Section numérotée du formulaire. Le numéro dans sa pastille n'est pas un
 * ornement : il dit combien d'étapes restent, ce qui change tout quand on
 * remplit le formulaire en parlant au téléphone.
 */
export function FormSection({ step, title, description, children }: {
  step: number;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-animeo-border bg-white p-4 sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-animeo text-xs font-black text-white">{step}</span>
        <div className="min-w-0">
          <h3 className="text-sm font-black text-animeo-dark">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-animeo-muted">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ 1 */

export function ClientAnimalSection({ draft, clients, onSelectClient, onClearClient, onSelectAnimal, onCreateClient, onCreateAnimal, onUseWithoutFile, onFreeformAnimal }: {
  draft: AppointmentDraft;
  clients: ClientPickerOption[];
  onSelectClient: (client: ClientPickerOption) => void;
  onClearClient: () => void;
  onSelectAnimal: (animal: { id: string; name: string; species: string; breed?: string; age?: string }) => void;
  onCreateClient: (query: string) => void;
  onCreateAnimal: () => void;
  onUseWithoutFile: (name: string) => void;
  onFreeformAnimal: (name: string, species: AnimalSpecies) => void;
}) {
  const selectedClient = clients.find((client) => client.id === draft.clientId);
  const animals = selectedClient?.animals ?? [];
  // Client saisi sans fiche : il a un nom mais aucun identifiant. Son animal
  // se saisit alors librement lui aussi — il n'y a pas de liste où le choisir.
  const freeform = !draft.clientId && draft.clientName.trim().length > 0;

  return (
    <FormSection step={1} title="Client & animal" description="Cherchez une fiche existante, ou créez-la sans quitter ce rendez-vous.">
      {draft.clientId ? (
        <div className="flex items-center gap-3 rounded-xl border border-animeo-border bg-animeo-soft px-3.5 py-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-black text-animeo-dark">
            {initialsFor(...splitFullName(draft.clientName))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-animeo-dark">{draft.clientName}</span>
            <span className="block truncate text-xs text-animeo-muted">
              {[draft.clientPhone, selectedClient?.email].filter(Boolean).join(" · ") || "Aucune coordonnée enregistrée"}
            </span>
          </span>
          <button
            type="button"
            onClick={onClearClient}
            aria-label="Changer de client"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-white hover:text-animeo-dark"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : freeform ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-animeo-border-strong bg-animeo-bg px-3.5 py-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-animeo-muted">
            <UserPlus className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-extrabold text-animeo-dark">{draft.clientName}</span>
            <span className="block text-xs text-animeo-muted">Sans fiche client — seul le nom sera enregistré.</span>
          </span>
          <button
            type="button"
            onClick={onClearClient}
            aria-label="Choisir un autre client"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-animeo-muted transition hover:bg-white hover:text-animeo-dark"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <>
          <ClientSearch clients={clients} onSelect={onSelectClient} onCreate={onCreateClient} onUseWithoutFile={onUseWithoutFile} />
          <button
            type="button"
            onClick={() => onCreateClient("")}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-animeo-border-strong px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" />
            Créer un nouveau client
          </button>
        </>
      )}

      {freeform ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nom de l’animal">
            <input
              value={draft.animalName}
              onChange={(event) => onFreeformAnimal(event.target.value, draft.animalSpecies ?? animalSpeciesList[0])}
              className={inputClassName}
              placeholder="Rex"
              required
            />
          </Field>
          <Field label="Espèce">
            <select
              value={draft.animalSpecies ?? animalSpeciesList[0]}
              onChange={(event) => onFreeformAnimal(draft.animalName, event.target.value as AnimalSpecies)}
              className={inputClassName}
            >
              {animalSpeciesList.map((species) => <option key={species} value={species}>{species}</option>)}
            </select>
          </Field>
        </div>
      ) : null}

      {draft.clientId ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Animal</p>

          {animals.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {animals.map((animal) => {
                const selected = animal.id === draft.animalId;
                return (
                  <button
                    key={animal.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelectAnimal(animal)}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? "border-animeo bg-animeo-soft" : "border-animeo-border bg-animeo-bg hover:bg-white"}`}
                  >
                    <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-animeo-dark">
                      <PawPrint className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-extrabold text-animeo-dark">{animal.name}</span>
                      <span className="block truncate text-xs text-animeo-muted">
                        {[animal.species, animal.breed, animal.age].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-xl bg-animeo-bg px-3.5 py-3 text-sm text-animeo-muted">
              Aucun animal enregistré pour ce client.
            </p>
          )}

          <button
            type="button"
            onClick={onCreateAnimal}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-animeo-border-strong px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            Ajouter un animal
          </button>
        </div>
      ) : null}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ 2 */

export function AppointmentDetailsSection({ draft, services, appointmentId, onSelectService, onUpdate }: {
  draft: AppointmentDraft;
  services: ServiceSettings[];
  appointmentId?: string;
  onSelectService: (service: ServiceSettings) => void;
  onUpdate: (change: Partial<AppointmentDraft>) => void;
}) {
  const durations = useDurationOptions(services, draft.duration);
  const activeServices = services.filter((service) => service.active || service.name === draft.serviceName);

  return (
    <FormSection step={2} title="Rendez-vous" description="Durée et tarif viennent de la prestation, et restent modifiables.">
      <div className="grid gap-4">
        <Field label="Prestation">
          {activeServices.length > 0 ? (
            <select
              value={draft.serviceName}
              onChange={(event) => {
                const service = services.find((item) => item.name === event.target.value);
                if (service) onSelectService(service);
              }}
              className={inputClassName}
              required
            >
              {activeServices.map((service) => <option key={service.id} value={service.name}>{service.name}</option>)}
            </select>
          ) : (
            // Aucune prestation réglée : plutôt qu'un menu vide, on dit où
            // les créer, et on laisse saisir un nom libre pour ne pas bloquer.
            <>
              <input
                value={draft.serviceName}
                onChange={(event) => onUpdate({ serviceName: event.target.value })}
                className={inputClassName}
                placeholder="Nom de la prestation"
                required
              />
              <span className="mt-1.5 block text-xs text-animeo-muted">
                Aucune prestation n’est encore enregistrée — vous pouvez les définir dans Prestations.
              </span>
            </>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">
            <input type="date" value={draft.date} onChange={(event) => onUpdate({ date: event.target.value })} className={inputClassName} required />
          </Field>
          <Field label="Heure">
            <input type="time" value={draft.start} onChange={(event) => onUpdate({ start: event.target.value })} className={inputClassName} required />
          </Field>
          <Field label="Durée">
            <select value={draft.duration} onChange={(event) => onUpdate({ duration: Number(event.target.value) })} className={inputClassName}>
              {durations.map((duration) => <option key={duration} value={duration}>{formatDuration(duration)}</option>)}
            </select>
          </Field>
          <Field label="Prix">
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.price}
                onChange={(event) => onUpdate({ price: Number(event.target.value) })}
                className={`${inputClassName} pr-9`}
              />
              <span aria-hidden="true" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-animeo-muted">€</span>
            </div>
          </Field>
        </div>

        <AppointmentAvailabilityIndicator date={draft.date} start={draft.start} duration={draft.duration} excludeId={appointmentId} />
      </div>
    </FormSection>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/* ------------------------------------------------------------------ 3 */

const places: Array<{ value: AppointmentPlace; label: string; icon: typeof Building2 }> = [
  { value: "cabinet", label: "Cabinet", icon: Building2 },
  { value: "home", label: "Domicile", icon: Car },
  { value: "tour", label: "Tournée", icon: Route },
];

export function AppointmentLocationSection({ draft, cabinetAddress, onSelectPlace, onUpdate }: {
  draft: AppointmentDraft;
  cabinetAddress: string;
  onSelectPlace: (place: AppointmentPlace) => void;
  onUpdate: (change: Partial<AppointmentDraft>) => void;
}) {
  const [tourRuns, setTourRuns] = useState<TourRunOption[] | null>(null);

  // La date interrogée, comparée pendant le rendu : changer de jour doit
  // effacer aussitôt la liste précédente, qui ne décrit plus ce jour-là.
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  if (draft.place === "tour" && loadedDate !== draft.date) {
    setLoadedDate(draft.date);
    setTourRuns(null);
  }

  // Tournées de la date choisie : rechargées quand la date change, puisque
  // c'est la date qui détermine quelles tournées existent.
  useEffect(() => {
    if (draft.place !== "tour" || !draft.date) return;
    let cancelled = false;
    listTourRunsForDateAction(draft.date)
      .then((runs) => { if (!cancelled) setTourRuns(runs); })
      .catch(() => { if (!cancelled) setTourRuns([]); });
    return () => { cancelled = true; };
  }, [draft.place, draft.date]);

  function applyAddress(result: GeocodedAddress) {
    onUpdate({ addressLine: result.label, postalCode: result.postcode, city: result.city, latitude: result.latitude, longitude: result.longitude });
  }

  function updateAddressQuery(next: string) {
    // La position géocodée ne survit pas à une adresse retapée : elle ne
    // décrirait plus le texte affiché. Même règle que la réservation publique.
    onUpdate({ addressLine: next, latitude: undefined, longitude: undefined });
  }

  return (
    <FormSection step={3} title="Lieu">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Lieu du rendez-vous">
        {places.map((place) => {
          const PlaceIcon = place.icon;
          const selected = draft.place === place.value;
          return (
            <button
              key={place.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelectPlace(place.value)}
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-extrabold transition ${selected ? "border-animeo bg-animeo-soft text-animeo-dark" : "border-animeo-border bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
            >
              <PlaceIcon aria-hidden="true" className="h-4 w-4" />
              {place.label}
            </button>
          );
        })}
      </div>

      {draft.place === "cabinet" ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-animeo-bg px-3.5 py-3 text-sm text-animeo-muted">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {cabinetAddress || "L’adresse du cabinet n’est pas encore renseignée dans Paramètres › Mon cabinet."}
        </p>
      ) : (
        <div className="mt-4 grid gap-4">
          {draft.place === "tour" ? (
            <Field label="Tournée">
              {tourRuns === null ? (
                <p className="rounded-xl bg-animeo-bg px-3.5 py-3 text-sm text-animeo-muted">Recherche des tournées de ce jour…</p>
              ) : tourRuns.length === 0 ? (
                <p className="rounded-xl bg-animeo-warning-soft px-3.5 py-3 text-sm font-bold text-animeo-warning">
                  Aucune tournée n’est programmée ce jour-là. Le rendez-vous sera enregistré à domicile ; vous pourrez
                  l’ajouter à une tournée depuis l’écran Tournées.
                </p>
              ) : (
                <select
                  value={draft.tourRunId ?? ""}
                  onChange={(event) => onUpdate({ tourRunId: event.target.value || null })}
                  className={inputClassName}
                >
                  <option value="">Ne pas rattacher pour l’instant</option>
                  {tourRuns.map((run) => (
                    <option key={run.id} value={run.id}>{run.name} · {run.stopCount} arrêt{run.stopCount > 1 ? "s" : ""}</option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}

          <Field label="Adresse du rendez-vous">
            <AddressAutocomplete
              value={draft.addressLine}
              onQueryChange={updateAddressQuery}
              onSelect={applyAddress}
              inputClassName={inputClassName}
              placeholder="12 rue Exemple"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code postal">
              <input value={draft.postalCode} onChange={(event) => onUpdate({ postalCode: event.target.value })} className={inputClassName} inputMode="numeric" placeholder="76000" />
            </Field>
            <Field label="Ville">
              <input value={draft.city} onChange={(event) => onUpdate({ city: event.target.value })} className={inputClassName} placeholder="Rouen" />
            </Field>
          </div>

          <Field label="Complément d’adresse" hint="Bâtiment, étage, lieu-dit, code d’accès…">
            <input value={draft.addressExtra} onChange={(event) => onUpdate({ addressExtra: event.target.value })} className={inputClassName} />
          </Field>
        </div>
      )}
    </FormSection>
  );
}

/* ------------------------------------------------------------------ 4 */

export function AppointmentOptionsSection({ draft, reminderSummary, isEditing, onUpdate }: {
  draft: AppointmentDraft;
  /** Phrase décrivant le réglage de rappels réel du cabinet. */
  reminderSummary: string;
  isEditing: boolean;
  onUpdate: (change: Partial<AppointmentDraft>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-animeo-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="appointment-options"
        className="flex w-full items-center gap-3 p-4 text-left sm:p-5"
      >
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-animeo text-xs font-black text-white">4</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-animeo-dark">Options</span>
          <span className="block text-xs text-animeo-muted">Statut, notes, rappels, répétition — facultatif</span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-animeo-muted transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      <div id="appointment-options" className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className={`overflow-hidden ${open ? "visible" : "invisible"}`}>
          <div className="grid gap-4 border-t border-animeo-border-soft p-4 sm:p-5">
            <Field label="Statut">
              <select
                value={draft.status}
                onChange={(event) => onUpdate({ status: event.target.value as AppointmentStatus })}
                className={inputClassName}
              >
                {Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>

            <Field label="Notes internes" hint="Visibles par vous seulement.">
              <textarea
                value={draft.notes}
                onChange={(event) => onUpdate({ notes: event.target.value })}
                className={textareaClassName}
                placeholder="Première consultation, animal anxieux…"
              />
            </Field>

            {/* Les rappels sont réglés pour tout le cabinet, pas rendez-vous
                par rendez-vous : afficher ici des cases à cocher donnerait
                l'illusion d'un réglage qui n'est stocké nulle part. */}
            <div className="rounded-xl bg-animeo-bg px-3.5 py-3">
              <p className="text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Rappels</p>
              <p className="mt-1.5 text-sm text-animeo-dark">{reminderSummary}</p>
              <p className="mt-1 text-xs text-animeo-muted">Ce réglage s’applique à tous vos rendez-vous, depuis Paramètres › Disponibilités et rappels.</p>
            </div>

            {!isEditing ? (
              <div className="rounded-xl border border-animeo-border bg-animeo-bg p-3.5">
                <label className="flex items-center gap-2.5 text-sm font-extrabold text-animeo-dark">
                  <input
                    type="checkbox"
                    checked={draft.repeat !== null}
                    onChange={(event) => onUpdate({ repeat: event.target.checked ? "weekly" : null })}
                    className="h-4 w-4 accent-[var(--theme-primary)]"
                  />
                  Rendez-vous récurrent
                </label>

                {draft.repeat !== null ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Fréquence">
                      <select
                        value={draft.repeat}
                        onChange={(event) => onUpdate({ repeat: event.target.value as RecurrenceFrequency })}
                        className={inputClassName}
                      >
                        {Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Occurrences suivantes">
                      <select
                        value={draft.repeatCount}
                        onChange={(event) => onUpdate({ repeatCount: Number(event.target.value) })}
                        className={inputClassName}
                      >
                        {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((count) => (
                          <option key={count} value={count}>{count} de plus</option>
                        ))}
                      </select>
                    </Field>
                    <p className="text-xs text-animeo-muted sm:col-span-2">
                      Chaque occurrence est créée comme un rendez-vous à part entière et vérifiée séparément : celles qui
                      tomberaient sur un créneau occupé vous seront signalées plutôt qu’enregistrées de force.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function splitFullName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}
