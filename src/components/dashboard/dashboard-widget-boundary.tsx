"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

type Props = { label: string; children: ReactNode };
type State = { failed: boolean };

/**
 * Isole un bloc du tableau de bord.
 *
 * Sans cela, une seule donnée inattendue dans un seul widget — une tournée
 * sans zone, un rendez-vous sans espèce — faisait disparaître **tout** le
 * tableau de bord derrière l'écran d'erreur de Next.js. Le praticien perdait
 * son planning du jour à cause d'un graphique.
 *
 * Ici, le bloc fautif affiche son propre message et le reste de la page
 * continue de fonctionner. C'est une classe parce que React n'expose la
 * capture d'erreur de rendu qu'aux composants de classe.
 */
export class DashboardWidgetBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Journalisé pour être retrouvable côté serveur de développement : un bloc
    // qui échoue en silence est un bug qu'on ne corrigera jamais.
    console.error(`Tableau de bord — le bloc « ${this.props.label} » n'a pas pu s'afficher.`, error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Card className="flex h-full flex-col items-start gap-2 p-[var(--dashboard-card-padding)]">
        <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-danger-soft text-animeo-danger">
          <Icon name="shield" className="h-5 w-5" />
        </span>
        <p className="text-sm font-black text-animeo-dark">{this.props.label}</p>
        <p className="text-xs text-animeo-muted">
          Ce bloc n’a pas pu s’afficher. Le reste de votre tableau de bord reste utilisable ; actualisez la page pour réessayer.
        </p>
      </Card>
    );
  }
}
