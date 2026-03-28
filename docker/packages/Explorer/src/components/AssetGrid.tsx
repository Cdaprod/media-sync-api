import React, { memo, useMemo, useRef, useState, useLayoutEffect, useCallback } from 'react';

import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';
import type { AssetPointerHandlers } from '../useAssetInteractions';
import type { MediaItem } from '../types';
import { computeMasonryLayout } from '../explorer/masonry/computeMasonryLayout';

export interface ExplorerAssetViewModel {
  item: MediaItem;
  kind: string;
  orient: string;
  orientLocked: boolean;
  renderKey: string;
  selectionKey: string;
  isActive: boolean;
  isSecondTapReinforced: boolean;
  isHoldEmphasis: boolean;
  isSelected: boolean;
  size: string;
  sub: string;
  thumbJobKey: string;
  thumbKey: string;
  thumbUrl?: string;
  title: string;
  fallbackThumb: string;
  safeThumbUrl: string;
  activeVideoPreviewUrl?: string;
  previewPlaybackKey: string;
  pointerHandlers: AssetPointerHandlers;
  kindBadgeClassName: string;
  selectionOrderLabel: string;
}

type GridEntry =
  | { kind: 'asset'; item: MediaItem }
  | { kind: 'pending'; pendingItem: PendingComposeAsset };

interface AssetGridProps {
  buildAssetViewModel: (item: MediaItem) => ExplorerAssetViewModel;
  canSelect: boolean;
  gridColumnCount: number;
  gridRef?: React.Ref<HTMLDivElement>;
  entries: GridEntry[];
  onToggleSelected: (item: MediaItem) => void;
  onDismissPendingJob: (jobId: string) => void;
}

function heightRatioForEntry(entry: GridEntry, viewModel?: ExplorerAssetViewModel): number {
  if (entry.kind === 'pending') return 1;
  const width = Number(entry.item.width) || 0;
  const height = Number(entry.item.height) || 0;
  if (width > 0 && height > 0) {
    return Math.max(0.3, height / width);
  }
  const orient = viewModel?.orient || 'square';
  if (orient === 'portrait') return 1.34;
  if (orient === 'landscape') return 0.84;
  return 1;
}

function AssetGridComponent({
  buildAssetViewModel,
  canSelect,
  gridColumnCount,
  gridRef,
  entries,
  onToggleSelected,
  onDismissPendingJob,
}: AssetGridProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const layoutCommitCountRef = useRef(0);
  const [densityMotionActive, setDensityMotionActive] = useState(false);
  const [renderWindow, setRenderWindow] = useState({ top: 0, bottom: 0 });
  const [hostWidth, setHostWidth] = useState(0);
  const BASE_RENDER_BUFFER_PX = 420;
  const MOTION_RENDER_BUFFER_PX = 180;
  const measureHostWidth = useCallback(() => {
    const node = hostRef.current;
    if (!node) return;
    const measuredWidth = node.offsetWidth;
    setHostWidth((prev) => (Math.abs(prev - measuredWidth) < 0.5 ? prev : measuredWidth));
  }, []);

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    measureHostWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureHostWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureHostWidth]);

  useLayoutEffect(() => {
    measureHostWidth();
    const rafId = window.requestAnimationFrame(() => measureHostWidth());
    return () => window.cancelAnimationFrame(rafId);
  }, [entries.length, gridColumnCount, measureHostWidth]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const contentEl = host.closest<HTMLElement>('.content');
    if (!contentEl) {
      setDensityMotionActive(false);
      return;
    }
    const syncDensityMotionState = () => {
      const isActive = contentEl.classList.contains('density-motion-active');
      setDensityMotionActive((prev) => (prev === isActive ? prev : isActive));
    };
    syncDensityMotionState();
    const observer = new MutationObserver(syncDensityMotionState);
    observer.observe(contentEl, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const measureRenderWindow = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const scrollHost = host.closest<HTMLElement>('.scroll');
    if (!scrollHost) {
      setRenderWindow((prev) => (
        prev.top === 0 && prev.bottom === Number.MAX_SAFE_INTEGER
          ? prev
          : { top: 0, bottom: Number.MAX_SAFE_INTEGER }
      ));
      return;
    }
    const nextTop = scrollHost.scrollTop;
    const nextBottom = nextTop + scrollHost.clientHeight;
    setRenderWindow((prev) => (
      Math.abs(prev.top - nextTop) < 0.5 && Math.abs(prev.bottom - nextBottom) < 0.5
        ? prev
        : { top: nextTop, bottom: nextBottom }
    ));
  }, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scrollHost = host.closest<HTMLElement>('.scroll');
    measureRenderWindow();
    if (!scrollHost) return;
    const onScroll = () => measureRenderWindow();
    scrollHost.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      scrollHost.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [measureRenderWindow]);

  const gridItems = useMemo(() => entries.map((entry) => {
    if (entry.kind === 'pending') {
      return { entry } as const;
    }
    const viewModel = buildAssetViewModel(entry.item);
    return { entry, viewModel } as const;
  }), [buildAssetViewModel, entries]);

  const layout = useMemo(
    () => computeMasonryLayout({
      items: gridItems,
      containerWidth: hostWidth,
      columnCount: gridColumnCount,
      gutter: 6,
      estimateHeightRatio: ({ entry, viewModel }) => heightRatioForEntry(entry, viewModel),
    }),
    [gridColumnCount, gridItems, hostWidth],
  );

  const renderBufferPx = densityMotionActive ? MOTION_RENDER_BUFFER_PX : BASE_RENDER_BUFFER_PX;
  const renderedLayoutItems = useMemo(() => {
    if (!layout.items.length) return layout.items;
    const windowTop = renderWindow.top - renderBufferPx;
    const windowBottom = renderWindow.bottom + renderBufferPx;
    const bounded = layout.items.filter(({ y, height }) => {
      const top = y;
      const bottom = y + height;
      return bottom >= windowTop && top <= windowBottom;
    });
    return bounded.length ? bounded : layout.items;
  }, [layout.items, renderBufferPx, renderWindow.bottom, renderWindow.top]);

  useLayoutEffect(() => {
    layoutCommitCountRef.current += 1;
    (globalThis as typeof globalThis & {
      __explorerDensityLayoutDebug?: {
        getSnapshot: () => {
          gridColumnCount: number;
          renderedCardCount: number;
          layoutRecomputeCount: number;
          layoutStageHeight: number;
          totalLogicalCount: number;
          renderedItemCount: number;
          visibleRenderedItemCount: number;
          boundedRenderingActive: boolean;
          renderWindowTop: number;
          renderWindowBottom: number;
          renderBufferPx: number;
          renderBufferMode: 'idle' | 'density-motion';
          layoutComputedItemCount: number;
          layoutComputationScope: 'global';
          flipActive: boolean;
          sampleCards: Array<{
            cardId: string;
            left: string;
            width: string;
            top: string;
          }>;
        };
      };
      __explorerDensityFlipDebug?: { getStats: () => Array<Record<string, number>> };
    }).__explorerDensityLayoutDebug = {
      getSnapshot: () => {
        const stage = hostRef.current?.querySelector<HTMLElement>('.masonry-columns');
        const cards = Array.from(stage?.querySelectorAll<HTMLElement>('.masonry-card') ?? []);
        const stats = (globalThis as typeof globalThis & {
          __explorerDensityFlipDebug?: { getStats: () => Array<Record<string, number>> };
        }).__explorerDensityFlipDebug?.getStats?.() ?? [];
        const totals = stats.reduce((acc, row) => ({
          starts: acc.starts + Number(row.starts ?? 0),
          settles: acc.settles + Number(row.completes ?? 0) + Number(row.interrupts ?? 0),
        }), { starts: 0, settles: 0 });
        return {
          gridColumnCount,
          renderedCardCount: cards.length,
          layoutRecomputeCount: layoutCommitCountRef.current,
          layoutStageHeight: Math.max(layout.stageHeight, 0),
          totalLogicalCount: layout.items.length,
          renderedItemCount: renderedLayoutItems.length,
          visibleRenderedItemCount: renderedLayoutItems.filter(({ y, height }) => {
            const top = y;
            const bottom = y + height;
            return bottom >= renderWindow.top && top <= renderWindow.bottom;
          }).length,
          boundedRenderingActive: renderedLayoutItems.length < layout.items.length,
          renderWindowTop: renderWindow.top,
          renderWindowBottom: renderWindow.bottom,
          renderBufferPx,
          renderBufferMode: densityMotionActive ? 'density-motion' : 'idle',
          layoutComputedItemCount: layout.items.length,
          layoutComputationScope: 'global',
          flipActive: totals.starts > totals.settles,
          sampleCards: cards.slice(0, 6).map((card) => ({
            cardId: card.dataset.cardId ?? '',
            left: card.style.left,
            width: card.style.width,
            top: card.style.top,
          })),
        };
      },
    };
  }, [densityMotionActive, gridColumnCount, layout.items, layout.stageHeight, renderBufferPx, renderWindow.top, renderWindow.bottom, renderedLayoutItems]);

  const handleTogglePointerDown = (
    event: React.PointerEvent<HTMLDivElement | HTMLInputElement>,
  ) => {
    event.stopPropagation();
  };

  return (
    <div className="masonry-host" ref={hostRef}>
      <div
        className="masonry-columns"
        ref={gridRef}
        data-density-columns={gridColumnCount}
        style={{
          '--masonry-column-count': String(gridColumnCount),
          width: '100%',
          height: `${Math.max(layout.stageHeight, 0)}px`,
        } as React.CSSProperties}
      >
        {renderedLayoutItems.map(({ item, x, y, width, height }, index) => {
          const { entry } = item;
          const layoutTop = Math.max(0, Math.round(y));
          const layoutBottom = Math.max(layoutTop, Math.round(y + height));
          const positionedStyle: React.CSSProperties = {
            position: 'absolute',
            left: x,
            top: y,
            width,
            minHeight: `${height}px`,
            height,
          };

          if (entry.kind === 'pending') {
            return (
              <div
                key={`pending-${entry.pendingItem.jobId}`}
                className="masonry-card"
                style={positionedStyle}
                data-pending-job={entry.pendingItem.jobId}
                data-layout-top={layoutTop}
                data-layout-bottom={layoutBottom}
              >
                <PendingComposeAssetCard
                  item={entry.pendingItem}
                  onDismiss={entry.pendingItem.status === 'failed' ? () => onDismissPendingJob(entry.pendingItem.jobId) : undefined}
                />
              </div>
            );
          }

          const viewModel = item.viewModel;
          if (!viewModel) return null;
          return (
            <div
              key={viewModel.renderKey}
              className={`masonry-card asset asset-interactive-surface ${viewModel.isActive ? 'is-active' : ''} ${viewModel.isSecondTapReinforced ? 'is-active-reinforced' : ''} ${viewModel.isHoldEmphasis ? 'is-hold-emphasis' : ''} ${viewModel.isSelected ? 'is-selected' : ''}`}
              style={positionedStyle}
              data-kind={viewModel.kind}
              data-orient={viewModel.orient}
              data-orient-locked={viewModel.orientLocked ? 'true' : 'false'}
              data-thumb-key={viewModel.thumbKey}
              data-thumb-job-key={viewModel.thumbJobKey}
              data-relative={viewModel.item.relative_path || ''}
              data-select-key={viewModel.selectionKey}
              data-active={viewModel.isActive ? 'true' : 'false'}
              data-layout-index={index}
              data-layout-top={layoutTop}
              data-layout-bottom={layoutBottom}
              data-card-id={viewModel.selectionKey}
              {...viewModel.pointerHandlers}
            >
              <div className="thumb">
                <img
                  className="asset-thumb"
                  src={viewModel.safeThumbUrl}
                  alt={viewModel.title}
                  loading="lazy"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  data-thumb-url={viewModel.thumbUrl}
                  data-thumb-fallback={viewModel.fallbackThumb}
                  data-thumb-job-key={viewModel.thumbJobKey}
                />
                {viewModel.activeVideoPreviewUrl ? (
                  <video
                    key={viewModel.previewPlaybackKey}
                    className="asset-thumb-preview"
                    src={viewModel.activeVideoPreviewUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                    preload="metadata"
                    disablePictureInPicture
                    controls={false}
                    aria-hidden="true"
                  />
                ) : null}
                <div className="asset-overlay">
                  <div className="asset-ol-tl">
                    <span className={`badge ${viewModel.kindBadgeClassName} tile-ui-text`}>{viewModel.kind}</span>
                  </div>
                  <div className="asset-ol-tr">
                    <div
                      className="selector sel-ui"
                      title="Select"
                      data-interactive="true"
                      data-no-preview="1"
                      onPointerDown={handleTogglePointerDown}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!canSelect) return;
                        const target = event.target as HTMLElement;
                        if (!target.closest('.sel-shell, .sel-order, input[type="checkbox"]')) return;
                        onToggleSelected(entry.item);
                      }}
                    >
                      <span className="sel-shell" data-no-preview="1">
                        <input
                          type="checkbox"
                          checked={viewModel.isSelected}
                          aria-label="Select media"
                          disabled={!canSelect}
                          data-interactive="true"
                          data-no-preview="1"
                          onPointerDown={handleTogglePointerDown}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          onChange={() => onToggleSelected(entry.item)}
                        />
                        <span className="sel-order" data-no-preview="1" aria-hidden="true">
                          {viewModel.selectionOrderLabel}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="asset-ol-bl">
                    <span className="badge tile-ui-text">{viewModel.size}</span>
                  </div>
                  <div className="asset-ol-bottom">
                    <div className="asset-title tile-ui-text">{viewModel.title}</div>
                    <div className="asset-subtitle tile-ui-text">{viewModel.sub}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const AssetGrid = memo(AssetGridComponent);
