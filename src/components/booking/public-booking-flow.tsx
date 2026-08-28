"use client";

import { useEffect, useRef, useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingProgress } from "@/components/booking/booking-progress";
import { ConsultationStep } from "@/components/booking/location-service-steps";
import { DetailsStep } from "@/components/booking/details-step";
import { ScheduleStep } from "@/components/booking/schedule-step";
import { BookingSummary, BookingSuccess } from "@/components/booking/summary-steps";
import { submitPublicBookingAction } from "@/lib/appointments-actions";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicBookingRequest, PublicProfessional } from "@/data/public-booking";

export type BookingScreen = "consultation" | "details" | "schedule" | "summary" | "success";

const emptyAddress: BookingAddress = { address: "", addressExtra: "", postalCode: "", city: "" };
const emptyOwner: OwnerInformation = { firstName: "", lastName: "", phone: "", email: "", ...emptyAddress };
const emptyAnimal: AnimalInformation = { name: "", species: "Chien", breed: "", birthDate: "", birthDateApproximate: false, notes: "" };

function progressFor(screen: BookingScreen) {
  if (screen === "consultation") return 1;
  if (screen === "details") return 2;
  if (screen === "schedule") return 3;
  return 4;
}

type PersistedBookingState = {
  screen: BookingScreen;
  mode: BookingMode | null;
  serviceId: string | null;
  address: BookingAddress;
  zoneId: string | null;
  dateId: string | null;
  time: string | null;
  owner: OwnerInformation;
  animal: AnimalInformation;
  bookingStartedAt: number;
};

// Préfixée par praticien (plusieurs tunnels publics possibles) et versionnée
// (voir skill vercel-react-best-practices, client-localstorage-schema) : une
// évolution future de PersistedBookingState pourra changer ce suffixe sans
// risquer de relire une structure obsolète.
function storageKeyFor(slug: string) {
  return `animeo:booking:v1:${slug}`;
}

function loadPersistedBooking(slug: string): PersistedBookingState | null {
  try {
    const raw = sessionStorage.getItem(storageKeyFor(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedBookingState;
    // Un écran de succès resterait figé et périmé : ne jamais le rouvrir,
    // un rafraîchissement après confirmation doit repartir de zéro.
    if (parsed.screen === "success") return null;
    return parsed;
  } catch {
    // sessionStorage peut lever (navigation privée, quota, désactivé) et le
    // contenu peut être corrompu/d'un ancien format : dans tous les cas, on
    // repart d'un tunnel vierge plutôt que de faire planter la page.
    return null;
  }
}

function savePersistedBooking(slug: string, state: PersistedBookingState) {
  try {
    sessionStorage.setItem(storageKeyFor(slug), JSON.stringify(state));
  } catch {
    // Best-effort : la réservation reste utilisable sans persistance.
  }
}

function clearPersistedBooking(slug: string) {
  try {
    sessionStorage.removeItem(storageKeyFor(slug));
  } catch {
    // Rien à faire de plus : voir savePersistedBooking.
  }
}

export function PublicBookingFlow({ professional }: { professional: PublicProfessional }) {
  const [screen, setScreen] = useState<BookingScreen>("consultation");
  const [mode, setMode] = useState<BookingMode | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [address, setAddress] = useState<BookingAddress>(emptyAddress);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [dateId, setDateId] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerInformation>(emptyOwner);
  const [animal, setAnimal] = useState<AnimalInformation>(emptyAnimal);
  const [request, setRequest] = useState<PublicBookingRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Signal anti-bot best-effort : un envoi plus rapide que le temps humain
  // plausible pour remplir le tunnel est suspect (voir MIN_FORM_FILL_MS,
  // src/lib/booking-validation.ts). Restauré depuis sessionStorage s'il y a
  // une session en cours (voir l'effet de restauration ci-dessous) : un
  // rafraîchissement en cours de saisie ne doit ni pénaliser un vrai
  // utilisateur (délai remis à zéro) ni offrir un contournement à un bot
  // (il suffirait de rafraîchir juste avant d'envoyer). Jamais réinitialisé
  // par resetBooking() : recommencer une demande ne remet pas le chronomètre
  // à zéro non plus.
  const [bookingStartedAt, setBookingStartedAt] = useState(() => Date.now());
  const skipInitialFocus = useRef(true);
  // "unset" tant que la restauration éventuelle depuis sessionStorage n'a pas
  // été tentée : voir l'effet de restauration ci-dessous, qui doit s'exécuter
  // avant que quoi que ce soit ne (re)persiste ou ne touche l'historique.
  const [restored, setRestored] = useState(false);
  const previousScreenRef = useRef<BookingScreen | "unset">("unset");
  const isApplyingPopStateRef = useRef(false);

  // Restaure une session de réservation interrompue (rafraîchissement, appel
  // entrant, notification…) — corrige le P0 "toute la saisie est perdue au
  // rafraîchissement". Ne peut lire sessionStorage que côté client, donc
  // après le montage (le rendu serveur/l'hydratation initiale restent sur
  // l'état vierge par défaut, pour éviter un mismatch d'hydratation) : un
  // très bref retour à l'étape 1 avant le saut vers l'étape restaurée est le
  // compromis attendu de ce pattern.
  useEffect(() => {
    const saved = loadPersistedBooking(professional.slug);
    // queueMicrotask : évite d'appeler setState de façon synchrone au corps
    // de l'effet (même convention que schedule-step.tsx et
    // src/components/availability/manual-availability.ts).
    queueMicrotask(() => {
      if (saved) {
        setScreen(saved.screen);
        setMode(saved.mode);
        setServiceId(saved.serviceId);
        setAddress(saved.address);
        setZoneId(saved.zoneId);
        setDateId(saved.dateId);
        setTime(saved.time);
        setOwner(saved.owner);
        setAnimal(saved.animal);
        setBookingStartedAt(saved.bookingStartedAt);
      }
      setRestored(true);
    });
  }, [professional.slug]);

  // Persiste l'état courant à chaque changement, une fois la restauration
  // éventuelle effectuée (le garde `restored` évite d'écraser une session
  // tout juste relue avec l'état vierge du tout premier rendu — les deux
  // effets s'exécutent dans le même commit initial, mais les setState de
  // l'effet de restauration ne s'appliquent qu'au rendu suivant). Efface le
  // stockage dès que l'écran de succès est atteint : rien à reprendre après
  // une confirmation.
  useEffect(() => {
    if (!restored) return;
    if (screen === "success") {
      clearPersistedBooking(professional.slug);
      return;
    }
    savePersistedBooking(professional.slug, { screen, mode, serviceId, address, zoneId, dateId, time, owner, animal, bookingStartedAt });
  }, [restored, professional.slug, screen, mode, serviceId, address, zoneId, dateId, time, owner, animal, bookingStartedAt]);

  // Une entrée d'historique par étape (corrige le P0 "le bouton Retour du
  // navigateur quitte la page") : chaque changement d'écran qui ne vient pas
  // lui-même d'un popstate pousse une nouvelle entrée ; le tout premier écran
  // stable (après restauration éventuelle) remplace l'entrée existante au
  // lieu d'en empiler une, pour qu'un Retour navigateur sorte bien du tunnel
  // une fois toutes les étapes dépilées plutôt que de tourner en rond.
  useEffect(() => {
    if (!restored) return;
    if (previousScreenRef.current === "unset") {
      window.history.replaceState({ screen }, "", window.location.href);
    } else if (isApplyingPopStateRef.current) {
      isApplyingPopStateRef.current = false;
    } else if (previousScreenRef.current !== screen) {
      window.history.pushState({ screen }, "", window.location.href);
    }
    previousScreenRef.current = screen;
  }, [restored, screen]);

  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const nextScreen = (event.state as { screen?: BookingScreen } | null)?.screen;
      // Absence d'état : on est sorti de la pile que ce tunnel gère —
      // laisser le navigateur poursuivre sa navigation normale.
      if (!nextScreen) return;
      isApplyingPopStateRef.current = true;
      setScreen(nextScreen);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Déplace le focus sur le titre du nouvel écran à chaque changement
  // d'étape (pattern WAI-ARIA "wizard") : sans ça, un utilisateur au
  // clavier/lecteur d'écran garde le focus sur un bouton qui vient de
  // disparaître, et rien ne signale que l'écran a changé. Ignoré au tout
  // premier rendu pour ne pas voler le focus au chargement de la page.
  // Une erreur d'envoi affichée à l'étape 4 n'a plus de sens si l'on change
  // d'écran par un autre chemin (Retour navigateur compris) : elle est
  // effacée au même moment plutôt que de rester affichée hors contexte.
  useEffect(() => {
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }
    setSubmitError(null);
    document.getElementById("booking-step-heading")?.focus();
  }, [screen]);

  // Va à l'écran précédent via l'historique du navigateur plutôt qu'en
  // appelant setScreen directement : le bouton "Retour" interne et le Retour
  // natif du navigateur empruntent ainsi exactement le même chemin (voir
  // l'écouteur popstate ci-dessus), au lieu de désynchroniser la pile
  // d'historique construite par l'effet précédent.
  function goToPreviousScreen() {
    window.history.back();
  }

  const service = professional.services.find((item) => item.id === serviceId);
  const zone = professional.zones.find((item) => item.id === zoneId);
  const consultationPrice = service && mode ? (mode === "CABINET" ? service.cabinetPrice : service.homePrice) : 0;
  const travelFee = service && mode === "HOME"
    ? service.travelFeeMode === "fixed" ? service.fixedTravelFee : service.travelFeeMode === "zone" ? zone?.travelFee ?? 0 : 0
    : 0;

  function resetBooking() {
    setScreen("consultation");
    setMode(null);
    setServiceId(null);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
    setOwner(emptyOwner);
    setAnimal(emptyAnimal);
    setRequest(null);
    setSubmitError(null);
  }

  function changeService(nextServiceId: string) {
    if (nextServiceId === serviceId) return;
    // La durée dépend de la prestation : un créneau déjà choisi peut ne
    // plus être proposé avec la nouvelle prestation. Ne prévenir que s'il y
    // a réellement quelque chose à perdre (voir changeMode ci-dessous).
    if (dateId && !window.confirm("Changer de prestation réinitialisera le créneau que vous avez choisi. Continuer ?")) return;
    const selectedService = professional.services.find((item) => item.id === nextServiceId);
    setServiceId(nextServiceId);
    setAnimal((current) => ({ ...current, species: selectedService?.animalTypes[0] ?? "Chien" }));
    setMode(null);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
  }

  function changeMode(nextMode: BookingMode) {
    if (nextMode === mode) return;
    // La disponibilité dépend du mode (cabinet vs domicile peuvent différer
    // sur un même horaire) : un créneau déjà choisi peut ne plus être
    // proposé sous le nouveau mode. Avertir uniquement quand un choix réel
    // serait perdu, pas à la toute première sélection (P1 "réinitialisations
    // silencieuses" — mais sans ajouter de friction là où rien n'est perdu).
    if (dateId && !window.confirm("Changer de mode de consultation réinitialisera le créneau que vous avez choisi. Continuer ?")) return;
    setMode(nextMode);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
  }

  function changeAddress(value: BookingAddress) {
    // Une prestation/un mode déjà choisis restent valables quelle que soit
    // l'adresse : la disponibilité des créneaux n'en dépend pas (seul le
    // regroupement par tournée, purement indicatif, peut différer). Ne plus
    // effacer date/heure à chaque frappe dans le champ adresse — c'était le
    // cas jusqu'ici et effaçait un créneau déjà choisi sans aucun rapport
    // avec un changement réel de disponibilité.
    setAddress(value);
    setOwner((current) => ({ ...current, ...value }));
  }

  async function submitRequest() {
    if (!mode || !service || !dateId || !time) return;
    setSubmitting(true);
    setSubmitError(null);

    const homeLocation = [address.address, address.addressExtra].filter(Boolean).join(" ")
      + (address.postalCode || address.city ? `, ${[address.postalCode, address.city].filter(Boolean).join(" ")}` : "");

    const result = await submitPublicBookingAction({
      serviceId: service.id,
      date: dateId,
      start: time,
      clientName: `${owner.firstName} ${owner.lastName}`.trim(),
      animalName: animal.name,
      mode: mode === "CABINET" ? "cabinet" : "home",
      location: mode === "CABINET" ? "Cabinet" : homeLocation,
      bookingStartedAt,
      postalCode: mode === "HOME" ? address.postalCode || undefined : undefined,
      city: mode === "HOME" ? address.city || undefined : undefined,
      inseeCode: mode === "HOME" ? address.citycode : undefined,
      latitude: mode === "HOME" ? address.latitude : undefined,
      longitude: mode === "HOME" ? address.longitude : undefined,
      notes: animal.notes || "Demande reçue depuis la page publique de réservation.",
      ownerFirstName: owner.firstName || undefined,
      ownerLastName: owner.lastName || undefined,
      ownerPhone: owner.phone || undefined,
      ownerEmail: owner.email || undefined,
      ownerAddress: owner.address || undefined,
      ownerCity: owner.city || undefined,
      animalSpecies: animal.species || undefined,
      animalBreed: animal.breed || undefined,
      animalBirthDate: animal.birthDate || undefined,
      animalBirthDateApproximate: animal.birthDateApproximate,
    });

    setSubmitting(false);

    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }

    const bookingRequest: PublicBookingRequest = {
      id: result.id,
      status: "PENDING",
      professionalSlug: professional.slug,
      mode,
      serviceId: service.id,
      address: mode === "HOME" ? address : undefined,
      zoneId: mode === "HOME" ? zoneId ?? undefined : undefined,
      date: dateId,
      time,
      owner,
      animal,
      consultationPrice,
      travelFee,
      totalPrice: consultationPrice + travelFee,
      createdAt: new Date().toISOString(),
    };
    setRequest(bookingRequest);
    setScreen("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-[#f4f9f7] text-animeo-dark">
      <BookingHeader professional={professional} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {screen !== "success" ? <BookingProgress current={progressFor(screen)} /> : null}
        <section className="rounded-[18px] border border-[#dfe9e6] bg-white p-4 shadow-[0_14px_45px_rgba(24,59,69,0.08)] sm:p-8">
          {screen === "consultation" ? (
            <ConsultationStep
              professional={professional}
              serviceId={serviceId}
              mode={mode}
              onServiceChange={changeService}
              onModeChange={changeMode}
              onNext={() => setScreen("details")}
            />
          ) : null}
          {screen === "details" && mode && service ? (
            <DetailsStep
              professional={professional}
              mode={mode}
              service={service}
              owner={owner}
              onOwnerChange={setOwner}
              address={address}
              onAddressChange={changeAddress}
              zoneId={zoneId}
              onZoneChange={setZoneId}
              animal={animal}
              onAnimalChange={setAnimal}
              onBack={goToPreviousScreen}
              onNext={() => setScreen("schedule")}
            />
          ) : null}
          {screen === "schedule" && mode && service ? <ScheduleStep professional={professional} mode={mode} service={service} clientAddress={mode === "HOME" ? address : owner} zoneId={zoneId} dateId={dateId} time={time} onDateChange={(value) => { setDateId(value); setTime(null); }} onTimeChange={setTime} onBack={goToPreviousScreen} onNext={() => setScreen("summary")} /> : null}
          {screen === "summary" && mode && service && dateId && time ? <BookingSummary professional={professional} mode={mode} service={service} address={address} dateId={dateId} time={time} owner={owner} animal={animal} consultationPrice={consultationPrice} travelFee={travelFee} submitting={submitting} submitError={submitError} onBack={goToPreviousScreen} onSubmit={submitRequest} /> : null}
          {screen === "success" && request && service ? <BookingSuccess professional={professional} request={request} service={service} onReset={resetBooking} /> : null}
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-6 text-center text-xs font-bold text-animeo-muted">
          <span>Propulsé par</span><AnimeoLogo size="footer" />
        </footer>
      </div>
    </main>
  );
}
