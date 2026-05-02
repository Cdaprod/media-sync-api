import React from 'react';

import type { NodeControlRecord, SourceControlRecord } from '../types/sourceControl';

type Props = {
  source: SourceControlRecord;
  owner?: NodeControlRecord;
  onContextMenu: (event: React.MouseEvent, source: SourceControlRecord) => void;
};

export function RemoteSourceSurfaceCard({ source, owner, onContextMenu }: Props) {
  const authority = source.authority || 'canonical';
  return (
    <div className="card" onContextMenu={(event) => onContextMenu(event, source)}>
      <strong>{source.name}</strong>
      <div className="small">owner: {source.owner_node_id || 'unknown'}</div>
      {owner?.label ? <div className="small">{owner.label}</div> : null}
      {owner?.base_url ? <div className="small">{owner.base_url}</div> : null}
      <div className="tagrow">
        <span className={`tag ${source.enabled ? 'good' : ''}`}>{source.enabled ? 'enabled' : 'disabled'}</span>
        <span className={`tag ${source.accessible ? 'good' : 'bad'}`}>{source.accessible ? 'reachable' : 'unreachable'}</span>
        <span className="tag">{source.kind || source.type || 'remote'}</span>
        <span className="tag">{authority}</span>
        {source.local_only ? <span className="tag">local-only</span> : null}
        {source.can_index ? <span className="tag">index</span> : null}
        {source.can_proxy ? <span className="tag">proxy</span> : null}
        {source.can_record ? <span className="tag">record</span> : null}
      </div>
      <button className="btn" type="button" onClick={(event) => onContextMenu(event, source)} style={{ marginTop: 8 }}>⋯</button>
    </div>
  );
}
