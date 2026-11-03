// Tooltip contenuto nell'area dell'iframe: la posizione è limitata ai bordi del documento
export function createTooltip(root = document.body) {
  const el = document.createElement('div');
  el.className = 'tip'; el.setAttribute('role', 'tooltip');
  root.appendChild(el);
  return {
    el,
    show(html, x, y) {
      el.innerHTML = html; el.style.display = 'block';
      this.move(x, y);
    },
    move(x, y) {
      const pad = 6;
      const W = document.documentElement.clientWidth, H = document.body.getBoundingClientRect().height;
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + w > W - pad) left = x - w - 14;
      if (left < pad) left = Math.max(pad, Math.min(W - w - pad, x - w / 2));
      if (top + h > H - pad) top = y - h - 14;
      if (top < pad) top = pad;
      el.style.left = left + 'px'; el.style.top = top + 'px';
    },
    hide() { el.style.display = 'none'; }
  };
}
