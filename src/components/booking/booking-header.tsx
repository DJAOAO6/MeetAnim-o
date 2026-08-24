import type { PublicProfessional } from "@/data/public-booking";

export function BookingHeader({ professional }: { professional: PublicProfessional }) {
  return (
    <header className="border-b border-[#dfe9e6] bg-white">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-7">
        <div className="flex items-start gap-4 sm:gap-6">
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-animeo-dark text-lg font-black text-white shadow-sm sm:h-20 sm:w-20 sm:text-xl">{professional.logo}</div>
            <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-animeo-soft text-[10px] font-black text-animeo-dark sm:h-11 sm:w-11">{professional.photo}</div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: professional.color }}>{professional.company}</p>
            <h1 className="mt-1 text-xl font-black text-animeo-dark sm:text-3xl">{professional.firstName} {professional.lastName}</h1>
            <p className="text-sm font-extrabold" style={{ color: professional.color }}>{professional.profession}</p>
            <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-animeo-muted sm:block">{professional.bio}</p>
            <p className="mt-2 text-xs font-bold text-animeo-muted">⌖ {professional.location}</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-animeo-muted sm:hidden">{professional.bio}</p>
      </div>
    </header>
  );
}
