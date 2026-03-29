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
  const renderWindowUpdateCountRef = useRef(0);
  const motionObserverCallbackCountRef = useRef(0);
  const motionBufferEverUsedRef = useRef(false);
  const lastBufferModeUsedRef = useRef<'idle' | 'density-motion'>('idle');
  const lastLayoutScopeUsedRef = useRef<'global' | 'windowed'>('global');
  const lastMotionActiveAtMsRef = useRef<number | null>(null);
  const lastDensityTransitionUsedSimplifiedRef = useRef(false);
  const scrollRevealBatchTimerRef = useRef<number | null>(null);
  const revealFailSafeTimersRef = useRef<Map<string, number>>(new Map());
  const prevGridColumnsRef = useRef<number | null>(null);
  const simplifyTimeoutRef = useRef<number | null>(null);
  const ENABLE_MOTION_AWARE_BUFFER = false;
  const ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION = true;
  const [densityMotionActive, setDensityMotionActive] = useState(false);
  const [simplifiedCardSubtreeActive, setSimplifiedCardSubtreeActive] = useState(false);
  const [pageLoadEntranceActive, setPageLoadEntranceActive] = useState(true);
  const [revealedCards, setRevealedCards] = useState<Set<string>>(() => new Set());
  const [renderWindow, setRenderWindow] = useState({ top: 0, bottom: 0 });
  const [hostWidth, setHostWidth] = useState(0);
  const BASE_RENDER_BUFFER_PX = 1200;
  const MOTION_RENDER_BUFFER_PX = 640;
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
    if (!ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION) {
      setSimplifiedCardSubtreeActive(false);
      return;
    }
    const previous = prevGridColumnsRef.current;
    prevGridColumnsRef.current = gridColumnCount;
    if (previous == null || previous === gridColumnCount) return;
    lastDensityTransitionUsedSimplifiedRef.current = true;
    setSimplifiedCardSubtreeActive(true);
    if (simplifyTimeoutRef.current != null) {
      window.clearTimeout(simplifyTimeoutRef.current);
    }
    simplifyTimeoutRef.current = window.setTimeout(() => {
      setSimplifiedCardSubtreeActive(false);
      simplifyTimeoutRef.current = null;
    }, 420);
    return () => {
      if (simplifyTimeoutRef.current != null) {
        window.clearTimeout(simplifyTimeoutRef.current);
        simplifyTimeoutRef.current = null;
      }
    };
  }, [ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION, gridColumnCount]);

  useLayoutEffect(() => {
    if (!ENABLE_MOTION_AWARE_BUFFER) {
      setDensityMotionActive(false);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const contentEl = host.closest<HTMLElement>('.content');
    if (!contentEl) {
      setDensityMotionActive(false);
      return;
    }
    const syncDensityMotionState = () => {
      motionObserverCallbackCountRef.current += 1;
      const isActive = contentEl.classList.contains('density-motion-active');
      setDensityMotionActive((prev) => (prev === isActive ? prev : isActive));
    };
    syncDensityMotionState();
    const observer = new MutationObserver(syncDensityMotionState);
    observer.observe(contentEl, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [ENABLE_MOTION_AWARE_BUFFER]);

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
        : (() => {
          renderWindowUpdateCountRef.current += 1;
          return { top: nextTop, bottom: nextBottom };
        })()
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

  const renderBufferPx = ENABLE_MOTION_AWARE_BUFFER && densityMotionActive
    ? MOTION_RENDER_BUFFER_PX
    : BASE_RENDER_BUFFER_PX;
  const renderWindowTop = renderWindow.top - renderBufferPx;
  const renderWindowBottom = renderWindow.bottom + renderBufferPx;

  const layout = useMemo(
    () => computeMasonryLayout({
      items: gridItems,
      containerWidth: hostWidth,
      columnCount: gridColumnCount,
      gutter: 6,
      estimateHeightRatio: ({ entry, viewModel }) => heightRatioForEntry(entry, viewModel),
      shouldIncludeItem: ({ y, height }) => {
        const top = y;
        const bottom = y + height;
        return bottom >= renderWindowTop && top <= renderWindowBottom;
      },
    }),
    [gridColumnCount, gridItems, hostWidth, renderWindowBottom, renderWindowTop],
  );

  const renderedLayoutItems = layout.items;
  const layoutComputationScope = layout.includedItemCount < layout.totalItemCount ? 'windowed' : 'global';

  useLayoutEffect(() => {
    if (!pageLoadEntranceActive) return;
    if (!renderedLayoutItems.length) return;
    const maxIndex = Math.max(0, renderedLayoutItems.length - 1);
    const totalDelayMs = 80 + (Math.min(maxIndex, 18) * 28) + 320;
    const timer = window.setTimeout(() => {
      setPageLoadEntranceActive(false);
    }, totalDelayMs);
    return () => window.clearTimeout(timer);
  }, [pageLoadEntranceActive, renderedLayoutItems.length]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scrollHost = host.closest<HTMLElement>('.scroll');
    const pending = new Set<string>();
    const flushPending = () => {
      if (!pending.size) return;
      setRevealedCards((prev) => {
        const next = new Set(prev);
        pending.forEach((key) => next.add(key));
        return next;
      });
      pending.clear();
    };
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const card = entry.target as HTMLElement;
        const key = card.dataset.cardId;
        if (!key) continue;
        pending.add(key);
        const pendingFailSafe = revealFailSafeTimersRef.current.get(key);
        if (pendingFailSafe != null) {
          window.clearTimeout(pendingFailSafe);
          revealFailSafeTimersRef.current.delete(key);
        }
        observer.unobserve(card);
      }
      if (scrollRevealBatchTimerRef.current != null) {
        window.clearTimeout(scrollRevealBatchTimerRef.current);
      }
      scrollRevealBatchTimerRef.current = window.setTimeout(() => {
        scrollRevealBatchTimerRef.current = null;
        flushPending();
      }, 16);
    }, {
      root: scrollHost,
      threshold: 0,
      rootMargin: '240px 0px 360px 0px',
    });
    const cards = Array.from(host.querySelectorAll<HTMLElement>('.masonry-card[data-card-id]'));
    const viewportTop = scrollHost?.scrollTop ?? 0;
    const viewportBottom = viewportTop + (scrollHost?.clientHeight ?? 0);
    cards.forEach((card) => {
      const key = card.dataset.cardId;
      if (!key || revealedCards.has(key)) return;
      const top = Number(card.dataset.layoutTop ?? 0);
      const bottom = Number(card.dataset.layoutBottom ?? top);
      const inPrewarmViewport = bottom >= (viewportTop - 80) && top <= (viewportBottom + 160);
      if (inPrewarmViewport) {
        pending.add(key);
      } else if (!revealFailSafeTimersRef.current.has(key)) {
        const failSafeTimer = window.setTimeout(() => {
          revealFailSafeTimersRef.current.delete(key);
          setRevealedCards((prev) => {
            if (prev.has(key)) return prev;
            const next = new Set(prev);
            next.add(key);
            return next;
          });
        }, 220);
        revealFailSafeTimersRef.current.set(key, failSafeTimer);
      }
      observer.observe(card);
    });
    flushPending();
    return () => {
      observer.disconnect();
      if (scrollRevealBatchTimerRef.current != null) {
        window.clearTimeout(scrollRevealBatchTimerRef.current);
        scrollRevealBatchTimerRef.current = null;
      }
    };
  }, [renderedLayoutItems, revealedCards]);

  useLayoutEffect(() => () => {
    revealFailSafeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    revealFailSafeTimersRef.current.clear();
  }, []);

  useLayoutEffect(() => {
    const mode = densityMotionActive ? 'density-motion' : 'idle';
    lastBufferModeUsedRef.current = mode;
    lastLayoutScopeUsedRef.current = layoutComputationScope;
    if (!densityMotionActive) return;
    motionBufferEverUsedRef.current = true;
    lastMotionActiveAtMsRef.current = Date.now();
  }, [densityMotionActive, layoutComputationScope]);

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
          layoutComputationScope: 'global' | 'windowed';
          motionBufferEverUsed: boolean;
          lastBufferModeUsed: 'idle' | 'density-motion';
          lastLayoutScopeUsed: 'global' | 'windowed';
          lastMotionActiveAtMs: number | null;
          isolationMotionAwareBufferEnabled: boolean;
          motionObserverCallbackCount: number;
          renderWindowUpdateCount: number;
          simplifiedCardIsolationEnabled: boolean;
          simplifiedCardSubtreeActive: boolean;
          lastDensityTransitionUsedSimplified: boolean;
          cardSubtreeMode: 'full' | 'simplified';
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
          totalLogicalCount: layout.totalItemCount,
          renderedItemCount: renderedLayoutItems.length,
          visibleRenderedItemCount: renderedLayoutItems.filter(({ y, height }) => {
            const top = y;
            const bottom = y + height;
            return bottom >= renderWindow.top && top <= renderWindow.bottom;
          }).length,
          boundedRenderingActive: layout.includedItemCount < layout.totalItemCount,
          renderWindowTop: renderWindow.top,
          renderWindowBottom: renderWindow.bottom,
          renderBufferPx,
          renderBufferMode: densityMotionActive ? 'density-motion' : 'idle',
          layoutComputedItemCount: layout.includedItemCount,
          layoutComputationScope,
          motionBufferEverUsed: motionBufferEverUsedRef.current,
          lastBufferModeUsed: lastBufferModeUsedRef.current,
          lastLayoutScopeUsed: lastLayoutScopeUsedRef.current,
          lastMotionActiveAtMs: lastMotionActiveAtMsRef.current,
          isolationMotionAwareBufferEnabled: ENABLE_MOTION_AWARE_BUFFER,
          motionObserverCallbackCount: motionObserverCallbackCountRef.current,
          renderWindowUpdateCount: renderWindowUpdateCountRef.current,
          simplifiedCardIsolationEnabled: ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION,
          simplifiedCardSubtreeActive,
          lastDensityTransitionUsedSimplified: lastDensityTransitionUsedSimplifiedRef.current,
          cardSubtreeMode: simplifiedCardSubtreeActive ? 'simplified' : 'full',
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
  }, [densityMotionActive, ENABLE_MOTION_AWARE_BUFFER, ENABLE_SIMPLIFIED_CARD_SUBTREE_ISOLATION, gridColumnCount, layout.includedItemCount, layout.items, layout.stageHeight, layout.totalItemCount, layoutComputationScope, renderBufferPx, renderWindow.bottom, renderWindow.top, renderedLayoutItems, simplifiedCardSubtreeActive]);

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
          const positionedStyle: React.CSSProperties & { '--card-index': string } = {
            position: 'absolute',
            left: x,
            top: y,
            width,
            minHeight: `${height}px`,
            height,
            '--card-index': String(index),
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
          const isScrollRevealVisible = revealedCards.has(viewModel.selectionKey);
          const pageLoadDelayMs = 80 + (Math.min(index, 18) * 28);
          return (
            <div
              key={viewModel.renderKey}
              className={`masonry-card asset asset-interactive-surface ${viewModel.isActive ? 'is-active' : ''} ${viewModel.isSecondTapReinforced ? 'is-active-reinforced' : ''} ${viewModel.isHoldEmphasis ? 'is-hold-emphasis' : ''} ${viewModel.isSelected ? 'is-selected' : ''} ${pageLoadEntranceActive ? 'page-load-enter' : ''} ${!isScrollRevealVisible ? 'scroll-reveal-pending' : 'scroll-reveal-visible'}`}
              style={{
                ...positionedStyle,
                '--page-load-delay': `${pageLoadDelayMs}ms`,
                '--scroll-reveal-delay': `${Math.min(index, 6) * 12}ms`,
              } as React.CSSProperties}
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
                {!simplifiedCardSubtreeActive && viewModel.activeVideoPreviewUrl ? (
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
                {simplifiedCardSubtreeActive ? null : (
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
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const AssetGrid = memo(AssetGridComponent);
