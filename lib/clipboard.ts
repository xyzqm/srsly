/**
 * Copy text to the clipboard, with the fallback the async API needs.
 *
 * `navigator.clipboard` is not always there and `writeText` is not always allowed:
 *   - the object is undefined outside a secure context (plain http on anything but
 *     localhost), so touching `.writeText` throws synchronously rather than rejecting;
 *   - the promise rejects when the document is not focused, or the permission is denied.
 *
 * The call sites here were `.writeText(…).then(setCopied)` with no catch, so on any of those
 * the copy silently did nothing AND raised an unhandled rejection — the button just never
 * said "copied". The old `execCommand` path still works in every browser that fails the
 * above, which is exactly the population that needs it.
 *
 * Returns whether the text actually reached the clipboard, so the caller can tell the truth
 * instead of assuming success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path below */ }

  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    // Off-screen but still selectable; `readOnly` stops mobile keyboards appearing.
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
