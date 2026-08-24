const steps = ["Lieu", "Prestation", "Créneau", "Informations", "Confirmation"];

export function BookingProgress({ current }: { current: number }) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="mb-2 flex items-center justify-between text-xs font-extrabold text-animeo-muted sm:hidden">
        <span>Étape {current} sur 5</span>
        <span>{steps[current - 1]}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {steps.map((step, index) => {
          const number = index + 1;
          const active = number <= current;
          return (
            <div key={step} className="min-w-0">
              <div className={`h-1.5 rounded-full transition ${active ? "bg-animeo" : "bg-[#dfe8e5]"}`} />
              <p className={`mt-2 hidden truncate text-center text-xs font-extrabold sm:block ${number === current ? "text-animeo-dark" : "text-animeo-muted"}`}>{number} {step}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
