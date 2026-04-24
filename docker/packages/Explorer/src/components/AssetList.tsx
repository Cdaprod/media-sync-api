import React, { memo } from 'react';

import type { MediaItem } from '../types';
import PendingComposeAssetCard, { type PendingComposeAsset } from './PendingComposeAssetCard';
import type { ExplorerAssetViewModel } from './AssetGrid';

interface AssetListProps {
  buildAssetViewModel: (item: MediaItem) => ExplorerAssetViewModel;
  canSelect: boolean;
  items: Array<
    | { kind: 'asset'; item: MediaItem }
    | { kind: 'pending'; pendingItem: PendingComposeAsset }
  >;
  onOpenPreview: (item: MediaItem) => void;
  onToggleSelected: (item: MediaItem) => void;
  onDismissPendingJob: (jobId: string) => void;
}

function AssetListComponent({
  buildAssetViewModel,
  canSelect,
  items,
  onOpenPreview,
  onToggleSelected,
  onDismissPendingJob,
}: AssetListProps) {
  const handleInteractivePointerDown = (
    event: React.PointerEvent<HTMLInputElement | HTMLButtonElement | HTMLDivElement>,
  ) => {
    event.stopPropagation();
  };

  return (
    <>
      {items.map((entry) => {
        if (entry.kind === 'pending') {
          return (
            <PendingComposeAssetCard
              key={`pending-row-${entry.pendingItem.jobId}`}
              item={entry.pendingItem}
              onDismiss={entry.pendingItem.status === 'failed' ? () => onDismissPendingJob(entry.pendingItem.jobId) : undefined}
            />
          );
        }
        const item = entry.item;
        const viewModel = buildAssetViewModel(item);

        return (
          <div
            className={`row asset-interactive-surface ${viewModel.isActive ? 'is-active' : ''} ${viewModel.isSecondTapReinforced ? 'is-active-reinforced' : ''} ${viewModel.isHoldEmphasis ? 'is-hold-emphasis' : ''} ${viewModel.isSelected ? 'is-selected' : ''}`}
            key={`row-${viewModel.renderKey}`}
            data-select-key={viewModel.selectionKey}
            data-active={viewModel.isActive ? 'true' : 'false'}
            {...viewModel.pointerHandlers}
          >
            <div className="mini">
              <img
                className="asset-thumb"
                src={viewModel.fallbackThumb}
                alt={viewModel.title}
                loading="lazy"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onError={(event) => {
                  const native = event.nativeEvent;
                  native.stopImmediatePropagation?.();
                  native.stopPropagation?.();
                  const node = event.currentTarget;
                  const failedUrl = node.currentSrc || node.src || node.dataset.thumbUrl || '';
                  const fallback = node.dataset.thumbFallback || '';
                  if (process.env.NODE_ENV !== 'production') {
                    console.warn('[Explorer] thumbnail failed', {
                      failedUrl,
                      thumbUrl: node.dataset.thumbUrl || '',
                      fallback,
                      relative: node.closest('[data-relative]')?.getAttribute('data-relative') || '',
                    });
                  }
                  node.title = `Thumbnail failed: ${failedUrl}`;
                  node.setAttribute('aria-label', `Thumbnail failed: ${failedUrl}`);
                  node.onerror = null;
                  if (fallback && node.src !== fallback) node.src = fallback;
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
            </div>
            <div className="info">
              <div className="t tile-ui-text">{viewModel.title}</div>
              <div className="s tile-ui-text">
                {viewModel.sub} • {viewModel.size} • {viewModel.kind}
              </div>
            </div>
            <div className="actions" data-interactive="true" data-no-preview="1" onPointerDown={handleInteractivePointerDown}>
              <input
                type="checkbox"
                checked={viewModel.isSelected}
                title="Select"
                data-interactive="true"
                data-no-preview="1"
                disabled={!canSelect}
                onPointerDown={handleInteractivePointerDown}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onChange={() => onToggleSelected(item)}
              />
              <button
                className="iconbtn"
                type="button"
                data-interactive="true"
                data-no-preview="1"
                onPointerDown={handleInteractivePointerDown}
                onClick={() => onOpenPreview(item)}
              >
                Preview
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

export const AssetList = memo(AssetListComponent);
