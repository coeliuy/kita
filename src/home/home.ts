/** The homepage: styles, and the ticking clock on the example timer. */
import '../styles/kita.css';

const pad = (n: number) => String(n).padStart(2, '0');
let seconds = 5047;
setInterval(() => {
  const el = document.querySelector('[data-demo-clock]');
  if (!el) return;
  seconds++;
  el.textContent = `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}, 1000);
