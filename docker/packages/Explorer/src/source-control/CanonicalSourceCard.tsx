import React from 'react';

import type { SourceControlRecord } from '../types/sourceControl';

type Props = {
  source: SourceControlRecord;
  onContextMenu: (event: React.MouseEvent, source: SourceControlRecord) => void;
};

export function CanonicalSourceCard({ source, onContextMenu }: Props) {
  const authority = source.authority || 'canonical';
  return (
    <div className="card" onContextMenu={(event) => onContextMenu(event, source)}>
      <strong>{source.name}</strong>
      <div className="small">{source.root || 'No root path'}</div>
      <div className="tagrow">
        <span className={`tag ${source.enabled ? 'good' : ''}`}>{source.enabled ? 'enabled' : 'disabled'}</span>
        <span className={`tag ${source.accessible ? 'good' : 'bad'}`}>{source.accessible ? 'reachable' : 'unreachable'}</span>
        <span className="tag">{source.kind || source.type || 'filesystem'}</span>
        <span className="tag">{authority}</span>
      </div>
      <button className="btn" type="button" onClick={(event) => onContextMenu(event, source)} style={{ marginTop: 8 }}>⋯</button>
    </div>
  );
}
