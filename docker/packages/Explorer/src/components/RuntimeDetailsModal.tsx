import React, { useMemo } from 'react';

interface RuntimeDetailsModalProps {
  title: string;
  subtitle?: string;
  payload: unknown;
  isOpen: boolean;
  onClose: () => void;
}

export function RuntimeDetailsModal({
  title,
  subtitle,
  payload,
  isOpen,
  onClose,
}: RuntimeDetailsModalProps) {
  const json = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  if (!isOpen) return null;

  const copyJson = async () => {
    try {
      await navigator.clipboard?.writeText(json);
    } catch {
      // Clipboard can be unavailable on iOS/insecure origins.
    }
  };

  return (
    <div
      className="confirm-modal open"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="confirm-card" style={{ width: 'min(720px, 94vw)', maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 className="confirm-title">{title}</h3>
            {subtitle ? <div className="confirm-body">{subtitle}</div> : null}
          </div>
          <button className="btn" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" type="button" onClick={() => void copyJson()}>
            Copy JSON
          </button>
        </div>

        <pre
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 14,
            background: 'rgba(0,0,0,0.36)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontSize: 12,
            lineHeight: 1.45,
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {json}
        </pre>
      </div>
    </div>
  );
}
