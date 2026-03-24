import { gsap } from '../../lib/gsap';

export function addBubblySettle(items: HTMLElement[]): gsap.core.Tween | null {
  if (!items.length) return null;

  return gsap.fromTo(
    items,
    { y: -2 },
    {
      y: 0,
      duration: 0.22,
      ease: 'back.out(1.15)',
      stagger: {
        each: 0.006,
        from: 'start',
      },
      overwrite: 'auto',
    },
  );
}
