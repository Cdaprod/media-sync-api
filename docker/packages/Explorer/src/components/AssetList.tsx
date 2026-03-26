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
  onOpenDrawer: (item: MediaItem) => void;
  onToggleSelected: (item: MediaItem) => void;
  onDismissPendingJob: (jobId: string) => void;
}

function AssetListComponent({
  buildAssetViewModel,
  canSelect,
  items,
  onOpenDrawer,
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
            className={`row asset-interactive-surface ${viewModel.isActive ? 'is-active' : ''} ${viewModel.isSelected ? 'is-selected' : ''}`}
            key={`row-${viewModel.renderKey}`}
            data-select-key={viewModel.selectionKey}
            data-active={viewModel.isActive ? 'true' : 'false'}
            {...viewModel.pointerHandlers}
          >
            <div className="mini">
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
                onClick={() => onOpenDrawer(item)}
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
