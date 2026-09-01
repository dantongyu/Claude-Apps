// Tiny DOM helpers so screens read as structure, not as boilerplate.
export function h(tag, opts = {}, ...children) {
  const n = document.createElement(tag);
  if (opts.class) n.className = opts.class;
  if (opts.text != null) n.textContent = opts.text;
  if (opts.html != null) n.innerHTML = opts.html;
  if (opts.style) Object.assign(n.style, opts.style);
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) n.setAttribute(k, v);
  if (opts.on) for (const [k, v] of Object.entries(opts.on)) n.addEventListener(k, v);
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function button(label, onClick, cls = 'btn') {
  return h('button', { class: cls, text: label, on: { click: onClick } });
}

export function panel(title, subtitle) {
  const head = h('header', { class: 'panel-head' }, h('h2', { text: title }));
  if (subtitle) head.append(h('p', { class: 'panel-sub', text: subtitle }));
  return head;
}
