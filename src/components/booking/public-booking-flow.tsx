"use client";

import { useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingProgress } from "@/components/booking/booking-progress";
import { LocationStep, ServiceStep, AddressStep } from "@/components/booking/location-service-steps";
import { ScheduleStep } from "@/components/booking/schedule-step";
import { AnimalStep, OwnerStep } from "@/components/booking/information-steps";
import { BookingSummary, BookingSuccess } from "@/components/booking/summary-steps";
import { submitPublicBookingAction } from "@/lib/appointments-actions";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicBookingRequest, PublicProfessional } from "@/data/public-booking";

export type BookingScreen = "location" | "service" | "address" | "schedule" | "owner" | "animal" | "summary" | "success";

const emptyAddress: BookingAddress = { address: "", addressExtra: "", postalCode: "", city: "" };
const emptyOwner: OwnerInformation = { firstName: "", lastName: "", phone: "", email: "", ...emptyAddress };
const emptyAnimal: AnimalInformation = { name: "", species: "Chien", breed: "", ageOrBirthDate: "", notes: "" };

function progressFor(screen: BookingScreen) {
  if (screen === "service") return 1;
  if (screen === "location") return 2;
  if (screen === "owner" || screen === "address" || screen === "animal") return 3;
  if (screen === "schedule") return 4;
  return 5;
}

export function PublicBookingFlow({ professional }: { professional: PublicProfessional }) {
  const [screen, setScreen] = useState<BookingScreen>("service");
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

  const service = professional.services.find((item) => item.id === serviceId);
  const zone = professional.zones.find((item) => item.id === zoneId);
  const consultationPrice = service && mode ? (mode === "CABINET" ? service.cabinetPrice : service.homePrice) : 0;
  const travelFee = service && mode === "HOME"
    ? service.travelFeeMode === "fixed" ? service.fixedTravelFee : service.travelFeeMode === "zone" ? zone?.travelFee ?? 0 : 0
    : 0;

  function resetBooking() {
    setScreen("service");
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

  function switchToCabinet() {
    setMode("CABINET");
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
    setOwner((current) => ({ ...current, ...emptyAddress }));
    setScreen("owner");
  }

  async function submitRequest() {
    if (!mode || !service || !dateId || !time) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await submitPublicBookingAction({
      date: dateId,
      start: time,
      duration: service.duration,
      clientName: `${owner.firstName} ${owner.lastName}`.trim(),
      animalName: animal.name,
      serviceName: service.name,
      mode: mode === "CABINET" ? "cabinet" : "home",
      location: mode === "CABINET" ? "Cabinet" : address.city,
      price: consultationPrice + travelFee,
      notes: animal.notes || "Demande reçue depuis la page publique de réservation.",
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
          {screen === "service" ? <ServiceStep professional={professional} value={serviceId} onChange={(value) => { const selectedService = professional.services.find((item) => item.id === value); setServiceId(value); setAnimal((current) => ({ ...current, species: selectedService?.animalTypes[0] ?? "Chien" })); setMode(null); setAddress(emptyAddress); setZoneId(null); setDateId(null); setTime(null); }} onNext={() => setScreen("location")} /> : null}
          {screen === "location" && service ? <LocationStep professional={professional} service={service} value={mode} onChange={(value) => { setMode(value); setAddress(emptyAddress); setZoneId(null); setDateId(null); setTime(null); }} onBack={() => setScreen("service")} onNext={() => setScreen("owner")} /> : null}
          {screen === "owner" && mode ? <OwnerStep mode={mode} value={owner} onChange={setOwner} onBack={() => setScreen("location")} onNext={() => setScreen(mode === "HOME" ? "address" : "animal")} /> : null}
          {screen === "address" && service ? <AddressStep professional={professional} service={service} value={address} zoneId={zoneId} onChange={(value) => { setAddress(value); setOwner((current) => ({ ...current, ...value })); setDateId(null); setTime(null); }} onZoneChange={(value) => { setZoneId(value); setDateId(null); setTime(null); }} onBack={() => setScreen("owner")} onNext={() => setScreen("animal")} onSwitchToCabinet={switchToCabinet} /> : null}
          {screen === "animal" && mode && service ? <AnimalStep service={service} value={animal} onChange={setAnimal} onBack={() => setScreen(mode === "HOME" ? "address" : "owner")} onNext={() => setScreen("schedule")} /> : null}
          {screen === "schedule" && mode && service ? <ScheduleStep professional={professional} mode={mode} service={service} clientAddress={mode === "HOME" ? address : owner} zoneId={zoneId} dateId={dateId} time={time} onDateChange={(value) => { setDateId(value); setTime(null); }} onTimeChange={setTime} onBack={() => setScreen("animal")} onNext={() => setScreen("summary")} /> : null}
          {screen === "summary" && mode && service && dateId && time ? <BookingSummary professional={professional} mode={mode} service={service} address={address} dateId={dateId} time={time} owner={owner} animal={animal} consultationPrice={consultationPrice} travelFee={travelFee} submitting={submitting} submitError={submitError} onBack={() => { setSubmitError(null); setScreen("schedule"); }} onSubmit={submitRequest} /> : null}
          {screen === "success" && request && service ? <BookingSuccess professional={professional} request={request} service={service} onReset={resetBooking} /> : null}
        </section>
        <footer className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 py-6 text-center text-xs font-bold text-animeo-muted">
          <span>Propulsé par</span><AnimeoLogo size="footer" /><span>· Aucune donnée n’est envoyée pour cette démonstration</span>
        </footer>
      </div>
    </main>
  );
}
