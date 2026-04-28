// docker/packages/Explorer/app/connect/device/deviceMonitorTypes.ts

export interface RemoteCameraNode {
  node_id: string;
  label: string;
  roles?: string[];
  capabilities?: string[];
  advertised_source_kinds?: string[];
  metadata?: Record<string, any>;
  enabled?: boolean;
}

export interface OverlayState {
  zebra: boolean;
  peaking: boolean;
  falseColor: boolean;
  scopeHud: boolean;
}