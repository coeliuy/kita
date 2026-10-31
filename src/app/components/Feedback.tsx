/** "Send feedback": a short message box, opened from the sidebar, More or Settings. */
import { useEffect, useState } from 'react';
import { useKita } from '../store/KitaProvider';

const EVENT = 'kita:feedback';

/** Open the feedback box from anywhere. */
export const openFeedback = () => dispatchEvent(new Event(EVENT));

export function FeedbackDialog() {
  const { storeKind, sendFeedback, toast } = useKita();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    addEventListener(EVENT, show);
    return () => removeEventListener(EVENT, show);
  }, []);

  if (!open) return null;
  const close = () => { setOpen(false); setText(''); };
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const ok = await sendFeedback(text);
    setSending(false);
    if (ok) { close(); toast('Thanks! Your feedback was sent.'); }
    else toast('Your feedback didn’t send. Check your connection and try again.');
  };

  return (
    <div id="palette" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="pal-box" role="dialog" aria-label="Send feedback" style={{ padding: 18 }}>
        <h2 style={{ marginBottom: 6 }}>Send feedback</h2>
        <p className="sub" style={{ marginBottom: 12 }}>What’s working, what’s confusing, what’s missing? Anything helps.</p>
        {storeKind === 'cloud' ? (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} maxLength={5000} autoFocus rows={6}
              aria-label="Your feedback" placeholder="e.g. I expected the invoice to…" onKeyDown={e => { if (e.key === 'Escape') close(); }} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn link" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={sending || !text.trim()} onClick={send}>{sending ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        ) : (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="muted small">Feedback can be sent once you’re signed in.</p>
            <button className="btn" onClick={close}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
