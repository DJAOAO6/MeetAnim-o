"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  AppointmentDetailsSection,
  AppointmentLocationSection,
  AppointmentOptionsSection,
  ClientAnimalSection,
} from "@/components/appointments/appointment-form-sections";
import { AppointmentSummaryPanel } from "@/components/appointments/appointment-summary-panel";
import { QuickCreateAnimal } from "@/components/appointments/quick-create-animal";
import { QuickCreateClient } from "@/components/appointments/quick-create-client";
import {
  buildRecurrenceDates,
  composeLocation,
  modeOf,
  useAppointmentDraft,
  type AppointmentPlace,
} from "@/components/appointments/use-appointment-draft";
import { addAppointmentStopsAction } from "@/lib/tour-runs-actions";
import { checkGeographicWarningAction, type GeoWarning, type SaveAppointmentInput } from "@/lib/appointments-actions";
import { formatGeoWarningMessage } from "@/lib/tour-estimate";
import { notify } from "@/lib/notify";
import type { AppointmentPrefill } from "@/components/appointments/appointments-context";
import type { Appointment } from "@/data/appointments";
import type { ClientPickerAnimal, ClientPickerOption } from "@/data/clients";
import type { ServiceSettings } from "@/data/settings";

export type AppointmentModalContext = {
  clients: ClientPickerOption[];
  services: ServiceSettings[];
  cabinetAddress: string;
  reminderSummary: string;
};

/**
 * Création et modification d'un rendez-vous, en fenêtre centrée.
 *
 * Le parcours vise un cas précis : poser un rendez-vous pendant un appel
 * téléphonique. D'où trois partis pris — la recherche de client accepte le
 * téléphone et le nom de l'animal, un client ou un animal inconnu se crée
 * sans quitter la fenêtre, et l'aperçu de droite se relit à voix haute avant
 * de valider.
 *
 * Le brouillon vit ici, au-dessus des sous-fenêtres de création rapide :
 * ouvrir « Créer un client » au milieu de la saisie ne perd donc rien.
 */
export function AppointmentModal({ appointment, template, defaultDate, prefill, context, onSave, onClose, onCreated }: {
  appointment?: Appointment;
  /** Duplication : les valeurs de départ viennent de ce rendez-vous, mais on en crée un nouveau. */
  template?: Appointment;
  defaultDate?: string;
  /** Créneau choisi dans la grille de l'agenda. */
  prefill?: AppointmentPrefill;
  context: AppointmentModalContext;
  onSave: (input: SaveAppointmentInput) => Promise<{ ok: boolean; error?: string; appointment?: Appointment }>;
  onClose: () => void;
  /** Appelé après une création réussie, pour enchaîner (retour à la liste…). */
  onCreated?: () => void;
}) {
  const { clients, services, cabinetAddress, reminderSummary } = context;
  const { draft, update, selectClient, clearClient, selectAnimal, selectService, selectPlace, useFreeformClient, setFreeformAnimal } = useAppointmentDraft({ appointment, template, defaultDate, prefill, services });

  // Clients et animaux créés pendant la saisie : ils n'existent pas encore
  // dans la liste venue du serveur, qui ne sera rafraîchie qu'au prochain
  // rendu de la page.
  const [addedClients, setAddedClients] = useState<ClientPickerOption[]>([]);
  const [addedAnimals, setAddedAnimals] = useState<Record<string, ClientPickerAnimal[]>>({});

  const [creatingClient, setCreatingClient] = useState<string | null>(null);
  const [creatingAnimal, setCreatingAnimal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [geoWarnings, setGeoWarnings] = useState<GeoWarning[]>([]);

  const allClients = useMemo(() => {
    const merged = [...addedClients, ...clients];
    return merged.map((client) => {
      const extra = addedAnimals[client.id];
      return extra ? { ...client, animals: [...client.animals, ...extra] } : client;
    });
  }, [clients, addedClients, addedAnimals]);

  const selectedService = services.find((service) => service.name === draft.serviceName);

  /**
   * Avertissement d'incompatibilité géographique (refonte tournées, phase
   * 3.3) : purement indicatif, recalculé pendant la saisie pour que l'horaire
   * puisse encore être ajusté. Débounce léger, comme dans l'ancien
   * formulaire — cette logique est reprise telle quelle, pas réécrite.
   */
  useEffect(() => {
    if (draft.place === "cabinet" || draft.latitude === undefined || draft.longitude === undefined) {
      queueMicrotask(() => setGeoWarnings([]));
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      checkGeographicWarningAction({
        date: draft.date,
        start: draft.start,
        duration: draft.duration,
        mode: "home",
        latitude: draft.latitude,
        longitude: draft.longitude,
        excludeId: appointment?.id,
      })
        .then((warnings) => { if (!cancelled) setGeoWarnings(warnings); })
        .catch(() => { if (!cancelled) setGeoWarnings([]); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [draft.place, draft.date, draft.start, draft.duration, draft.latitude, draft.longitude, appointment?.id]);

  function buildInput(date: string): SaveAppointmentInput {
    return {
      id: appointment?.id,
      date,
      start: draft.start,
      duration: draft.duration,
      clientId: draft.clientId ?? null,
      clientName: draft.clientName.trim(),
      animalId: draft.animalId ?? null,
      animalName: draft.animalName.trim(),
      animalSpecies: draft.animalSpecies ?? null,
      serviceName: draft.serviceName.trim(),
      mode: modeOf(draft.place),
      location: composeLocation(draft),
      postalCode: draft.postalCode.trim() || undefined,
      city: draft.city.trim() || undefined,
      latitude: draft.latitude,
      longitude: draft.longitude,
      price: draft.price,
      status: draft.status,
      notes: draft.notes,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Garde anti double-clic : le bouton est déjà désactivé, mais un envoi
    // au clavier peut partir pendant que React applique l'état.
    if (pending) return;

    if (!draft.clientName.trim()) { setError("Choisissez un client, ou créez-le depuis cette fenêtre."); return; }
    if (!draft.animalName.trim()) { setError("Choisissez un animal, ou ajoutez-en un pour ce client."); return; }
    if (!draft.serviceName.trim()) { setError("Choisissez une prestation."); return; }

    setError(null);
    setPending(true);

    const result = await onSave(buildInput(draft.date));
    if (!result.ok) {
      setPending(false);
      setError(result.error ?? "Une erreur est survenue.");
      return;
    }

    // Rattachement à la tournée choisie, après coup : l'arrêt a besoin de
    // l'identifiant du rendez-vous, qui n'existe qu'une fois enregistré.
    if (draft.place === "tour" && draft.tourRunId && result.appointment) {
      await attachToTourRun(draft.tourRunId, result.appointment.id);
    }

    // Occurrences suivantes : créées une à une par la même action, donc
    // soumises aux mêmes règles de conflit. Celles qui échouent sont
    // annoncées, jamais forcées ni tues.
    let refusedDates: string[] = [];
    if (!appointment && draft.repeat) {
      const dates = buildRecurrenceDates(draft.date, draft.repeat, draft.repeatCount);
      const outcomes = await Promise.all(dates.map(async (date) => ({ date, result: await onSave({ ...buildInput(date), id: undefined }) })));
      refusedDates = outcomes.filter((outcome) => !outcome.result.ok).map((outcome) => outcome.date);
    }

    setPending(false);

    if (appointment) notify.success("Rendez-vous modifié");
    else if (refusedDates.length > 0) notify.warning(`Rendez-vous créé. ${refusedDates.length} occurrence${refusedDates.length > 1 ? "s" : ""} n’${refusedDates.length > 1 ? "ont" : "a"} pas pu être placée${refusedDates.length > 1 ? "s" : ""} : ${refusedDates.map(formatShortDate).join(", ")}.`);
    else notify.success(draft.repeat ? "Rendez-vous et occurrences créés" : "Rendez-vous créé");

    onCreated?.();
    onClose();
  }

  const title = appointment ? `Modifier le rendez-vous de ${appointment.animalName}` : "Nouveau rendez-vous";

  return (
    <>
      <Modal
        title={title}
        description={appointment ? "Modifiez ce rendez-vous — le créneau est revérifié à l’enregistrement." : "Planifiez un rendez-vous en quelques clics."}
        onClose={onClose}
        size="2xl"
        mobile="fullscreen"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" form="appointment-form" disabled={pending}>
              {pending ? (
                <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> Enregistrement…</>
              ) : (
                <><CalendarPlus aria-hidden="true" className="h-4 w-4" /> {appointment ? "Enregistrer les modifications" : "Créer le rendez-vous"}</>
              )}
            </Button>
          </div>
        }
      >
        <form id="appointment-form" onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-4">
            {error ? (
              <p role="alert" className="rounded-xl bg-animeo-danger-soft px-4 py-3 text-sm font-bold text-animeo-danger">{error}</p>
            ) : null}

            <ClientAnimalSection
              draft={draft}
              clients={allClients}
              onSelectClient={selectClient}
              onClearClient={clearClient}
              onSelectAnimal={selectAnimal}
              onCreateClient={(query) => setCreatingClient(query)}
              onCreateAnimal={() => setCreatingAnimal(true)}
              onUseWithoutFile={useFreeformClient}
              onFreeformAnimal={setFreeformAnimal}
            />

            <AppointmentDetailsSection
              draft={draft}
              services={services}
              appointmentId={appointment?.id}
              onSelectService={(service) => selectService(service, draft.place)}
              onUpdate={update}
            />

            <AppointmentLocationSection
              draft={draft}
              cabinetAddress={cabinetAddress}
              onSelectPlace={(place: AppointmentPlace) => selectPlace(place, selectedService)}
              onUpdate={update}
            />

            {geoWarnings.length > 0 ? (
              <div className="grid gap-2">
                {geoWarnings.map((warning) => (
                  <p key={warning.direction} role="alert" className="rounded-xl bg-animeo-warning-soft px-3.5 py-2.5 text-sm font-bold text-animeo-warning">
                    {formatGeoWarningMessage(warning.direction, warning.neighborLabel, warning.travelMinutes, warning.gapMinutes)}
                  </p>
                ))}
              </div>
            ) : null}

            <AppointmentOptionsSection draft={draft} reminderSummary={reminderSummary} isEditing={Boolean(appointment)} onUpdate={update} />
          </div>

          {/* L'aperçu reste visible pendant la saisie sur grand écran ; sur
              téléphone il vient après le formulaire, juste avant le bouton,
              là où on le relit avant de valider. */}
          <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
            <AppointmentSummaryPanel draft={draft} cabinetAddress={cabinetAddress} />
          </div>
        </form>
      </Modal>

      {creatingClient !== null ? (
        <QuickCreateClient
          initialQuery={creatingClient}
          onClose={() => setCreatingClient(null)}
          onCreated={(client) => {
            setAddedClients((current) => [client, ...current]);
            selectClient(client);
            setCreatingClient(null);
            // Enchaînement naturel : un client tout neuf n'a pas d'animal, et
            // il en faut un pour le rendez-vous.
            setCreatingAnimal(true);
          }}
        />
      ) : null}

      {creatingAnimal && draft.clientId ? (
        <QuickCreateAnimal
          clientId={draft.clientId}
          clientName={draft.clientName}
          onClose={() => setCreatingAnimal(false)}
          onCreated={(animal) => {
            const clientId = draft.clientId!;
            setAddedAnimals((current) => ({ ...current, [clientId]: [...(current[clientId] ?? []), animal] }));
            selectAnimal(animal);
            setCreatingAnimal(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Rattachement à une tournée. Séparé de l'enregistrement du rendez-vous :
 * un rattachement qui échoue ne doit pas faire croire que le rendez-vous
 * n'existe pas — il existe, il est simplement à placer depuis l'écran
 * Tournées.
 */
export async function attachToTourRun(tourRunId: string, appointmentId: string): Promise<void> {
  const result = await addAppointmentStopsAction({ tourRunId, appointmentIds: [appointmentId] });
  if (!result.ok) notify.warning("Rendez-vous créé, mais il n’a pas pu être ajouté à la tournée. Ajoutez-le depuis l’écran Tournées.");
}

function formatShortDate(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(year, month - 1, day, 12));
}
