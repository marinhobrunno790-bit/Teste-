// nipplejs local shim — compatível com a API usada no game.js
const _managers = [];

function create(options) {
  const size = options.size || 100;
  const pos = options.position || { left: '80px', bottom: '80px' };
  const color = options.color || 'rgba(255,255,255,0.3)';

  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'position:fixed',
    `width:${size}px`,
    `height:${size}px`,
    'border-radius:50%',
    `background:${color}`,
    `left:${pos.left}`,
    `bottom:${pos.bottom}`,
    'touch-action:none',
    'z-index:9999',
    'border:2px solid rgba(255,255,255,0.35)',
    'box-sizing:border-box'
  ].join(';');

  const dot = document.createElement('div');
  const d = size * 0.4;
  dot.style.cssText = [
    'position:absolute',
    `width:${d}px`,
    `height:${d}px`,
    'border-radius:50%',
    'background:rgba(255,255,255,0.85)',
    `top:${(size - d) / 2}px`,
    `left:${(size - d) / 2}px`,
    'pointer-events:none',
    'transition:top .05s,left .05s'
  ].join(';');

  wrap.appendChild(dot);
  document.body.appendChild(wrap);

  const rect = () => wrap.getBoundingClientRect();
  const listeners = { move: [], end: [] };
  const half = size / 2;

  function emit(type, ...args) {
    listeners[type] && listeners[type].forEach(fn => fn(...args));
  }

  function onMove(cx, cy) {
    const r = rect();
    const ox = r.left + half, oy = r.top + half;
    const dx = cx - ox, dy = cy - oy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamp = Math.min(dist, half);
    const rad = Math.atan2(dy, dx);
    const nx = Math.cos(rad) * clamp, ny = Math.sin(rad) * clamp;
    dot.style.left = (half - d / 2 + nx) + 'px';
    dot.style.top  = (half - d / 2 + ny) + 'px';
    const direction = {};
    if (dy < -10) direction.y = 'up';
    else if (dy > 10) direction.y = 'down';
    if (dx > 10) direction.x = 'right';
    else if (dx < -10) direction.x = 'left';
    emit('move', null, { angle: { radian: rad }, distance: clamp, direction });
  }

  function onEnd() {
    dot.style.left = (half - d / 2) + 'px';
    dot.style.top  = (half - d / 2) + 'px';
    emit('end', null, {});
  }

  document.addEventListener('touchstart', e => {
    for (const t of e.touches) onMove(t.clientX, t.clientY);
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    for (const t of e.touches) onMove(t.clientX, t.clientY);
  }, { passive: true });
  document.addEventListener('touchend', onEnd);

  const manager = {
    on(ev, fn) { if (listeners[ev]) listeners[ev].push(fn); return this; }
  };
  _managers.push(manager);
  return manager;
}

export { create };
export default { create };
