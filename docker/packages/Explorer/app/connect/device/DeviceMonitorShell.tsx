'use client';

import type { ReactNode } from 'react';

type DeviceMonitorMode = 'local' | 'remote';

type DeviceMonitorShellProps = {
  mode: DeviceMonitorMode;
  onModeChange: (mode: DeviceMonitorMode) => void;
  sourceLabel: string;
  title?: string;
  statusBadge?: number;
  onBack: () => void;
  onForward?: () => void;
  canForward?: boolean;
  onToggleScopes?: () => void;
  onOpenMenu?: () => void;
  onDone: () => void;
  children: ReactNode;
};

export default function DeviceMonitorShell({
  mode,
  onModeChange,
  sourceLabel,
  title = 'FullscreenPreview · ThatDAMToolbox',
  statusBadge = 0,
  onBack,
  onForward,
  canForward = false,
  onToggleScopes,
  onOpenMenu,
  onDone,
  children,
}: DeviceMonitorShellProps) {
  return (
    <div className="device-monitor-shell">
      <header className="device-monitor-topbar">
        <div
          className="device-monitor-segment"
          role="tablist"
          aria-label="Monitor mode"
        >
          <button
            type="button"
            className={mode === 'local' ? 'active' : ''}
            onClick={() => onModeChange('local')}
          >
            Local
          </button>
          <button
            type="button"
            className={mode === 'remote' ? 'active' : ''}
            onClick={() => onModeChange('remote')}
          >
            Remote
          </button>
        </div>
        <p className="device-monitor-source-pill" title={sourceLabel}>
          {sourceLabel}
        </p>
        <p className="device-monitor-title">{title}</p>
      </header>

      <main className="device-monitor-main">{children}</main>

      <footer
        className="device-monitor-footer"
        data-monitor-footer="navigation-controls"
      >
        <button
          type="button"
          className="device-monitor-footer-btn"
          onClick={onBack}
          aria-label="Back"
        >
          ←
        </button>
        <button
          type="button"
          className="device-monitor-footer-btn"
          aria-label="Forward"
          disabled={!canForward}
          onClick={onForward}
        >
          →
        </button>
        <button
          type="button"
          className="device-monitor-footer-btn"
          aria-label="Toggle scopes"
          onClick={onToggleScopes}
        >
          ◉
        </button>
        <button
          type="button"
          className="device-monitor-footer-btn"
          aria-label="Open monitor menu"
          onClick={onOpenMenu}
        >
          ☰
          {statusBadge > 0 ? (
            <span className="device-monitor-badge">{statusBadge}</span>
          ) : null}
        </button>
        <button
          type="button"
          className="device-monitor-footer-done"
          onClick={onDone}
        >
          Done
        </button>
      </footer>
    </div>
  );
}
