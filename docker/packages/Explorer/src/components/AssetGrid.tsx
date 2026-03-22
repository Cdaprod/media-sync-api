import React, { memo } from 'react';

import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';
import type { AssetPointerHandlers } from '../useAssetInteractions';
import type { MediaItem } from '../types';

export interface ExplorerAssetViewModel {
  item: MediaItem;
  kind: string;
  orient: string;
  orientLocked: boolean;
  renderKey: string;
  selectionKey: string;
  isActive: boolean;
  isSelected: boolean;
  size: string;
  sub: string;
  thumbJobKey: string;
  thumbKey: string;
  thumbUrl?: string;
  title: string;
  fallbackThumb: string;
  safeThumbUrl: string;
  pointerHandlers: AssetPointerHandlers;
  kindBadgeClassName: string;
  selectionOrderLabel: string;
}

interface AssetGridProps {
  buildAssetViewModel: (item: MediaItem) => ExplorerAssetViewModel;
  canSelect: boolean;
  gridColumnCount: number;
  masonryColumns: Array<Array<
    | { kind: 'asset'; item: MediaItem }
    | { kind: 'pending'; pendingItem: PendingComposeAsset }
  >>;
  onToggleSelected: (item: MediaItem) => void;
}

function AssetGridComponent({
  buildAssetViewModel,
  canSelect,
  gridColumnCount,
  masonryColumns,
  onToggleSelected,
}: AssetGridProps) {
  return (
    <div className="masonry-columns" style={{ '--masonry-column-count': String(gridColumnCount) } as React.CSSProperties}>
      {masonryColumns.map((column, columnIndex) => (
        <div className="masonry-column" key={`masonry-column-${columnIndex}`}>
          {column.map((entry) => {
            if (entry.kind === 'pending') {
              return (
                <PendingComposeAssetCard
                  key={`pending-${entry.pendingItem.jobId}`}
                  item={entry.pendingItem}
                />
              );
            }
            const item = entry.item;
            const viewModel = buildAssetViewModel(item);

            return (
              <div
                key={viewModel.renderKey}
                className={`asset asset-interactive-surface ${viewModel.isActive ? 'is-active' : ''} ${viewModel.isSelected ? 'is-selected' : ''}`}
                data-kind={viewModel.kind}
                data-orient={viewModel.orient}
                data-orient-locked={viewModel.orientLocked ? 'true' : 'false'}
                data-thumb-key={viewModel.thumbKey}
                data-thumb-job-key={viewModel.thumbJobKey}
                data-relative={viewModel.item.relative_path || ''}
                data-select-key={viewModel.selectionKey}
                data-active={viewModel.isActive ? 'true' : 'false'}
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
                  <div className="asset-overlay">
                    <div className="asset-ol-tl">
                      <span className={`badge ${viewModel.kindBadgeClassName} tile-ui-text`}>{viewModel.kind}</span>
                    </div>
                    <div className="asset-ol-tr">
                      <div
                        className="selector sel-ui"
                        title="Select"
                        data-no-preview="1"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!canSelect) return;
                          const target = event.target as HTMLElement;
                          if (!target.closest('.sel-shell, .sel-order, input[type="checkbox"]')) return;
                          onToggleSelected(item);
                        }}
                      >
                        <span className="sel-shell" data-no-preview="1">
                          <input
                            type="checkbox"
                            checked={viewModel.isSelected}
                            aria-label="Select media"
                            disabled={!canSelect}
                            data-no-preview="1"
                            onClick={(event) => event.stopPropagation()}
                            onChange={() => onToggleSelected(item)}
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
      ))}
    </div>
  );
}

export const AssetGrid = memo(AssetGridComponent);
