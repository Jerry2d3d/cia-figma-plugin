/**
 * Lays built components out in a readable grid on the canvas.
 *
 * Figma drops every new node at the same spot, so building a whole library in
 * one go stacks 99 component sets on top of each other. This walks them across
 * rows instead, in the order they were built.
 */

export interface Placeable {
  x: number;
  y: number;
  readonly width: number;
  readonly height: number;
}

/** Gap between placed nodes, and the width a row fills before wrapping. */
export const LAYOUT_GAP = 80;
export const LAYOUT_ROW_WIDTH = 2400;

export interface Origin {
  x: number;
  y: number;
}

/**
 * Places each node left to right, wrapping to a new row once the current one is
 * full. Row height comes from the tallest node in that row, so a short row
 * never leaves a band of dead space and a tall one never overlaps the next.
 */
export function layoutInGrid(nodes: Placeable[], origin: Origin = { x: 0, y: 0 }): void {
  let cursorX = origin.x;
  let cursorY = origin.y;
  let rowHeight = 0;

  nodes.forEach((node) => {
    const isRowStart = cursorX === origin.x;
    if (!isRowStart && cursorX + node.width > origin.x + LAYOUT_ROW_WIDTH) {
      cursorX = origin.x;
      cursorY += rowHeight + LAYOUT_GAP;
      rowHeight = 0;
    }

    node.x = cursorX;
    node.y = cursorY;

    cursorX += node.width + LAYOUT_GAP;
    rowHeight = Math.max(rowHeight, node.height);
  });
}

/**
 * Where a new batch should start so it does not land on top of existing work:
 * below everything already on the page.
 */
export function originBelow(existing: readonly Placeable[]): Origin {
  if (existing.length === 0) {
    return { x: 0, y: 0 };
  }
  const bottom = existing.reduce((lowest, node) => Math.max(lowest, node.y + node.height), -Infinity);
  const left = existing.reduce((leftmost, node) => Math.min(leftmost, node.x), Infinity);
  return { x: left, y: bottom + LAYOUT_GAP * 2 };
}
