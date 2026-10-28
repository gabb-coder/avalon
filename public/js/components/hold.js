// Hold to reveal (HANDOFF §5): pointerdown shows, and pointerup, pointercancel,
// pointerleave, visibilitychange and window blur all hide immediately. Space
// and Enter mirror it from the keyboard. The long-press menu and text
// selection are blocked.
//
// The caller inserts the secret into the DOM in onShow and removes it in
// onHide: nothing secret sits hidden in the page between holds.

export function bindHold(el, { onShow, onHide }) {
  let held = false;

  const show = () => {
    if (held) return;
    held = true;
    onShow();
  };
  const hide = () => {
    if (!held) return;
    held = false;
    onHide();
  };

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // not supported: pointerleave still hides
    }
    e.preventDefault();
    show();
  };
  const key = (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.type === 'keydown') show();
    else hide();
  };
  const onVisibility = () => {
    if (document.hidden) hide();
  };
  const noMenu = (e) => e.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', hide);
  el.addEventListener('pointercancel', hide);
  el.addEventListener('pointerleave', hide);
  el.addEventListener('lostpointercapture', hide);
  el.addEventListener('keydown', key);
  el.addEventListener('keyup', key);
  el.addEventListener('blur', hide);
  el.addEventListener('contextmenu', noMenu);
  el.addEventListener('selectstart', noMenu);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', hide);

  return {
    get held() {
      return held;
    },
    hide,
    // Call when the element is removed, so the window listeners go too.
    destroy() {
      hide();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', hide);
    },
  };
}

// Hold to confirm (HANDOFF §5): used in one place only, the Assassin's strike,
// because it ends the game and can't be undone. `onDone` fires after `ms` of
// one unbroken hold. Built on bindHold, so every way of letting go (lifting
// the finger, sliding off, switching apps, losing focus) cancels and resets.
export function bindHoldToConfirm(el, { ms, onStart, onCancel, onDone }) {
  let timer = null;
  const hold = bindHold(el, {
    onShow: () => {
      onStart?.();
      timer = setTimeout(() => {
        timer = null;
        onDone();
      }, ms);
    },
    onHide: () => {
      if (!timer) return; // already done: letting go afterwards changes nothing
      clearTimeout(timer);
      timer = null;
      onCancel?.();
    },
  });
  return {
    destroy() {
      clearTimeout(timer);
      timer = null;
      hold.destroy();
    },
  };
}
