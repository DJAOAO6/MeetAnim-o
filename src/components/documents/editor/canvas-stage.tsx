"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Stage, Layer, Rect, Line, Circle, Ellipse, RegularPolygon, Star, Arrow, Text, Group, Image as KonvaImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { PAGE_DIMENSIONS } from "@/components/documents/editor/page-geometry";
import { useHtmlImage } from "@/components/documents/editor/use-html-image";
import { DOG_DIAGRAM_VIEWBOX, dogDiagramDataUri } from "@/lib/documents/dog-diagram";
import { colorForPreset } from "@/lib/documents/marker-presets";
import { computeGuides, type Box, type SmartGuide } from "@/components/documents/editor/smart-guides";
import type { DocumentDiagramElement, DocumentElement } from "@/lib/documents/content";

function rectsIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

// La rotation des éléments est ignorée pour ce test d'intersection (boîte
// englobante non pivotée) — simplification explicite et assumée, comme
// Figma/Canva le font aussi en pratique pour une sélection par glisser
// rapide (voir le plan, étape 13).
function hasShiftKey(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): boolean {
  return "shiftKey" in event.evt && event.evt.shiftKey === true;
}

const SNAP_THRESHOLD_PX = 4;

function guidesEqual(a: SmartGuide[], b: SmartGuide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((guide, index) => guide.orientation === b[index].orientation && guide.position === b[index].position);
}

type CanvasStageProps = {
  readOnly: boolean;
  // Exposé au parent pour l'export PDF (étape 5) — stage.toDataURL(), voir
  // export-pdf.ts. Optionnel : les tests/usages qui ne finalisent jamais un
  // document n'ont pas besoin de le fournir.
  stageRef?: RefObject<Konva.Stage | null>;
};

/**
 * Rendu Konva des éléments forme/image + un rectangle "fantôme" (bordure
 * pointillée, jamais rempli) pour chaque bloc de texte — le texte lui-même
 * est rendu par la surcouche DOM (text-overlay.tsx), jamais par Konva.Text,
 * pour une édition réellement agréable (voir le plan).
 */
export function CanvasStage({ readOnly, stageRef }: CanvasStageProps) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementIds = useDocumentStore((state) => state.selectedElementIds);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const selectElements = useDocumentStore((state) => state.selectElements);
  const setEditingText = useDocumentStore((state) => state.setEditingText);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const zoomLevel = useDocumentStore((state) => state.zoomLevel);

  const page = content.pages[currentPageIndex];
  const { width, height } = PAGE_DIMENSIONS[content.pageSize];

  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<Box | null>(null);
  const [activeGuides, setActiveGuides] = useState<SmartGuide[]>([]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedElementIds.map((id) => nodeRefs.current.get(id)).filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, page?.elements]);

  if (!page) return null;

  // Repères intelligents + snapping (étape 15) — calculés à partir de la
  // position LIVE du nœud Konva (jamais du store) à chaque frame de drag, et
  // committés dans le store seulement à onDragEnd (updateElement, inchangé) :
  // zéro changement à la granularité de l'historique existante. Alt/Option
  // enfoncé désactive repères et snap pour ce déplacement.
  function handleDragMove(element: DocumentElement, event: Konva.KonvaEventObject<DragEvent>) {
    if (event.evt.altKey) {
      if (activeGuides.length > 0) setActiveGuides([]);
      return;
    }
    const node = event.target;
    const movingBox: Box = { x: node.x(), y: node.y(), width: element.width, height: element.height };
    const otherBoxes = page.elements.filter((other) => other.id !== element.id && !selectedElementIds.includes(other.id) && !other.hidden);
    const threshold = SNAP_THRESHOLD_PX / zoomLevel;
    const result = computeGuides(movingBox, { width, height }, otherBoxes, threshold);
    node.position({ x: result.x, y: result.y });
    if (!guidesEqual(result.guides, activeGuides)) setActiveGuides(result.guides);
  }

  function handleTransformEnd(element: DocumentElement) {
    const node = nodeRefs.current.get(element.id);
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    updateElement(element.id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(20, element.width * scaleX),
      height: Math.max(20, element.height * scaleY),
      rotation: node.rotation(),
    });
  }

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      className="bg-white shadow-[0_2px_8px_rgba(15,23,23,0.12),0_16px_40px_rgba(15,23,23,0.08)]"
      onMouseDown={(event) => {
        if (event.target !== event.target.getStage()) return;
        // Sélection par glisser (étape 13) : on efface déjà la sélection ici
        // pour un simple clic sur une zone vide — si le pointeur bouge assez
        // avant le relâchement, onMouseUp la remplace par l'intersection du
        // rectangle glissé, sans jamais repasser par un état intermédiaire visible.
        if (!hasShiftKey(event)) selectElement(null);
        const pointer = event.target.getStage()?.getPointerPosition();
        if (pointer) marqueeStartRef.current = pointer;
      }}
      onMouseMove={(event) => {
        if (!marqueeStartRef.current) return;
        const pointer = event.target.getStage()?.getPointerPosition();
        if (!pointer) return;
        const start = marqueeStartRef.current;
        setMarqueeRect({
          x: Math.min(start.x, pointer.x),
          y: Math.min(start.y, pointer.y),
          width: Math.abs(pointer.x - start.x),
          height: Math.abs(pointer.y - start.y),
        });
      }}
      onMouseUp={() => {
        if (marqueeRect && (marqueeRect.width > 3 || marqueeRect.height > 3)) {
          const ids = page.elements.filter((element) => !element.hidden && rectsIntersect(marqueeRect, element)).map((element) => element.id);
          selectElements(ids);
        }
        marqueeStartRef.current = null;
        setMarqueeRect(null);
      }}
    >
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill={page.background?.value ?? "#ffffff"} listening={false} />

        {page.elements.filter((element) => !element.hidden).map((element) => {
          const common = {
            id: element.id,
            x: element.x,
            y: element.y,
            rotation: element.rotation,
            opacity: element.opacity ?? 1,
            draggable: !readOnly,
            ref: (node: Konva.Node | null) => {
              if (node) nodeRefs.current.set(element.id, node);
              else nodeRefs.current.delete(element.id);
            },
            onClick: (event: Konva.KonvaEventObject<MouseEvent>) => selectElement(element.id, { additive: hasShiftKey(event) }),
            onTap: () => selectElement(element.id),
            onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => handleDragMove(element, event),
            onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
              setActiveGuides([]);
              updateElement(element.id, { x: event.target.x(), y: event.target.y() });
            },
            onTransformEnd: () => handleTransformEnd(element),
          };

          if (element.type === "shape") {
            // Ellipse/RegularPolygon/Star sont centrées par construction chez
            // Konva (dessinées autour de leur propre x/y) — cet offset les
            // ramène au même repère "x/y = coin haut-gauche" que toutes les
            // autres formes, sans rien changer ailleurs (drag/transform/
            // marquee/repères lisent element.x/y normalement). Voir le plan,
            // étape 19 : Diamond/Arrow/Chevron sont construites via des
            // points explicites, déjà naturellement ancrées en haut-gauche.
            const centerOffset = { offsetX: -element.width / 2, offsetY: -element.height / 2 };
            const dash = element.dashed ? [6, 4] : undefined;

            if (element.shape === "circle") {
              const radius = Math.min(element.width, element.height) / 2;
              return <Circle key={element.id} {...common} {...centerOffset} radius={radius} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth ?? 1} />;
            }
            if (element.shape === "ellipse") {
              return <Ellipse key={element.id} {...common} {...centerOffset} radiusX={element.width / 2} radiusY={element.height / 2} fill={element.fill} stroke={element.stroke} strokeWidth={element.strokeWidth ?? 1} />;
            }
            if (element.shape === "triangle" || element.shape === "hexagon") {
              const radius = Math.min(element.width, element.height) / 2;
              return (
                <RegularPolygon
                  key={element.id}
                  {...common}
                  {...centerOffset}
                  sides={element.shape === "triangle" ? 3 : 6}
                  radius={radius}
                  fill={element.fill}
                  stroke={element.stroke}
                  strokeWidth={element.strokeWidth ?? 1}
                />
              );
            }
            if (element.shape === "star") {
              const outerRadius = Math.min(element.width, element.height) / 2;
              return (
                <Star
                  key={element.id}
                  {...common}
                  {...centerOffset}
                  numPoints={5}
                  outerRadius={outerRadius}
                  innerRadius={outerRadius * 0.5}
                  fill={element.fill}
                  stroke={element.stroke}
                  strokeWidth={element.strokeWidth ?? 1}
                />
              );
            }
            if (element.shape === "diamond") {
              const { width, height } = element;
              return (
                <Line
                  key={element.id}
                  {...common}
                  points={[width / 2, 0, width, height / 2, width / 2, height, 0, height / 2]}
                  closed
                  fill={element.fill}
                  stroke={element.stroke}
                  strokeWidth={element.strokeWidth ?? 1}
                />
              );
            }
            if (element.shape === "arrow") {
              return (
                <Arrow
                  key={element.id}
                  {...common}
                  points={[0, element.height / 2, element.width, element.height / 2]}
                  pointerAtBeginning={element.doubleArrow ?? false}
                  pointerAtEnding
                  fill={element.stroke || element.fill}
                  stroke={element.stroke || element.fill}
                  strokeWidth={element.strokeWidth ?? 2}
                  dash={dash}
                />
              );
            }
            if (element.shape === "chevron") {
              const { width, height } = element;
              return (
                <Line
                  key={element.id}
                  {...common}
                  points={[0, 0, width * 0.6, height / 2, 0, height]}
                  stroke={element.stroke || element.fill}
                  strokeWidth={element.strokeWidth ?? 2}
                  dash={dash}
                />
              );
            }
            if (element.shape === "line") {
              return <Line key={element.id} {...common} points={[0, 0, element.width, 0]} stroke={element.stroke || element.fill} strokeWidth={element.strokeWidth ?? 2} dash={dash} />;
            }
            return (
              <Rect
                key={element.id}
                {...common}
                width={element.width}
                height={element.height}
                fill={element.fill}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth ?? 1}
                cornerRadius={element.cornerRadius ?? 4}
              />
            );
          }

          if (element.type === "image") {
            return <ImageElement key={element.id} {...common} width={element.width} height={element.height} src={element.src} />;
          }

          if (element.type === "text") {
            return (
              <Rect
                key={element.id}
                {...common}
                width={element.width}
                height={element.height}
                fill="transparent"
                stroke={selectedElementIds.includes(element.id) ? "#4FAF9F" : "transparent"}
                dash={[4, 4]}
                strokeWidth={1}
                onDblClick={() => { if (!element.variableBinding) setEditingText(element.id); }}
                onDblTap={() => { if (!element.variableBinding) setEditingText(element.id); }}
              />
            );
          }

          return <DiagramElement key={element.id} element={element} common={common} readOnly={readOnly} />;
        })}

        {!readOnly ? <Transformer ref={transformerRef} rotateEnabled boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)} /> : null}

        {marqueeRect ? (
          <Rect {...marqueeRect} fill="rgba(79,175,159,0.1)" stroke="#4FAF9F" dash={[4, 4]} strokeWidth={1} listening={false} />
        ) : null}

        {/* Repères intelligents (étape 15) — derniers enfants de CETTE même
            couche (pas une deuxième <Layer>, qui créerait un second <canvas>
            DOM empilé au-dessus et casserait les clics réels/Playwright sur
            le premier) : au sein d'une couche Konva, l'ordre des enfants fait
            déjà le z-order, donc toujours au-dessus sans nouveau canvas.
            Purement visuel, jamais persisté, jamais capturé par l'export PDF
            (au moment de la capture, plus aucun drag n'est en cours et cette
            liste est donc déjà vide). */}
        {activeGuides.map((guide, index) => (
          <Line
            key={`${guide.orientation}-${index}`}
            points={guide.orientation === "vertical" ? [guide.position, 0, guide.position, height] : [0, guide.position, width, guide.position]}
            stroke="#ff4d6d"
            strokeWidth={1}
            dash={[4, 4]}
            listening={false}
          />
        ))}
      </Layer>
    </Stage>
  );
}

function ImageElement({ src, width, height, ...konvaProps }: { src: string; width: number; height: number } & Record<string, unknown>) {
  const image = useHtmlImage(src);
  return <KonvaImage {...konvaProps} image={image ?? undefined} width={width} height={height} />;
}

type ElementCommonProps = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  draggable: boolean;
  ref: (node: Konva.Node | null) => void;
  onClick: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onTap: () => void;
  onDragMove: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd: () => void;
};

const LEGEND_WIDTH = 150;
const LEGEND_ROW_HEIGHT = 18;

/**
 * Schéma animalier (étape 4) : silhouette (image raster générée depuis un
 * SVG maison, voir dog-diagram.ts) + repères numérotés posés au clic +
 * légende générée automatiquement. Les repères vivent en coordonnées
 * relatives (0..1) à l'image du schéma elle-même (pas à toute la boîte de
 * l'élément) pour rester collés au dessin même si la légende est
 * affichée/masquée ou l'élément redimensionné.
 */
function DiagramElement({ element, common, readOnly }: { element: DocumentDiagramElement; common: ElementCommonProps; readOnly: boolean }) {
  const image = useHtmlImage(dogDiagramDataUri());
  const markerPresets = useDocumentStore((state) => state.markerPresets);
  const placingMarkerPresetId = useDocumentStore((state) => state.placingMarkerPresetId);
  const selectedElementIds = useDocumentStore((state) => state.selectedElementIds);
  const setPlacingMarkerPreset = useDocumentStore((state) => state.setPlacingMarkerPreset);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const groupRef = useRef<Konva.Group>(null);

  const legendWidth = element.showLegend ? Math.min(LEGEND_WIDTH, element.width * 0.45) : 0;
  const pictureWidth = Math.max(20, element.width - legendWidth);
  const pictureHeight = element.height;
  const ratio = DOG_DIAGRAM_VIEWBOX.width / DOG_DIAGRAM_VIEWBOX.height;
  let drawWidth = pictureWidth;
  let drawHeight = drawWidth / ratio;
  if (drawHeight > pictureHeight) {
    drawHeight = pictureHeight;
    drawWidth = drawHeight * ratio;
  }
  const drawOffsetX = (pictureWidth - drawWidth) / 2;
  const drawOffsetY = (pictureHeight - drawHeight) / 2;

  function handleClick() {
    selectElement(element.id);
    if (!placingMarkerPresetId || readOnly) return;
    const pointer = groupRef.current?.getRelativePointerPosition();
    if (!pointer) return;
    const localX = pointer.x - drawOffsetX;
    const localY = pointer.y - drawOffsetY;
    if (localX < 0 || localY < 0 || localX > drawWidth || localY > drawHeight) return;

    const marker = {
      id: `marker-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      x: localX / drawWidth,
      y: localY / drawHeight,
      presetId: placingMarkerPresetId,
      label: markerPresets.find((preset) => preset.id === placingMarkerPresetId)?.label ?? placingMarkerPresetId,
    };
    updateElement(element.id, { markers: [...element.markers, marker] });
    setPlacingMarkerPreset(null);
  }

  const isPlacing = placingMarkerPresetId !== null && selectedElementIds.includes(element.id);

  return (
    <Group
      {...common}
      ref={(node) => {
        common.ref(node);
        groupRef.current = node;
      }}
      onClick={handleClick}
      onTap={handleClick}
    >
      {image ? <KonvaImage image={image} x={drawOffsetX} y={drawOffsetY} width={drawWidth} height={drawHeight} listening={false} /> : null}

      {element.markers.map((marker, index) => {
        const markerX = drawOffsetX + marker.x * drawWidth;
        const markerY = drawOffsetY + marker.y * drawHeight;
        const color = colorForPreset(marker.presetId, markerPresets);
        return (
          <Group key={marker.id} x={markerX} y={markerY} listening={false}>
            <Circle radius={11} fill={color} stroke="#ffffff" strokeWidth={2} />
            <Text text={String(index + 1)} fontSize={11} fontStyle="bold" fill="#ffffff" width={22} height={22} x={-11} y={-8} align="center" />
          </Group>
        );
      })}

      {element.showLegend ? (
        <Group x={pictureWidth + 10} y={4} listening={false}>
          <Text text="Légende" fontSize={11} fontStyle="bold" fill="#183b45" />
          {element.markers.map((marker, index) => (
            <Group key={marker.id} y={LEGEND_ROW_HEIGHT * (index + 1)}>
              <Circle x={6} y={6} radius={5} fill={colorForPreset(marker.presetId, markerPresets)} />
              <Text x={18} y={0} text={`${index + 1}. ${marker.label}`} fontSize={10.5} fill="#183b45" width={legendWidth - 18} wrap="word" />
            </Group>
          ))}
        </Group>
      ) : null}

      <Rect x={0} y={0} width={element.width} height={element.height} fill="#000000" opacity={0} listening={!readOnly} />

      {isPlacing ? (
        <Rect x={0} y={0} width={element.width} height={element.height} stroke="#4FAF9F" dash={[6, 4]} strokeWidth={2} listening={false} />
      ) : null}
    </Group>
  );
}
