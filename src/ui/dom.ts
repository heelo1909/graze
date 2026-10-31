// Tiny DOM helper shared by the screens. Text only via textContent (names are user input).
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A `.seg` group of toggle buttons; `paint(i)` marks button i pressed. */
export function segGroup(label: string, labels: string[], onPick: (i: number) => void): { group: HTMLElement; paint(i: number): void } {
  const group = el('div', 'seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  const btns = labels.map((t, i) => {
    const b = el('button', 'seg-btn', t);
    b.type = 'button';
    b.addEventListener('click', () => onPick(i));
    group.append(b);
    return b;
  });
  return { group, paint: (i) => btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))) };
}
