"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { completeAppointmentAction } from "@/lib/appointments-actions";
import { searchClientsAndAnimalsAction, type AnimalSearchResult } from "@/lib/clients-actions";
import { getPublicServices } from "@/lib/services-actions";
import { addTourStopAction } from "@/lib/tours-actions";
import { buildNavUrl, buildTourMapsLinks, navProviderLabels, type NavProvider } from "@/lib/tour-maps";
import { nextOccurrenceDateId } from "@/lib/tour-schedule";
import { toLocalDateId } from "@/lib/booking-validation";
import { toTelHref } from "@/lib/phone";
import { formatEuros } from "@/lib/format";
import { notify } from "@/lib/notify";
import type { PublicService } from "@/data/public-booking";
import type { Coordinates, Tour, TourAppointment, Zone } from "@/data/tours";

const MIN_SEARCH_CHARS = 2;
const NAV_PROVIDER_STORAGE_KEY = "animeo:nav-provider";
const navProviders: NavProvider[] = ["google", "waze", "apple"];

function readStoredNavProvider(): NavProvider {
  if (typeof window === "undefined") return "google";
  try {
    const raw = window.localStorage.getItem(NAV_PROVIDER_STORAGE_KEY);
    return raw === "google" || raw === "waze" || raw === "apple" ? raw : "google";
  } catch {
    return "google";
  }
}

function persistNavProvider(provider: NavProvider) {
  try {
    window.localStorage.setItem(NAV_PROVIDER_STORAGE_KEY, provider);
  } catch {
    // best-effort : une préférence d'affichage locale, jamais bloquant
  }
}

type TourDetailProps = {
  tour: Tour | null;
  zones: Zone[];
  stops: TourAppointment[];
  cabinetCoordinates: Coordinates | null;
  cabinetAddress: string | null;
  onEdit: () => void;
  onBack?: () => void;
};

function normalizeCity(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function cityInZones(city: string, zones: Zone[]): boolean {
  const normalized = normalizeCity(city);
  if (!normalized) return false;
  return zones.some((zone) => zone.cities.some((c) => normalizeCity(c.name) === normalized));
}

export function TourDetail({ tour, zones, stops, cabinetCoordinates, cabinetAddress, onEdit, onBack }: TourDetailProps) {
  if (!tour) {
    return (
      <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-[#c9dbd6] p-8 text-center">
        <Icon name="tournees" className="h-8 w-8 text-animeo-muted" />
        <p className="mt-3 text-sm text-animeo-muted">Sélectionnez une tournée à gauche, ou créez-en une nouvelle.</p>
      </div>
    );
  }

  const tourZones = zones.filter((zone) => tour.zoneIds.includes(zone.id));
  const departure = tour.startType === "Cabinet" ? (cabinetAddress ?? "Cabinet") : (tour.startAddress ?? "Adresse personnalisée");
  const dateId = nextOccurrenceDateId(tour, toLocalDateId(new Date()));
  const mapsResult = buildTourMapsLinks(cabinetCoordinates, stops);

  return (
    <div className="flex-1">
      {onBack ? (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-animeo-muted hover:text-animeo-dark lg:hidden">← Retour</button>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h1 className="text-[18px] font-medium text-animeo-dark">{tour.name}</h1>
        <button type="button" onClick={onEdit} className="shrink-0 text-xs font-medium text-animeo-muted underline-offset-2 hover:text-animeo hover:underline">Modifier</button>
      </div>

      <p className="mt-1 text-[13px] text-animeo-muted">
        {tour.status === "Inactive" ? (
          "Tournée inactive"
        ) : tour.nextOccurrenceLabel ? (
          `Prochaine occurrence : ${tour.nextOccurrenceLabel} · ${tour.startTime} → ${tour.endTime}`
        ) : (
          "Aucune occurrence à venir"
        )}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Arrêts</p>
          <p className="mt-1 text-[20px] font-medium text-animeo-dark">{tour.appointmentCount}</p>
        </div>
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Zones</p>
          <p className="mt-1 truncate text-[13px] font-medium text-animeo-dark" title={tourZones.map((zone) => zone.name).join(", ")}>
            {tourZones.length > 0 ? tourZones.map((zone) => zone.name).join(", ") : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-animeo-bg p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Départ</p>
          <p className="mt-1 truncate text-[13px] font-medium text-animeo-dark" title={departure}>{departure}</p>
        </div>
      </div>

      {mapsResult.links.length > 0 ? (
        <div className="mt-4">
          <div className="flex flex-wrap gap-2">
            {mapsResult.links.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-animeo px-5 text-sm font-medium text-white transition hover:bg-[#459e90]"
              >
                <Icon name="car" className="h-4 w-4" />
                {mapsResult.links.length > 1 ? link.label : "Ouvrir l’itinéraire complet"}
              </a>
            ))}
          </div>
          {mapsResult.excludedStopCount > 0 ? (
            <p className="mt-1.5 text-xs text-[#a9573b]">
              {mapsResult.excludedStopCount > 1
                ? `${mapsResult.excludedStopCount} arrêts sans adresse localisée ne sont pas dans l’itinéraire.`
                : "1 arrêt sans adresse localisée n’est pas dans l’itinéraire."}
            </p>
          ) : null}
        </div>
      ) : null}

      {tour.note ? (
        <p className="mt-4 rounded-xl bg-[#fff9ec] border border-[#f1d89f] p-3 text-xs text-[#8c6118]">{tour.note}</p>
      ) : null}

      <TourTimeline tour={tour} tourZones={tourZones} stops={stops} dateId={dateId} />
    </div>
  );
}

function TourTimeline({ tour, tourZones, stops, dateId }: { tour: Tour; tourZones: Zone[]; stops: TourAppointment[]; dateId: string | null }) {
  const router = useRouter();
  const [addingStop, setAddingStop] = useState(false);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-animeo-dark">Arrêts de la prochaine occurrence</h2>
        {dateId ? (
          <button type="button" onClick={() => setAddingStop((current) => !current)} className="inline-flex min-h-9 items-center rounded-xl border border-animeo px-3.5 text-xs font-medium text-animeo transition hover:bg-animeo-soft">
            {addingStop ? "Annuler" : "+ Ajouter un arrêt"}
          </button>
        ) : null}
      </div>

      {addingStop && dateId ? (
        <AddStopPanel
          tour={tour}
          tourZones={tourZones}
          stops={stops}
          dateId={dateId}
          onDone={() => {
            setAddingStop(false);
            router.refresh();
          }}
        />
      ) : null}

      {stops.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-[#c9dbd6] p-6 text-center text-sm text-animeo-muted">
          Aucun arrêt pour la prochaine occurrence.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {stops.map((stop) => <StopRow key={stop.id} stop={stop} />)}
        </ul>
      )}
    </div>
  );
}

function StopRow({ stop }: { stop: TourAppointment }) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const telHref = stop.phone ? toTelHref(stop.phone) : null;

  async function complete() {
    setCompleting(true);
    const result = await completeAppointmentAction(stop.id);
    setCompleting(false);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="rounded-xl border border-[#e5eeeb] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-animeo-dark">
            {stop.time} · {stop.animalName}{stop.species ? <span className="text-animeo-muted"> · {stop.species}</span> : null}
          </p>
          <p className="mt-0.5 truncate text-xs text-animeo-muted">
            {stop.clientName}{stop.city ? ` · ${stop.city}` : ""} · {stop.service} · {formatEuros(stop.price)}
          </p>
        </div>
        {stop.completedAt ? (
          <span className="shrink-0 rounded-full bg-animeo-soft px-2.5 py-1 text-[10px] font-medium text-[#278064]">Terminé à {stop.completedAt}</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {telHref ? (
          <a href={telHref} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-animeo-bg px-3 text-xs font-medium text-animeo-dark transition hover:bg-animeo-soft">
            <PhoneIcon /> Appeler
          </a>
        ) : null}
        {stop.coordinates ? <GoButton coordinates={stop.coordinates} /> : null}
        {!stop.completedAt ? (
          <button type="button" onClick={complete} disabled={completing} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-animeo px-3 text-xs font-medium text-animeo transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-60">
            {completing ? "Enregistrement…" : "Terminé"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AddStopPanel({ tour, tourZones, stops, dateId, onDone }: { tour: Tour; tourZones: Zone[]; stops: TourAppointment[]; dateId: string; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [animals, setAnimals] = useState<AnimalSearchResult[]>([]);
  const [services, setServices] = useState<PublicService[] | null>(null);
  const [selected, setSelected] = useState<AnimalSearchResult | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [start, setStart] = useState(() => (stops.length > 0 ? stops[stops.length - 1].endTime : tour.startTime));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    getPublicServices().then((all) => setServices(all.filter((service) => service.homeEnabled)));
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_CHARS) {
      // queueMicrotask : évite d'appeler setState de façon synchrone au corps
      // de l'effet (même convention que unified-search.tsx).
      queueMicrotask(() => setAnimals([]));
      return;
    }
    const requestId = ++requestIdRef.current;
    searchClientsAndAnimalsAction(trimmed).then((result) => {
      if (requestId !== requestIdRef.current) return;
      setAnimals(result.animals);
    });
  }, [query]);

  // Dérivé au rendu plutôt que synchronisé par effet (pas de service
  // sélectionné explicitement tant que la liste n'a pas encore chargé).
  const effectiveServiceId = serviceId || services?.[0]?.id || "";

  function pickAnimal(animal: AnimalSearchResult) {
    setSelected(animal);
    setAnimals([]);
    setQuery("");
  }

  async function submit() {
    if (!selected || !effectiveServiceId) return;
    setSubmitting(true);
    setError(null);
    const result = await addTourStopAction({ clientId: selected.clientId, animalId: selected.id, serviceId: effectiveServiceId, date: dateId, start });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    notify.success(`${selected.name} a été ajouté à la tournée.`);
    onDone();
  }

  const outOfZone = selected ? !cityInZones(selected.city, tourZones) : false;

  return (
    <div className="mt-3 rounded-xl border border-[#d9e5e2] bg-animeo-bg p-3.5">
      {!selected ? (
        <div className="relative">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un animal (nom)"
            className="min-h-10 w-full rounded-lg border border-[#d7e4e1] bg-white px-3 text-sm text-animeo-dark"
            autoFocus
          />
          {query.trim().length >= MIN_SEARCH_CHARS ? (
            <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-[#d7e4e1] bg-white">
              {animals.length === 0 ? (
                <p className="p-3 text-xs text-animeo-muted">Aucun animal ne correspond.</p>
              ) : (
                animals.map((animal) => (
                  <button
                    key={animal.id}
                    type="button"
                    onClick={() => pickAnimal(animal)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-animeo-bg"
                  >
                    <span className="font-medium text-animeo-dark">{animal.name} <span className="text-animeo-muted">· {animal.species}</span></span>
                    <span className="truncate text-xs text-animeo-muted">{animal.ownerName} · {animal.city}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-animeo-dark">
              {selected.name} <span className="text-animeo-muted">· {selected.species} · {selected.ownerName} · {selected.city}</span>
            </p>
            <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-xs font-medium text-animeo-muted hover:text-animeo-dark">Changer</button>
          </div>

          {outOfZone ? (
            <p className="mt-2 rounded-lg bg-[#fff3e0] px-3 py-2 text-xs text-[#a9573b]">
              Hors zone : cette adresse ne correspond à aucune zone de cette tournée. Le rendez-vous sera bien créé, mais pourrait ne pas réapparaître dans cette liste.
            </p>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="add-stop-service" className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Prestation</label>
              <select id="add-stop-service" value={effectiveServiceId} onChange={(event) => setServiceId(event.target.value)} className="min-h-10 w-full rounded-lg border border-[#d7e4e1] bg-white px-2.5 text-sm text-animeo-dark">
                {(services ?? []).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="add-stop-start" className="mb-1 block text-[11px] font-medium uppercase tracking-[0.06em] text-animeo-muted">Heure</label>
              <input id="add-stop-start" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="min-h-10 w-full rounded-lg border border-[#d7e4e1] bg-white px-2.5 text-sm text-animeo-dark" />
            </div>
          </div>

          {error ? <p role="alert" className="mt-2 text-xs text-animeo-error">{error}</p> : null}

          <button
            type="button"
            onClick={submit}
            disabled={submitting || !effectiveServiceId}
            className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-animeo px-4 text-sm font-medium text-animeo transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Ajout…" : "Ajouter à la tournée"}
          </button>
        </div>
      )}
    </div>
  );
}

function GoButton({ coordinates }: { coordinates: Coordinates }) {
  // Préférence lue après l'hydratation, ajustée pendant le rendu plutôt que
  // dans un effet (même motif que notifications-bell.tsx) : le serveur et le
  // premier rendu client valent toujours "google" (useHasMounted), jamais de
  // désaccord d'hydratation malgré la vraie préférence lue en localStorage.
  const hasMounted = useHasMounted();
  const [provider, setProvider] = useState<NavProvider>("google");
  const [providerLoaded, setProviderLoaded] = useState(false);
  if (hasMounted && !providerLoaded) {
    setProviderLoaded(true);
    setProvider(readStoredNavProvider());
  }
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function choose(next: NavProvider) {
    setProvider(next);
    persistNavProvider(next);
    setOpen(false);
  }

  return (
    <div ref={menuRef} className="relative inline-flex">
      <a
        href={buildNavUrl(provider, coordinates)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-9 items-center gap-1.5 rounded-l-lg bg-animeo-bg py-0 pl-3 pr-2 text-xs font-medium text-animeo-dark transition hover:bg-animeo-soft"
      >
        <Icon name="car" className="h-3.5 w-3.5" /> Y aller
      </a>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choisir l’application de navigation"
        className="inline-flex min-h-9 items-center rounded-r-lg border-l border-white bg-animeo-bg px-1.5 text-animeo-dark transition hover:bg-animeo-soft"
      >
        <Icon name="arrow" className="h-3 w-3 rotate-90" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-[calc(100%+4px)] z-10 w-40 rounded-lg border border-[#e5eeeb] bg-white p-1 shadow-[0_12px_28px_rgba(21,63,71,0.16)]">
          {navProviders.map((option) => (
            <a
              key={option}
              role="menuitem"
              href={buildNavUrl(option, coordinates)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => choose(option)}
              className={`block rounded-md px-2.5 py-1.5 text-left text-xs ${option === provider ? "bg-animeo-soft font-medium text-animeo-dark" : "text-animeo-dark hover:bg-animeo-bg"}`}
            >
              {navProviderLabels[option]}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
