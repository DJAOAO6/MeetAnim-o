import { placeAnatomyLabels, type LabelCandidate } from "@/lib/anatomy/label-placement";
import type { AnatomyView } from "@/lib/anatomy/views";

/**
 * Couche 3/3 : les LIBELLÉS. Ils vivent dans une gouttière de part et
 * d'autre de l'illustration et sont reliés à leur zone par une fine ligne de
 * liaison — jamais posés sur l'anatomie, qu'ils masqueraient.
 *
 * Les tailles sont exprimées en unités de viewBox : à la largeur de rendu
 * visée (~600 px pour un viewBox de 1520), le titre tombe autour de 11 px et
 * le sous-titre autour de 9 px, cohérent avec les légendes des modèles de
 * documents. Une illustration livrée avec un autre viewBox demandera de
 * réaccorder ces constantes.
 */
export const LABEL_GUTTER = 260;
const LABEL_HEIGHT = 62;
const LABEL_MIN_GAP = 12;
const LABEL_PADDING = 16;
const TITLE_SIZE = 30;
const SUBTITLE_SIZE = 23;
/** Retrait du texte par rapport au bord de l'illustration. */
const TEXT_INSET = 18;
/** Longueur du segment horizontal avant que la ligne ne file vers la zone. */
const ELBOW = 34;

type AnatomyLabelsProps = {
  view: AnatomyView;
  candidates: LabelCandidate[];
  dimmedIds?: Set<string>;
};

export function AnatomyLabels({ view, candidates, dimmedIds }: AnatomyLabelsProps) {
  const placed = placeAnatomyLabels(candidates, {
    viewBox: view.viewBox,
    labelHeight: LABEL_HEIGHT,
    minGap: LABEL_MIN_GAP,
    padding: LABEL_PADDING,
  });

  return (
    <g aria-hidden="true">
      {placed.map((label) => {
        const isLeft = label.side === "left";
        const textX = isLeft ? -TEXT_INSET : view.viewBox.width + TEXT_INSET;
        const connectorX = isLeft ? -TEXT_INSET + 6 : view.viewBox.width + TEXT_INSET - 6;
        const elbowX = isLeft ? connectorX + ELBOW : connectorX - ELBOW;
        const dimmed = dimmedIds?.has(label.id) ?? false;

        return (
          <g key={label.id} opacity={dimmed ? 0.35 : 1} className="transition-opacity duration-200">
            <polyline
              points={`${connectorX},${label.y} ${elbowX},${label.y} ${label.anchor.x},${label.anchor.y}`}
              fill="none"
              stroke={label.color}
              strokeWidth={2}
              strokeOpacity={0.55}
              strokeLinejoin="round"
            />
            <circle cx={label.anchor.x} cy={label.anchor.y} r={5} fill={label.color} />

            <text
              x={textX}
              y={label.y}
              textAnchor={isLeft ? "end" : "start"}
              fontSize={TITLE_SIZE}
              fontWeight={700}
              fill="#183b45"
            >
              <tspan x={textX} dy={label.subtitle ? -4 : TITLE_SIZE / 3}>
                {label.title}
              </tspan>
              {label.subtitle ? (
                <tspan x={textX} dy={SUBTITLE_SIZE + 6} fontSize={SUBTITLE_SIZE} fontWeight={600} fill={label.color}>
                  {label.subtitle}
                </tspan>
              ) : null}
            </text>
          </g>
        );
      })}
    </g>
  );
}
