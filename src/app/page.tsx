import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-animeo-bg px-6">
      <div className="max-w-2xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-animeo-soft text-3xl">
          🐾
        </div>
        <h1 className="text-5xl font-extrabold tracking-tight text-animeo-dark sm:text-7xl">
          Anim<span className="text-animeo">éo</span>
        </h1>
        <p className="mt-4 text-lg font-semibold text-animeo sm:text-xl">
          L’agenda intelligent des professionnels animaliers.
        </p>
        <Link
          href="/dashboard"
          className="mt-10 inline-flex items-center rounded-2xl bg-animeo-dark px-6 py-3.5 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#214d59]"
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
