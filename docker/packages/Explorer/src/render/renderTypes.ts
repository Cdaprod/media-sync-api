export type RenderCardSnapshot = {
  id: string;
  selectionKey: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  thumbUrl?: string;
  mediaUrl?: string;
  kind: string;
  title?: string;
  active: boolean;
  selected: boolean;
  priority: number;
};

export type CameraTarget = {
  selectionKey: string;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type ProxyCameraState = {
  x: number;
  y: number;
  scale: number;
  tiltX: number;
  tiltY: number;
  velocityX: number;
  velocityY: number;
};

export type FocusSceneSnapshot = {
  cards: RenderCardSnapshot[];
  viewport: {
    left: number;
    top: number;
    width: number;
    height: number;
    scrollTop: number;
  };
  target: CameraTarget | null;
};
