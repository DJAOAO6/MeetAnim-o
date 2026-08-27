export type LayoutInput = { id: string; start: string; duration: number };

export type EventLayout = { column: number; columns: number };

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Répartit des événements qui se chevauchent dans le temps en colonnes côte
 * à côte (comme Google Calendar/Outlook), au lieu de les empiler. Algorithme
 * de balayage glouton : classique et suffisant pour un agenda mono-praticien.
 */
export function computeEventColumns(events: LayoutInput[]): Map<string, EventLayout> {
  const layout = new Map<string, EventLayout>();
  const items = events
    .map((event) => ({ id: event.id, startMin: toMinutes(event.start), endMin: toMinutes(event.start) + Math.max(event.duration, 15) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  let clusterIds: string[] = [];
  let clusterEnd = -Infinity;
  let columnEnds: number[] = [];
  const columnOf = new Map<string, number>();

  function flushCluster() {
    const columns = columnEnds.length;
    for (const id of clusterIds) layout.set(id, { column: columnOf.get(id) ?? 0, columns });
    clusterIds = [];
    columnEnds = [];
  }

  for (const item of items) {
    if (item.startMin >= clusterEnd) flushCluster();

    let placedColumn = columnEnds.findIndex((end) => end <= item.startMin);
    if (placedColumn === -1) {
      placedColumn = columnEnds.length;
      columnEnds.push(item.endMin);
    } else {
      columnEnds[placedColumn] = item.endMin;
    }

    columnOf.set(item.id, placedColumn);
    clusterIds.push(item.id);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flushCluster();

  return layout;
}
