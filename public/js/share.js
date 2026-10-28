// Copy to clipboard and share the invite link. The Clipboard API needs a
// secure context (https or localhost), so there's a fallback for testing over
// plain http on the local Wi-Fi.

import { GAME_TITLE } from '../config.js';
import { t } from './i18n.js';
import { toast } from './components/toast.js';

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.className = 'offscreen';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export function inviteLink(code) {
  return `${location.origin}${location.pathname}?room=${code}`;
}

export async function copyCode(code) {
  if (await copyText(code)) toast(t('lobby.copied'), { kind: 'ok' });
  else toast(t('lobby.copyFailed', { code }), { kind: 'warn' });
}

export async function shareRoom(code) {
  const url = inviteLink(code);
  if (navigator.share) {
    try {
      await navigator.share({ title: GAME_TITLE, text: t('share.text', { code, title: GAME_TITLE }), url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // the player closed the share sheet
    }
  }
  if (await copyText(url)) toast(t('share.copied'), { kind: 'ok', ic: 'link' });
  else toast(t('lobby.copyFailed', { code }), { kind: 'warn' });
}
