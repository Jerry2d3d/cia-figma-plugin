import { LAYOUT_GAP, LAYOUT_ROW_WIDTH, layoutInGrid, originBelow, Placeable } from '@/plugin/layoutNodes';

function node(width: number, height: number): Placeable {
  return { x: -1, y: -1, width, height };
}

describe('layoutInGrid', () => {
  it('walks nodes across a row, gap between each', () => {
    const nodes = [node(100, 40), node(200, 40), node(150, 40)];

    layoutInGrid(nodes);

    expect(nodes.map((n) => [n.x, n.y])).toEqual([
      [0, 0],
      [100 + LAYOUT_GAP, 0],
      [100 + LAYOUT_GAP + 200 + LAYOUT_GAP, 0],
    ]);
  });

  it('wraps to a new row, clearing the tallest node in the row above', () => {
    // Two of these plus the gap fit a row; a third does not.
    const wide = Math.floor((LAYOUT_ROW_WIDTH - LAYOUT_GAP) / 2);
    const nodes = [node(wide, 500), node(wide, 40), node(wide, 40)];

    layoutInGrid(nodes);

    expect(nodes[0].y).toBe(0);
    expect(nodes[1].y).toBe(0);
    // The 500-tall node sets the row height, so row two clears it.
    expect(nodes[2].x).toBe(0);
    expect(nodes[2].y).toBe(500 + LAYOUT_GAP);
  });

  it('never leaves a node alone on a row it could have shared', () => {
    const nodes = [node(LAYOUT_ROW_WIDTH * 2, 40), node(100, 40)];

    layoutInGrid(nodes);

    // The oversized node starts the row rather than being pushed past it, and
    // the next one wraps below rather than sitting beyond the page edge.
    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 0, y: 40 + LAYOUT_GAP });
  });

  it('starts from a given origin', () => {
    const nodes = [node(100, 40)];

    layoutInGrid(nodes, { x: 500, y: 900 });

    expect(nodes[0]).toMatchObject({ x: 500, y: 900 });
  });
});

describe('originBelow', () => {
  it('starts at the top left when the page is empty', () => {
    expect(originBelow([])).toEqual({ x: 0, y: 0 });
  });

  it('clears everything already on the page, aligned to its left edge', () => {
    const existing = [
      { x: 40, y: 0, width: 100, height: 200 },
      { x: 300, y: 100, width: 100, height: 50 },
    ];

    expect(originBelow(existing)).toEqual({ x: 40, y: 200 + LAYOUT_GAP * 2 });
  });
});
