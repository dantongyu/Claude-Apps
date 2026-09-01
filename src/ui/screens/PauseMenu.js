import { h, button } from '../dom.js';

// Shown whenever pointer lock drops during a match. Doubles as the settings
// panel so options are reachable without leaving the run.
export function renderPause(root, app) {
  const s = app.profile.settings;

  const slider = (label, key, min, max, step, fmt) => {
    const out = h('b', { text: fmt(s[key]) });
    return h('label', { class: 'setting' },
      h('span', { text: label }), out,
      h('input', {
        attrs: { type: 'range', min, max, step, value: String(s[key]) },
        on: { input: (e) => {
          s[key] = parseFloat(e.target.value);
          out.textContent = fmt(s[key]);
          app.applySettings();
          app.save();
        } },
      }),
    );
  };

  root.append(h('div', { class: 'overlay pause' },
    h('div', { class: 'pause-card' },
      h('h2', { text: app.pauseFirst ? 'READY TO DROP' : 'PAUSED' }),
      h('p', { class: 'panel-sub', text: app.pauseFirst
        ? 'Click below to capture the mouse and begin the mission.'
        : 'Click resume to recapture the mouse.' }),
      slider('Sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2)),
      slider('Field of view', 'fov', 60, 110, 1, (v) => `${Math.round(v)}°`),
      h('label', { class: 'setting toggle' },
        h('span', { text: 'Invert vertical look' }),
        h('input', {
          attrs: s.invertY ? { type: 'checkbox', checked: 'checked' } : { type: 'checkbox' },
          on: { change: (e) => { s.invertY = e.target.checked; app.save(); } },
        }),
      ),
      h('div', { class: 'menu' },
        button(app.pauseFirst ? 'DROP IN' : 'RESUME', () => app.resumeMatch(), 'btn primary'),
        button('ABANDON MISSION', () => {
          if (confirm('Abandon the mission? Anything you found here is lost.')) app.abandonMatch();
        }, 'btn ghost'),
      ),
    ),
  ));
}
