/**
 * Copying text to the clipboard. This is a thin shim over two browser APIs, not UI, so it lives in `platform/`
 * next to the other small browser-plumbing modules rather than in a component.
 */

/**
 * Copies text to the clipboard.
 * The async clipboard API only exists on secure pages, and a LAN address such as http://192.168.x.x is not
 * one, so this falls back to a hidden textarea and `execCommand`.
 * @returns Whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea method.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.append(area);
  area.select();
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
