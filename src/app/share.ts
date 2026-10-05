/** Share / copy / export helpers with graceful fallbacks (iOS standalone PWAs are picky). */
import { openTextDialog } from '../ui/dialogs';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.append(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const okCopy = document.execCommand('copy');
      ta.remove();
      return okCopy;
    } catch {
      return false;
    }
  }
}

/** Share via the system sheet if available, else copy, else show selectable text. */
export async function shareText(title: string, text: string, toast: (m: string) => void): Promise<void> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  if (await copyText(text)) {
    toast('Copied to clipboard');
    return;
  }
  await openTextDialog(title, text);
}

/** Export JSON: share sheet with a file if supported, else download link, else selectable text. */
export async function exportJson(filename: string, data: unknown, toast: (m: string) => void): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], filename, { type: 'application/json' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Export downloaded');
  } catch {
    await openTextDialog(filename, json);
  }
}
