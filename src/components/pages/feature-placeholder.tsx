import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

type FeaturePlaceholderProps = {
  title: string;
  description: string;
  icon: IconName;
  features: string[];
};

export function FeaturePlaceholder({ title, description, icon, features }: FeaturePlaceholderProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card className="overflow-hidden">
        <div className="border-b border-[#e5eeeb] bg-gradient-to-r from-animeo-soft to-white p-6 sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-animeo text-white shadow-[0_10px_24px_rgba(79,175,159,0.25)]">
            <Icon name={icon} className="h-7 w-7" />
          </div>
          <span className="mt-6 inline-flex rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-animeo">Structure prête</span>
          <h2 className="mt-3 text-2xl font-extrabold text-animeo-dark">La base de cette page est en place</h2>
          <p className="mt-2 max-w-2xl text-animeo-muted">
            Elle utilise maintenant le même cadre, la même navigation et les mêmes composants visuels que le tableau de bord.
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-animeo-muted">Fonctionnalités prévues</p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 rounded-2xl bg-animeo-bg p-4 font-bold text-animeo-dark">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-animeo-soft text-xs text-animeo">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}
