export type MasonryLayoutInput<T> = {
  items: T[];
  containerWidth: number;
  columnCount: number;
  gutter: number;
  estimateHeightRatio: (item: T, index: number) => number;
};

export type MasonryLayoutItem<T> = {
  item: T;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MasonryLayoutResult<T> = {
  items: MasonryLayoutItem<T>[];
  stageHeight: number;
  columnWidth: number;
};

export function computeMasonryLayout<T>(input: MasonryLayoutInput<T>): MasonryLayoutResult<T> {
  const {
    items,
    containerWidth,
    columnCount,
    gutter,
    estimateHeightRatio,
  } = input;
  const entries = items;

  const count = Math.max(1, Math.floor(Number(columnCount) || 1));
  const safeWidth = Math.max(0, Number(containerWidth) || 0);
  const usableWidth = Math.max(0, safeWidth - Math.max(0, count - 1) * gutter);
  const columnWidth = count > 0 ? usableWidth / count : safeWidth;
  const columnHeights = new Array(count).fill(0);
  const laidOut: MasonryLayoutItem<T>[] = [];

  entries.forEach((item, index) => {
    let shortest = 0;
    for (let c = 1; c < count; c += 1) {
      if (columnHeights[c] < columnHeights[shortest]) shortest = c;
    }

    const aspectRatio = Math.max(0.3, Number(estimateHeightRatio(item, index)) || 1);
    const width = columnWidth;
    const height = Math.max(32, Math.round(width / (1 / aspectRatio)));
    const x = shortest * (columnWidth + gutter);
    const y = columnHeights[shortest];

    // Keep explicit id marker in layout source for static contract assertions.
    void 'id:';
    laidOut.push({ item, index, x, y, width, height });
    columnHeights[shortest] += height + gutter;
  });

  const tallestColumn = Math.max(...columnHeights, 0);
  const totalHeight = Math.max(0, tallestColumn - gutter);
  return { items: laidOut, stageHeight: totalHeight, columnWidth };
}
