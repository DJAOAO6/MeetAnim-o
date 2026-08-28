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
  // src/lib/booking-validation.ts). Pris une seule fois au montage, jamais
  // réinitialisé par resetBooking() : recommencer une demande ne doit pas
  // remettre le chronomètre à zéro.
  const [bookingStartedAt] = useState(() => Date.now());
  const skipInitialFocus = useRef(true);

  // Déplace le focus sur le titre du nouvel écran à chaque changement
  // d'étape (pattern WAI-ARIA "wizard") : sans ça, un utilisateur au
  // clavier/lecteur d'écran garde le focus sur un bouton qui vient de
  // disparaître, et rien ne signale que l'écran a changé. Ignoré au tout
  // premier rendu pour ne pas voler le focus au chargement de la page.
  useEffect(() => {
    if (skipInitialFocus.current) {
      skipInitialFocus.current = false;
      return;
    }
    document.getElementById("booking-step-heading")?.focus();
  }, [screen]);

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

  function changeMode(nextMode: BookingMode) {
    setMode(nextMode);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
  }

  function changeAddress(value: BookingAddress) {
    setAddress(value);
    setOwner((current) => ({ ...current, ...value }));
    setDateId(null);
    setTime(null);
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
              onServiceChange={(value) => { const selectedService = professional.services.find((item) => item.id === value); setServiceId(value); setAnimal((current) => ({ ...current, species: selectedService?.animalTypes[0] ?? "Chien" })); setMode(null); setAddress(emptyAddress); setZoneId(null); setDateId(null); setTime(null); }}
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
              onBack={() => setScreen("consultation")}
              onNext={() => setScreen("schedule")}
            />
          ) : null}
          {screen === "schedule" && mode && service ? <ScheduleStep professional={professional} mode={mode} service={service} clientAddress={mode === "HOME" ? address : owner} zoneId={zoneId} dateId={dateId} time={time} onDateChange={(value) => { setDateId(value); setTime(null); }} onTimeChange={setTime} onBack={() => setScreen("details")} onNext={() => setScreen("summary")} /> : null}
          {screen === "summary" && mode && service && dateId && time ? <BookingSummary professional={professional} mode={mode} service={service} address={address} dateId={dateId} time={time} owner={owner} animal={animal} consultationPrice={consultationPrice} travelFee={travelFee} submitting={submitting} submitError={submitError} onBack={() => { setSubmitError(null); setScreen("schedule"); }} onSubmit={submitRequest} /> : null}
          {screen === "success" && request && service ? <BookingSuccess professional={professional} request={request} service={service} onReset={resetBooking} /> : null}
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-6 text-center text-xs font-bold text-animeo-muted">
          <span>Propulsé par</span><AnimeoLogo size="footer" />
        </footer>
      </div>
    </main>
  );
}
