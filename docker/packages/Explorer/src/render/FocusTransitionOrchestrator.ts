import { gsap } from '../lib/gsap';
import { captureFocusSceneSnapshot } from './SceneSnapshot';
import { computeCameraStateForTarget } from './CameraController';
import { ViewportProxyRenderer } from './ViewportProxyRenderer';

export class FocusTransitionOrchestrator {
  private renderer: ViewportProxyRenderer;
  private root: HTMLElement;
  private timeline: gsap.core.Timeline | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderer = new ViewportProxyRenderer(root);
  }

  open(args: {
    gridRoot: HTMLElement;
    viewportEl: HTMLElement;
    selectionKey: string;
    onStart?: () => void;
    onComplete?: () => void;
  }) {
    const snapshot = captureFocusSceneSnapshot({
      gridRoot: args.gridRoot,
      viewportEl: args.viewportEl,
      activeSelectionKey: args.selectionKey,
    });

    if (!snapshot.target) return false;

    const camera = computeCameraStateForTarget({
      target: snapshot.target,
      viewportWidth: snapshot.viewport.width,
      viewportHeight: snapshot.viewport.height,
    });

    this.renderer.render(snapshot, { ...camera, scale: 1, x: 0, y: 0 });
    this.root.style.opacity = '1';
    this.root.style.pointerEvents = 'auto';

    this.timeline?.kill();
    this.timeline = gsap.timeline({
      onStart: args.onStart,
      onComplete: args.onComplete,
    });

    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) return false;

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

  close(onComplete?: () => void) {
    const world = this.root.querySelector<HTMLElement>('.proxy-render-world');
    if (!world) {
      this.root.style.opacity = '0';
      this.root.style.pointerEvents = 'none';
      onComplete?.();
      return;
    }

    this.timeline?.kill();
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.root.style.opacity = '0';
        this.root.style.pointerEvents = 'none';
        this.renderer.unmount();
        onComplete?.();
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
