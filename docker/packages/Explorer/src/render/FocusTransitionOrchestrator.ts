import { gsap } from '../lib/gsap';
import { captureFocusSceneSnapshot } from './SceneSnapshot';
import { computeCameraStateForTarget } from './CameraController';
import { ViewportProxyRenderer } from './ViewportProxyRenderer';
import type { ProxyCameraState } from './renderTypes';

export class FocusTransitionOrchestrator {
  private renderer: ViewportProxyRenderer;
  private root: HTMLElement;
  private timeline: gsap.core.Timeline | null = null;
  private currentCamera: ProxyCameraState = {
    x: 0, y: 0, scale: 1, tiltX: 0, tiltY: 0, velocityX: 0, velocityY: 0,
  };

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderer = new ViewportProxyRenderer(root);
  }

  private publishCenterDebug(args: {
    viewportLeft: number;
    viewportTop: number;
    viewportWidth: number;
    viewportHeight: number;
    camera: ProxyCameraState;
    targetCenterX: number;
    targetCenterY: number;
    topInset?: number;
    bottomInset?: number;
    sideInset?: number;
  }) {
    const topInset = args.topInset ?? 88;
    const bottomInset = args.bottomInset ?? 140;
    const sideInset = args.sideInset ?? 24;
    const safeWidth = Math.max(120, args.viewportWidth - sideInset * 2);
    const safeHeight = Math.max(120, args.viewportHeight - topInset - bottomInset);
    const viewportCenter = {
      x: args.viewportLeft + sideInset + safeWidth / 2,
      y: args.viewportTop + topInset + safeHeight / 2,
    };
    const targetCenter = {
      x: (args.targetCenterX * args.camera.scale) + args.camera.x,
      y: (args.targetCenterY * args.camera.scale) + args.camera.y,
    };
    (globalThis as typeof globalThis & {
      __explorerProxyCenterDebug?: {
        viewportCenter: { x: number; y: number };
        targetCenter: { x: number; y: number };
        finalDeltaX: number;
        finalDeltaY: number;
      };
    }).__explorerProxyCenterDebug = {
      viewportCenter,
      targetCenter,
      finalDeltaX: Math.round((targetCenter.x - viewportCenter.x) * 100) / 100,
      finalDeltaY: Math.round((targetCenter.y - viewportCenter.y) * 100) / 100,
    };
  }

  openFocusTransition(args: {
    gridRoot: HTMLElement;
    viewportEl: HTMLElement;
    selectionKey: string;
    onStart?: () => void;
    onComplete?: () => void;
    onEvent?: (event: 'proxy-open-start' | 'proxy-open-complete' | 'proxy-failed') => void;
  }) {
    const snapshot = captureFocusSceneSnapshot({
      gridRoot: args.gridRoot,
      viewportEl: args.viewportEl,
      activeSelectionKey: args.selectionKey,
    });

    if (!snapshot.target) {
      args.onEvent?.('proxy-failed');
      return false;
    }

    const camera = computeCameraStateForTarget({
      target: snapshot.target,
      viewportLeft: snapshot.viewport.left,
      viewportTop: snapshot.viewport.top,
      viewportWidth: snapshot.viewport.width,
      viewportHeight: snapshot.viewport.height,
    });

    const startCamera = { ...this.currentCamera, x: 0, y: 0, scale: 1 };
    this.renderer.render(snapshot, startCamera);
    this.root.style.opacity = '1';
    this.root.style.pointerEvents = 'auto';

    this.timeline?.kill();
    this.renderer.mount();
    this.timeline = gsap.timeline({
      onStart: () => {
        args.onEvent?.('proxy-open-start');
        args.onStart?.();
      },
      onComplete: () => {
        this.currentCamera = { ...camera };
        this.publishCenterDebug({
          viewportLeft: snapshot.viewport.left,
          viewportTop: snapshot.viewport.top,
          viewportWidth: snapshot.viewport.width,
          viewportHeight: snapshot.viewport.height,
          camera,
          targetCenterX: snapshot.target!.centerX,
          targetCenterY: snapshot.target!.centerY,
        });
        args.onEvent?.('proxy-open-complete');
        args.onComplete?.();
      },
    });

    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) {
      args.onEvent?.('proxy-failed');
      return false;
    }

    this.timeline.to(world, {
      x: camera.x,
      y: camera.y,
      scale: camera.scale,
      duration: 0.72,
      ease: 'power3.inOut',
      overwrite: 'auto',
    });

    return true;
  }

  refocusTransition(args: {
    gridRoot: HTMLElement;
    viewportEl: HTMLElement;
    selectionKey: string;
    onStart?: () => void;
    onComplete?: () => void;
    onEvent?: (event: 'proxy-refocus-start' | 'proxy-refocus-complete' | 'proxy-failed') => void;
  }) {
    const snapshot = captureFocusSceneSnapshot({
      gridRoot: args.gridRoot,
      viewportEl: args.viewportEl,
      activeSelectionKey: args.selectionKey,
    });
    if (!snapshot.target) {
      args.onEvent?.('proxy-failed');
      return false;
    }
    const camera = computeCameraStateForTarget({
      target: snapshot.target,
      viewportLeft: snapshot.viewport.left,
      viewportTop: snapshot.viewport.top,
      viewportWidth: snapshot.viewport.width,
      viewportHeight: snapshot.viewport.height,
    });
    this.renderer.render(snapshot, this.currentCamera);
    this.root.style.opacity = '1';
    this.root.style.pointerEvents = 'auto';
    this.timeline?.kill();
    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) {
      args.onEvent?.('proxy-failed');
      return false;
    }
    this.timeline = gsap.timeline({
      onStart: () => {
        args.onEvent?.('proxy-refocus-start');
        args.onStart?.();
      },
      onComplete: () => {
        this.currentCamera = { ...camera };
        this.publishCenterDebug({
          viewportLeft: snapshot.viewport.left,
          viewportTop: snapshot.viewport.top,
          viewportWidth: snapshot.viewport.width,
          viewportHeight: snapshot.viewport.height,
          camera,
          targetCenterX: snapshot.target!.centerX,
          targetCenterY: snapshot.target!.centerY,
        });
        args.onEvent?.('proxy-refocus-complete');
        args.onComplete?.();
      },
    });
    this.timeline.to(world, {
      x: camera.x,
      y: camera.y,
      scale: camera.scale,
      duration: 0.48,
      ease: 'power3.inOut',
      overwrite: 'auto',
    });
    return true;
  }

  closeFocusTransition(args?: {
    onStart?: () => void;
    onComplete?: () => void;
  }) {
    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) {
      this.root.style.opacity = '0';
      this.root.style.pointerEvents = 'none';
      this.currentCamera = {
        x: 0, y: 0, scale: 1, tiltX: 0, tiltY: 0, velocityX: 0, velocityY: 0,
      };
      args?.onComplete?.();
      return;
    }

    this.timeline?.kill();
    this.timeline = gsap.timeline({
      onStart: () => args?.onStart?.(),
      onComplete: () => {
        this.root.style.opacity = '0';
        this.root.style.pointerEvents = 'none';
        this.renderer.unmount();
        this.currentCamera = {
          x: 0, y: 0, scale: 1, tiltX: 0, tiltY: 0, velocityX: 0, velocityY: 0,
        };
        args?.onComplete?.();
      },
    });

    this.timeline.to(world, {
      x: 0,
      y: 0,
      scale: 1,
      duration: 0.42,
      ease: 'power3.inOut',
      overwrite: 'auto',
    });
  }
}
