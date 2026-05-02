import React from 'react';

import type { LiveSession } from '../types/liveSession';
import type { NodeControlRecord } from '../types/sourceControl';
import { isTestPayloadNode } from '../utils/runtimeLabels';

type RuntimeChip = { label: string; tone: string };

type Props = {
  node: NodeControlRecord;
  liveSession: LiveSession | undefined;
  chips: RuntimeChip[];
  onContextMenu: (event: React.MouseEvent, node: NodeControlRecord) => void;
};

export function RuntimeNodeCard({ node, chips, onContextMenu }: Props) {
  return (
    <div className="card" key={node.node_id} onContextMenu={(event) => onContextMenu(event, node)}>
      <strong>{node.label}</strong>
      <div className="small">{node.node_id}</div>
      <div className="small">{node.base_url}</div>
      <div className="tagrow">
        {chips.map((chip) => (
          <span className={`tag ${chip.tone}`} key={`${node.node_id}-chip-${chip.label}`}>{chip.label}</span>
        ))}
        {isTestPayloadNode(node) ? <span className="tag bad">test payload</span> : null}
      </div>
      {node.last_heartbeat_at ? <div className="small">heartbeat: {node.last_heartbeat_at}</div> : null}
      {isTestPayloadNode(node) ? <div className="small">This node appears modified by Swagger example data. Re-register from Explorer.</div> : null}
      <button className="btn" type="button" onClick={(event) => onContextMenu(event, node)} style={{ marginTop: 8 }}>⋯</button>
    </div>
  );
}
