"use client";

import { useState } from "react";
import { BookingHeader } from "@/components/booking/booking-header";
import { BookingProgress } from "@/components/booking/booking-progress";
import { LocationStep, ServiceStep, AddressStep } from "@/components/booking/location-service-steps";
import { ScheduleStep } from "@/components/booking/schedule-step";
import { AnimalStep, OwnerStep } from "@/components/booking/information-steps";
import { BookingSummary, BookingSuccess } from "@/components/booking/summary-steps";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicBookingRequest, PublicProfessional } from "@/data/public-booking";

export type BookingScreen = "location" | "service" | "address" | "schedule" | "owner" | "animal" | "summary" | "success";

const emptyAddress: BookingAddress = { address: "", addressExtra: "", postalCode: "", city: "" };
const emptyOwner: OwnerInformation = { firstName: "", lastName: "", phone: "", email: "", ...emptyAddress };
const emptyAnimal: AnimalInformation = { name: "", species: "Chien", breed: "", ageOrBirthDate: "", notes: "" };

function progressFor(screen: BookingScreen) {
  if (screen === "location") return 1;
  if (screen === "service") return 2;
  if (screen === "owner" || screen === "address" || screen === "animal") return 3;
  if (screen === "schedule") return 4;
  return 5;
}

export function PublicBookingFlow({ professional }: { professional: PublicProfessional }) {
  const [screen, setScreen] = useState<BookingScreen>("location");
  const [mode, setMode] = useState<BookingMode | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [address, setAddress] = useState<BookingAddress>(emptyAddress);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [dateId, setDateId] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerInformation>(emptyOwner);
  const [animal, setAnimal] = useState<AnimalInformation>(emptyAnimal);
  const [request, setRequest] = useState<PublicBookingRequest | null>(null);

  const service = professional.services.find((item) => item.id === serviceId);
  const zone = professional.zones.find((item) => item.id === zoneId);
  const consultationPrice = service && mode ? (mode === "CABINET" ? service.cabinetPrice : service.homePrice) : 0;
  const travelFee = service && mode === "HOME"
    ? service.travelFeeMode === "fixed" ? service.fixedTravelFee : service.travelFeeMode === "zone" ? zone?.travelFee ?? 0 : 0
    : 0;

  function resetBooking() {
    setScreen("location");
    setMode(null);
    setServiceId(null);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
    setOwner(emptyOwner);
    setAnimal(emptyAnimal);
    setRequest(null);
  }

  function switchToCabinet() {
    setMode("CABINET");
    setServiceId(null);
    setAddress(emptyAddress);
    setZoneId(null);
    setDateId(null);
    setTime(null);
    setScreen("service");
  }

  function submitRequest() {
    if (!mode || !service || !dateId || !time) return;
    const bookingRequest: PublicBookingRequest = {
      id: `booking-${Date.now()}`,
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
    const storageKey = "animeo-pending-bookings";
    try {
      const current = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as PublicBookingRequest[];
      localStorage.setItem(storageKey, JSON.stringify([...current, bookingRequest]));
    } catch {
      // La confirmation reste disponible même si le stockage du navigateur est bloqué.
    }
    setRequest(bookingRequest);
    setScreen("success");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-screen bg-[#f4f9f7] text-animeo-dark">
      <BookingHeader professional={professional} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {screen !== "success" ? <BookingProgress current={progressFor(screen)} /> : null}
        <section className="rounded-3xl border border-[#dfe9e6] bg-white p-4 shadow-[0_14px_45px_rgba(24,59,69,0.08)] sm:p-8">
          {screen === "location" ? <LocationStep professional={professional} value={mode} onChange={(value) => { setMode(value); setServiceId(null); setAddress(emptyAddress); setZoneId(null); setDateId(null); setTime(null); }} onNext={() => setScreen("service")} /> : null}
          {screen === "service" && mode ? <ServiceStep professional={professional} mode={mode} value={serviceId} onChange={(value) => { const selectedService = professional.services.find((item) => item.id === value); setServiceId(value); setAnimal((current) => ({ ...current, species: selectedService?.animalTypes[0] ?? "Chien" })); setDateId(null); setTime(null); }} onBack={() => setScreen("location")} onNext={() => setScreen("owner")} /> : null}
          {screen === "owner" && mode ? <OwnerStep mode={mode} value={owner} onChange={setOwner} onBack={() => setScreen("service")} onNext={() => setScreen(mode === "HOME" ? "address" : "animal")} /> : null}
          {screen === "address" && service ? <AddressStep professional={professional} service={service} value={address} zoneId={zoneId} onChange={(value) => { setAddress(value); setOwner((current) => ({ ...current, ...value })); setDateId(null); setTime(null); }} onZoneChange={(value) => { setZoneId(value); setDateId(null); setTime(null); }} onBack={() => setScreen("owner")} onNext={() => setScreen("animal")} onSwitchToCabinet={switchToCabinet} /> : null}
          {screen === "animal" && mode && service ? <AnimalStep service={service} value={animal} onChange={setAnimal} onBack={() => setScreen(mode === "HOME" ? "address" : "owner")} onNext={() => setScreen("schedule")} /> : null}
          {screen === "schedule" && mode && service ? <ScheduleStep professional={professional} mode={mode} service={service} clientAddress={mode === "HOME" ? address : owner} zoneId={zoneId} dateId={dateId} time={time} onDateChange={(value) => { setDateId(value); setTime(null); }} onTimeChange={setTime} onBack={() => setScreen("animal")} onNext={() => setScreen("summary")} /> : null}
          {screen === "summary" && mode && service && dateId && time ? <BookingSummary professional={professional} mode={mode} service={service} address={address} dateId={dateId} time={time} owner={owner} animal={animal} consultationPrice={consultationPrice} travelFee={travelFee} onBack={() => setScreen("schedule")} onSubmit={submitRequest} /> : null}
          {screen === "success" && request && service ? <BookingSuccess professional={professional} request={request} service={service} onReset={resetBooking} /> : null}
        </section>
        <footer className="py-6 text-center text-xs font-bold text-animeo-muted">Propulsé par <span className="font-black text-animeo-dark">Anim<span className="text-animeo">éo</span></span> · Aucune donnée n’est envoyée pour cette démonstration</footer>
      </div>
    </main>
  );
}
