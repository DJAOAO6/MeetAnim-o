import { PAGE_DIMENSIONS } from "@/components/documents/editor/page-geometry";
import type { DocumentLayoutSketchItem } from "@/data/documents";

const SHAPE_FALLBACK = "#e5eceb";
const OTHER_FILL: Record<string, string> = {
  text: "#d7dee0",
  image: "#c9d4d6",
  diagram: "#e7cba3",
};

/**
 * Croquis de mise en page d'un modèle (étape 7) : positions/couleurs réelles
 * du modèle, mises à l'échelle de la carte — pas une capture d'écran (texte
 * jamais lisible, jamais rendu). Coût nul (pur CSS depuis une géométrie déjà
 * récupérée), voir buildLayoutSketch() dans lib/documents/content.ts.
 */
export function TemplateThumbnailSketch({ layoutSketch, pageSize = "A4_PORTRAIT" }: { layoutSketch: DocumentLayoutSketchItem[]; pageSize?: "A4_PORTRAIT" | "A4_LANDSCAPE" }) {
  const { width: pageWidth, height: pageHeight } = PAGE_DIMENSIONS[pageSize];

  return (
    <div data-testid="template-sketch" className="relative w-full overflow-hidden bg-white" style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }} aria-hidden="true">
      {layoutSketch.map((item, index) => (
        <div
          key={index}
          className="absolute"
          style={{
            left: `${(item.x / pageWidth) * 100}%`,
            top: `${(item.y / pageHeight) * 100}%`,
            width: `${(item.width / pageWidth) * 100}%`,
            height: `${(item.height / pageHeight) * 100}%`,
            backgroundColor: item.fill ?? OTHER_FILL[item.type] ?? SHAPE_FALLBACK,
          }}
        />
      ))}
    </div>
  );
}
