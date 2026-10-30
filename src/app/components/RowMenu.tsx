/** The "…" button on a row, opening a small menu of actions. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './ui';

export type MenuItem = { label: string; run: () => void; danger?: boolean };

export function RowMenu({ label, items }: { label: string; items: (MenuItem | false | null | undefined)[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: -9999, top: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const list = items.filter((x): x is MenuItem => !!x);

  // Place the menu under the button, or above it if there's no room below.
  useLayoutEffect(() => {
    if (!open || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = menu.current.offsetWidth, h = menu.current.offsetHeight;
    const top = r.bottom + 6 + h > innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
    setPos({ left: Math.max(8, r.right - w), top });
    menu.current.querySelector('button')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const startY = scrollY;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    const onScroll = () => { if (Math.abs(scrollY - startY) > 40) close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} className="ibtn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name="more" />
      </button>
      {open && createPortal(
        <div id="pop" ref={menu} role="menu" style={{ left: pos.left, top: pos.top }}>
          {list.map(item => (
            <button key={item.label} role="menuitem" className={item.danger ? 'danger' : ''} onClick={() => { setOpen(false); item.run(); }}>
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
