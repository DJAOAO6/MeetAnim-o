import Link from "next/link";
import { AnimeoLogo } from "@/components/brand/animeo-logo";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-6">
      <div className="max-w-2xl text-center">
        <AnimeoLogo className="mx-auto" size="hero" priority />
        <p className="mt-4 text-lg font-semibold text-animeo sm:text-xl">
          L’agenda intelligent des professionnels animaliers.
        </p>
        <Link
          href="/dashboard"
          className="mt-10 inline-flex items-center rounded-[14px] bg-animeo-dark px-6 py-3.5 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#214d59]"
        >
          Ouvrir le tableau de bord
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </Link>
      </div>
    </main>
  );
}
