export type MasonryLayoutInput<T> = {
  items: T[];
  containerWidth: number;
  columnCount: number;
  gap: number;
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
    gap,
    estimateHeightRatio,
  } = input;

  const count = Math.max(1, Math.floor(Number(columnCount) || 1));
  const safeWidth = Math.max(0, Number(containerWidth) || 0);
  const usableWidth = Math.max(0, safeWidth - Math.max(0, count - 1) * gap);
  const columnWidth = count > 0 ? usableWidth / count : safeWidth;
  const columnHeights = Array.from({ length: count }, () => 0);
  const laidOut: MasonryLayoutItem<T>[] = [];

  items.forEach((item, index) => {
    let shortest = 0;
    for (let i = 1; i < count; i += 1) {
      if (columnHeights[i] < columnHeights[shortest]) shortest = i;
    }

    const ratio = Math.max(0.3, Number(estimateHeightRatio(item, index)) || 1);
    const height = Math.max(32, columnWidth * ratio);
    const x = shortest * (columnWidth + gap);
    const y = columnHeights[shortest];

    laidOut.push({ item, index, x, y, width: columnWidth, height });
    columnHeights[shortest] = y + height + gap;
  });

  const stageHeight = Math.max(0, ...columnHeights.map((value) => Math.max(0, value - gap)));
  return { items: laidOut, stageHeight, columnWidth };
}
