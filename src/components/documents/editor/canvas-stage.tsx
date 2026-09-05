"use client";

import { useEffect, useRef } from "react";
import { Stage, Layer, Rect, Line, Circle, Text, Group, Image as KonvaImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { PAGE_DIMENSIONS } from "@/components/documents/editor/page-geometry";
import { useHtmlImage } from "@/components/documents/editor/use-html-image";
import { DOG_DIAGRAM_VIEWBOX, dogDiagramDataUri } from "@/lib/documents/dog-diagram";
import { colorForPreset } from "@/lib/documents/marker-presets";
import type { DocumentDiagramElement, DocumentElement } from "@/lib/documents/content";

type CanvasStageProps = {
  readOnly: boolean;
};

/**
 * Rendu Konva des éléments forme/image + un rectangle "fantôme" (bordure
 * pointillée, jamais rempli) pour chaque bloc de texte — le texte lui-même
 * est rendu par la surcouche DOM (text-overlay.tsx), jamais par Konva.Text,
 * pour une édition réellement agréable (voir le plan). Les schémas
 * (diagram) arrivent à l'étape 4 : simple rectangle d'attente ici.
 */
export function CanvasStage({ readOnly }: CanvasStageProps) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementId = useDocumentStore((state) => state.selectedElementId);
  const selectElement = useDocumentStore((state) => state.selectElement);
  const setEditingText = useDocumentStore((state) => state.setEditingText);
  const updateElement = useDocumentStore((state) => state.updateElement);

  const page = content.pages[currentPageIndex];
  const { width, height } = PAGE_DIMENSIONS[content.pageSize];

  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef(new Map<string, Konva.Node>());

  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = selectedElementId ? nodeRefs.current.get(selectedElementId) : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, page?.elements]);

  if (!page) return null;

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
      width={width}
      height={height}
      className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(24,59,69,0.08)]"
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) selectElement(null);
      }}
    >
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill="#ffffff" listening={false} />

        {page.elements.map((element) => {
          const common = {
            id: element.id,
            x: element.x,
            y: element.y,
            rotation: element.rotation,
            draggable: !readOnly,
            ref: (node: Konva.Node | null) => {
              if (node) nodeRefs.current.set(element.id, node);
              else nodeRefs.current.delete(element.id);
            },
            onClick: () => selectElement(element.id),
            onTap: () => selectElement(element.id),
            onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => updateElement(element.id, { x: event.target.x(), y: event.target.y() }),
            onTransformEnd: () => handleTransformEnd(element),
          };

          if (element.type === "shape") {
            if (element.shape === "circle") {
              const radius = Math.min(element.width, element.height) / 2;
              return <Circle key={element.id} {...common} radius={radius} fill={element.fill} stroke={element.stroke} strokeWidth={1} />;
            }
            if (element.shape === "line") {
              return <Line key={element.id} {...common} points={[0, 0, element.width, 0]} stroke={element.stroke || element.fill} strokeWidth={2} />;
            }
            return <Rect key={element.id} {...common} width={element.width} height={element.height} fill={element.fill} stroke={element.stroke} strokeWidth={1} cornerRadius={4} />;
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
                stroke={selectedElementId === element.id ? "#4FAF9F" : "transparent"}
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
  draggable: boolean;
  ref: (node: Konva.Node | null) => void;
  onClick: () => void;
  onTap: () => void;
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
  const selectedElementId = useDocumentStore((state) => state.selectedElementId);
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

  const isPlacing = placingMarkerPresetId !== null && selectedElementId === element.id;

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
