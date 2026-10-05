import { h } from './dom';

function overlay(content: HTMLElement, onClose: () => void): { close(): void } {
  const backdrop = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, content);
  const prevFocus = document.activeElement as HTMLElement | null;
  const close = () => {
    backdrop.remove();
    document.body.classList.remove('modal-open');
    prevFocus?.focus?.();
    onClose();
  };
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.append(backdrop);
  document.body.classList.add('modal-open');
  return { close };
}

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmText: string;
  danger?: boolean;
  cancelText?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean, close: () => void) => {
      if (done) return;
      done = true;
      close();
      resolve(v);
    };
    // eslint-disable-next-line prefer-const
    let ctl: { close(): void };
    const card = h(
      'div',
      { class: 'dialog' },
      h('h2', null, opts.title),
      h('p', null, opts.message),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => finish(false, ctl.close) } }, opts.cancelText ?? 'CANCEL'),
        h('button', { class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', on: { click: () => finish(true, ctl.close) } }, opts.confirmText),
      ),
    );
    ctl = overlay(card, () => {
      if (!done) {
        done = true;
        resolve(false);
      }
    });
  });
}

export function noteDialog(initial: string, title = 'Job note'): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const ta = h('textarea', {
      class: 'note-input',
      rows: 5,
      maxlength: 1000,
      placeholder: 'Job #, machine, setup, special wire, inspection note…',
      autocapitalize: 'sentences',
    });
    ta.value = initial;
    // eslint-disable-next-line prefer-const
    let ctl: { close(): void };
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      ctl.close();
      resolve(v);
    };
    const card = h(
      'div',
      { class: 'dialog' },
      h('h2', null, title),
      ta,
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => finish(null) } }, 'CANCEL'),
        h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => finish(ta.value) } }, 'SAVE NOTE'),
      ),
    );
    ctl = overlay(card, () => {
      if (!done) {
        done = true;
        resolve(null);
      }
    });
    setTimeout(() => ta.focus(), 50);
  });
}

/** Read-only selectable text (last-resort share/copy fallback). */
export function openTextDialog(title: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    const ta = h('textarea', { class: 'note-input mono', rows: 10, readonly: true });
    ta.value = text;
    // eslint-disable-next-line prefer-const
    let ctl: { close(): void };
    const card = h(
      'div',
      { class: 'dialog' },
      h('h2', null, title),
      h('p', { class: 'dim' }, 'Select all and copy:'),
      ta,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn btn-primary', type: 'button', on: { click: () => ctl.close() } }, 'DONE')),
    );
    ctl = overlay(card, resolve);
    setTimeout(() => {
      ta.focus();
      ta.select();
    }, 50);
  });
}

let toastTimer: number | undefined;
export function showToast(message: string): void {
  let t = document.getElementById('toast');
  if (!t) {
    t = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(t);
  }
  t.textContent = message;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2400);
}
