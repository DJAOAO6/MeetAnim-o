"use client";

import { useEffect, useRef } from "react";
import { Stage, Layer, Rect, Line, Circle, Image as KonvaImage, Transformer } from "react-konva";
import type Konva from "konva";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { PAGE_DIMENSIONS } from "@/components/documents/editor/page-geometry";
import { useHtmlImage } from "@/components/documents/editor/use-html-image";
import type { DocumentElement } from "@/lib/documents/content";

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

          // "diagram" : arrive à l'étape 4, simple emplacement réservé pour l'instant.
          return (
            <Rect
              key={element.id}
              {...common}
              width={element.width}
              height={element.height}
              fill="#f7faf9"
              stroke="#d9e5e2"
              dash={[4, 4]}
              strokeWidth={1}
            />
          );
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
