/**
 * A small burst of confetti for good moments: getting paid, finishing a task,
 * passing a goal milestone. Skipped for people who've asked their device to
 * reduce motion.
 */
const COLOURS = ['#C44900', '#E39A6B', '#1B998B', '#A3D7D1', '#F2B33D'];

/** Where the last click or tap was, so confetti comes from the button pressed. */
let lastPoint: { x: number; y: number } | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    if (e.clientX || e.clientY) lastPoint = { x: e.clientX, y: e.clientY };
    else if (e.target instanceof Element) {
      const b = e.target.getBoundingClientRect();
      lastPoint = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }
  }, true);
}

export function burst(pieces: number, at: { x: number; y: number } | null = lastPoint) {
  if (typeof window === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { x, y } = at ?? { x: innerWidth / 2, y: innerHeight / 2 };
  for (let i = 0; i < pieces; i++) {
    const d = document.createElement('i');
    d.className = 'conf';
    d.style.background = COLOURS[i % COLOURS.length]!;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    document.body.appendChild(d);
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * (pieces > 20 ? 160 : 90);
    d.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * speed}px,${Math.sin(angle) * speed + 120}px) rotate(${Math.random() * 540}deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).onfinish = () => d.remove();
  }
}

/** The goal milestone (25%, 50%, 75% or 100%) crossed going from `before` to `after`, if any. */
export function milestoneCrossed(before: number, after: number): number | null {
  return [1, 0.75, 0.5, 0.25].find(m => before < m && after >= m) ?? null;
}
