import React, { memo } from 'react';

import type { MediaItem } from '../types';
import type { ExplorerAssetViewModel } from './AssetGrid';

interface AssetListProps {
  buildAssetViewModel: (item: MediaItem) => ExplorerAssetViewModel;
  canSelect: boolean;
  items: MediaItem[];
  onOpenDrawer: (item: MediaItem) => void;
  onToggleSelected: (item: MediaItem) => void;
}

function AssetListComponent({
  buildAssetViewModel,
  canSelect,
  items,
  onOpenDrawer,
  onToggleSelected,
}: AssetListProps) {
  return (
    <>
      {items.map((item) => {
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
            </div>
            <div className="info">
              <div className="t tile-ui-text">{viewModel.title}</div>
              <div className="s tile-ui-text">
                {viewModel.sub} • {viewModel.size} • {viewModel.kind}
              </div>
            </div>
            <div className="actions" data-no-preview="1">
              <input
                type="checkbox"
                checked={viewModel.isSelected}
                title="Select"
                data-no-preview="1"
                disabled={!canSelect}
                onChange={() => onToggleSelected(item)}
              />
              <button className="iconbtn" type="button" data-no-preview="1" onClick={() => onOpenDrawer(item)}>
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
