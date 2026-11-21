// Each atlas tile contains only the illuminated core pixels of one original fiber.
// Its destination is an integer position in the same image used by the cover picture.
const between = (min, max) => min + Math.random() * (max - min);
const pick = items => items[Math.floor(Math.random() * items.length)];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

async function readScene(portrait, signal) {
  const base = '/assets/fiber-' + (portrait ? 'tall' : 'wide');
  const atlas = new Image();
  atlas.src = base + '.png';
  const [config] = await Promise.all([
    fetch(base + '.json', { signal, credentials: 'omit', mode: 'same-origin' }).then(response => {
      if (!response.ok) throw new Error('Fiber map unavailable');
      return response.json();
    }),
    atlas.decode(),
  ]);
  let first = 0;
  for (const track of config.tracks) {
    track.first = first;
    track.count = track.xy.length / 2;
    first += track.count;
  }
  return { ...config, atlas };
}

function fiberFlow(context, scene) {
  const { width, height, atlas, tracks, tile, columns, step } = scene;
  const groups = new Map();
  for (const track of tracks) {
    if (!groups.has(track.group)) groups.set(track.group, []);
    groups.get(track.group).push(track);
  }
  const branches = ['upper', 'middle', 'lower'];
  const feeds = tracks.filter(track => !branches.includes(track.group));
  const patterns = ['fan', 'relay', 'echo', 'scatter'];
  let pulses = [];
  let previousPattern;
  let next = between(250, 700);

  function launch(track, start, speed = between(.14, .48), tail = between(38, 115)) {
    if (pulses.length >= 24) return;
    pulses.push({ track, start, speed, tail, gain: between(.78, 1) });
  }

  function burst(now) {
    previousPattern = pick(patterns.filter(pattern => pattern !== previousPattern));
    if (previousPattern === 'fan') {
      const lanes = groups.get(pick(branches));
      const speed = between(.18, .40);
      const delay = between(65, 170);
      const reverse = Math.random() < .5;
      lanes.forEach((track, i) => launch(track, now + (reverse ? lanes.length - i - 1 : i) * delay, speed * between(.78, 1.22)));
    } else if (previousPattern === 'relay') {
      const feeder = pick(feeds);
      const speed = between(.26, .48);
      launch(feeder, now, speed);
      const arrival = now + feeder.count * step / speed;
      for (const group of branches) launch(pick(groups.get(group)), arrival + between(30, 230));
    } else if (previousPattern === 'echo') {
      const lane = pick(tracks);
      const speed = between(.2, .48);
      launch(lane, now, speed, between(60, 104));
      launch(lane, now + between(210, 385), speed * between(.78, .98), between(26, 52));
    } else {
      const lanes = [...tracks];
      for (let i = 0; i < 4; i++) {
        const [lane] = lanes.splice(Math.floor(Math.random() * lanes.length), 1);
        launch(lane, now + between(0, 520));
      }
    }
  }

  // Open in mid-flow, including after an orientation change.
  const initial = [...tracks];
  for (let i = 0; i < 9; i++) {
    const [track] = initial.splice(Math.floor(Math.random() * initial.length), 1);
    const speed = between(.14, .48);
    launch(track, -between(.08, .9) * track.count * step / speed, speed);
  }

  return function paint(now) {
    if (now >= next) {
      burst(now);
      next = now + between(660, 1380);
    }
    context.clearRect(0, 0, width, height);
    pulses = pulses.filter(({ track, speed, start, tail }) => (now - start) * speed < track.count * step + tail);
    for (const { track, start, speed, tail, gain } of pulses) {
      const head = (now - start) * speed;
      const from = Math.max(0, Math.floor((head - tail) / step));
      const to = Math.min(track.count - 1, Math.floor(head / step));
      for (let i = from; i <= to; i++) {
        const age = clamp((head - (i + .5) * step) / tail, 0, 1);
        // A short, soft leading edge and a longer trailing fade.
        context.globalAlpha = gain * Math.min(1, age / .13) * (1 - age) ** 1.35;
        const id = track.first + i;
        context.drawImage(atlas, id % columns * tile, Math.floor(id / columns) * tile,
          tile, tile, track.xy[i * 2], track.xy[i * 2 + 1], tile, tile);
      }
    }
    context.globalAlpha = 1;
  };
}

export function mountCover(main, signal, preference) {
  const scene = main.querySelector('.cover-scene');
  const strands = scene.querySelector('.fiber-light');
  const gestures = scene.querySelector('.gesture-light');
  const fiberContext = strands.getContext('2d');
  const ink = gestures.getContext('2d');
  if (!fiberContext || !ink) return;

  const portrait = matchMedia('(orientation: portrait)');
  const control = main.querySelector('.motion-control');
  const options = { signal };
  let fiber, frame = 0, time = 0, previous, lastFiber = -Infinity;
  let edition = 0;
  const playing = () => Boolean(fiber) && !signal.aborted && !preference.paused && !document.hidden;
  const pointer = pointerLight(scene, gestures, ink, signal, playing, () => time);

  function tick(stamp) {
    if (!playing()) return;
    if (previous !== undefined) time += Math.min(64, stamp - previous);
    previous = stamp;
    if (time - lastFiber >= 1000 / 30) {
      fiber(time);
      lastFiber = time;
    }
    pointer.paint(time);
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(frame);
    previous = undefined;
    if (!fiber) return;
    main.dataset.motion = preference.paused ? 'paused' : 'playing';
    const label = preference.paused ? '배경 움직임 재생' : '배경 움직임 일시정지';
    control.setAttribute('aria-label', label);
    control.title = label;
    control.hidden = false;
    if (playing()) frame = requestAnimationFrame(tick);
    else pointer.endGesture();
  }

  async function orient() {
    const current = ++edition;
    fiber = undefined;
    sync();
    control.hidden = true;
    fiberContext.clearRect(0, 0, strands.width, strands.height);
    pointer.reset();
    try {
      const data = await readScene(portrait.matches, signal);
      if (signal.aborted || current !== edition) return;
      const photo = scene.querySelector('img');
      function install() {
        if (signal.aborted || current !== edition) return;
        strands.width = data.width;
        strands.height = data.height;
        time = 0;
        lastFiber = 0;
        fiber = fiberFlow(fiberContext, data);
        fiber(0);
        sync();
      }
      if (photo.complete && photo.naturalWidth) install();
      else photo.addEventListener('load', install, { signal, once: true });
    } catch {
      // The responsive still remains the complete cover if an asset is unavailable.
    }
  }

  control.addEventListener('click', () => { preference.paused = !preference.paused; sync(); }, options);
  portrait.addEventListener('change', orient, options);
  document.addEventListener('visibilitychange', sync, options);
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    pointer.reset();
    fiberContext.clearRect(0, 0, strands.width, strands.height);
  }, { once: true });
  orient();
}

const ice = '#a1deff';
const white = '#e7faff';
const amber = '#ffd09a';
const violet = '#afaaff';
const spectrum = [ice, white, violet, amber];
const tau = Math.PI * 2;

function pointerLight(scene, canvas, ctx, signal, playing, now) {
  let width, height, density, gesture, stroke, previousStyle;
  let trails = [], flares = [], dirty = false;
  const options = { passive: true, signal };

  function fit() {
    width = scene.clientWidth;
    height = scene.clientHeight;
    density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(canvas.width / (width || 1), 0, 0, canvas.height / (height || 1), 0, 0);
    reset();
  }

  function endGesture() { gesture = undefined; stroke = undefined; }
  function reset() {
    endGesture();
    trails = [];
    flares = [];
    ctx.clearRect(0, 0, width || 0, height || 0);
    dirty = false;
  }
  const resize = new ResizeObserver(fit);
  resize.observe(scene);
  signal.addEventListener('abort', () => resize.disconnect(), { once: true });
  fit();

  function position(event) {
    const box = scene.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top, t: now() };
  }

  function addPoint(point, drag) {
    const last = stroke?.points.at(-1);
    if (!last || stroke.drag !== drag || point.t - last.t > 110) {
      stroke = { points: [point], drag, phase: between(0, tau), life: drag ? 480 : 245 };
      trails = [...trails.slice(-7), stroke];
      return;
    }
    const distance = Math.hypot(point.x - last.x, point.y - last.y);
    if (distance < 2) return;
    point.spread = clamp(distance / Math.max(8, point.t - last.t) * 6, 2, 16);
    stroke.points.push(point);
    if (stroke.points.length > 72) stroke.points.shift();
  }

  function flare(point, direction, released) {
    const styles = ['halo', 'prism', 'spiral'];
    const style = released ? 'prism' : pick(styles.filter(item => item !== previousStyle));
    if (!released) previousStyle = style;
    const tilt = direction ?? between(0, tau);
    const size = between(.83, 1.18) * (released ? .82 : 1);
    const rays = Array.from({ length: released ? 13 : 22 }, (_, i) => {
      const angle = style === 'prism' ? tilt + (i % 2 ? Math.PI : 0) + between(-.58, .58) : tilt + (i + between(-.32, .32)) / 22 * tau;
      return { angle, reach: between(29, 99) * size, bend: between(-.35, .35), color: pick(spectrum), weight: between(.65, 1.65) };
    });
    flares = [...flares.slice(-3), { ...point, tilt, rays, size, style, life: between(690, 950) }];
  }

  scene.addEventListener('pointerdown', event => {
    if (!playing() || !event.isPrimary || event.button !== 0) return;
    const point = position(event);
    gesture = { id: event.pointerId, start: point, prev: point, angle: undefined, drag: false };
    stroke = undefined;
    addPoint(point, true);
  }, options);
  scene.addEventListener('pointermove', event => {
    if (!playing() || !event.isPrimary) return;
    const point = position(event);
    if (gesture?.id === event.pointerId) {
      const dx = point.x - gesture.prev.x, dy = point.y - gesture.prev.y;
      if (dx || dy) gesture.angle = Math.atan2(dy, dx);
      if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > 7) gesture.drag = true;
      addPoint(point, true);
      gesture.prev = point;
    } else if (event.pointerType !== 'touch' && !event.buttons) {
      addPoint(point, false);
    }
  }, options);
  scene.addEventListener('pointerup', event => {
    if (!playing() || gesture?.id !== event.pointerId) return;
    flare(position(event), gesture.angle, gesture.drag);
    endGesture();
  }, options);
  scene.addEventListener('pointerleave', endGesture, options);
  scene.addEventListener('pointercancel', endGesture, options);
  window.addEventListener('blur', endGesture, options);

  function drawTrail(trail, t) {
    const points = trail.points;
    if (points.length < 2) return;
    const lanes = trail.drag ? [-1.3, -.56, 0, .56, 1.3] : [-.4, .4];
    lanes.forEach((lane, k) => {
      let last;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const prev = points[Math.max(i - 1, 0)], next = points[Math.min(i + 1, points.length - 1)];
        const dx = next.x - prev.x, dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const age = clamp((t - p.t) / trail.life, 0, 1);
        const offset = lane * (p.spread || 3) * (.26 + 1.4 * age) * Math.sin(trail.phase + age * 3.2 + .7);
        const x = p.x - dy / len * offset, y = p.y + dx / len * offset;
        if (last) {
          ctx.globalAlpha = (1 - age) ** 1.65 * (trail.drag ? .95 : .46);
          if (trail.drag && k === 2) {
            ctx.globalAlpha *= .26;
            ctx.strokeStyle = ice;
            ctx.lineWidth = 5 * (1 - age * .65);
            ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(x, y); ctx.stroke();
            ctx.globalAlpha = (1 - age) ** 1.65;
          }
          ctx.strokeStyle = k === 2 ? white : k === 0 ? amber : k % 2 ? ice : violet;
          ctx.lineWidth = (k === 2 ? 1.65 : .95) * (1 - age * .55);
          ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(x, y); ctx.stroke();
        }
        last = { x, y };
      }
    });
  }

  function drawFlare(f, t) {
    const age = (t - f.t) / f.life;
    const fade = (1 - age) ** 1.5;
    const travel = 1 - (1 - age) ** 2.4;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.tilt);
    const bloomRadius = (12 + travel * 34) * f.size;
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, bloomRadius);
    bloom.addColorStop(0, 'rgba(237,251,255,.92)');
    bloom.addColorStop(.13, f.style === 'prism' ? 'rgba(255,190,111,.62)' : 'rgba(136,209,255,.67)');
    bloom.addColorStop(.42, 'rgba(125,148,255,.24)');
    bloom.addColorStop(1, 'rgba(110,163,255,0)');
    ctx.globalAlpha = (1 - age) ** 2.2;
    ctx.fillStyle = bloom;
    ctx.fillRect(-bloomRadius, -bloomRadius, bloomRadius * 2, bloomRadius * 2);
    const radius = (5 + travel * (f.style === 'halo' ? 77 : 53)) * f.size;
    for (let i = 0; i < 3; i++) {
      const start = age * (f.style === 'spiral' ? 2.8 : .55) + i * 2.1;
      ctx.globalAlpha = fade * (.87 - i * .14);
      ctx.strokeStyle = [white, ice, amber][i];
      ctx.lineWidth = i === 0 ? 1.45 : .85;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (1 - i * .12), radius * (f.style === 'prism' ? .24 : .80), i * .38, start, start + (f.style === 'halo' ? 3.1 : 2.25));
      ctx.stroke();
    }
    ctx.restore();
    for (const [index, ray] of f.rays.entries()) {
      const bend = f.style === 'spiral' ? .95 : ray.bend;
      const angle = ray.angle + bend * travel;
      const tail = Math.max(0, travel - .17 * (1 - age));
      ctx.globalAlpha = fade * .92;
      ctx.strokeStyle = ray.color;
      ctx.lineWidth = ray.weight;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(ray.angle + bend * tail) * ray.reach * tail, f.y + Math.sin(ray.angle + bend * tail) * ray.reach * tail);
      const x = f.x + Math.cos(angle) * ray.reach * travel, y = f.y + Math.sin(angle) * ray.reach * travel;
      ctx.lineTo(x, y);
      ctx.stroke();
      if (index % 5 === 0) {
        const size = (1.5 + fade * 2) * f.size;
        ctx.fillStyle = ray.color;
        ctx.beginPath();
        ctx.moveTo(x, y - size); ctx.lineTo(x + size * .45, y);
        ctx.lineTo(x, y + size); ctx.lineTo(x - size * .45, y);
        ctx.fill();
      }
    }
  }

  function paint(t) {
    trails = trails.filter(line => line.points.at(-1).t + line.life > t);
    flares = flares.filter(f => f.t + f.life > t);
    if (!dirty && !trails.length && !flares.length) return;
    ctx.clearRect(0, 0, width, height);
    dirty = Boolean(trails.length || flares.length);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const line of trails) {
      while (line.points.length > 1 && t - line.points[0].t >= line.life) line.points.shift();
      drawTrail(line, t);
    }
    for (const f of flares) drawFlare(f, t);
    ctx.globalAlpha = 1;
  }
  return { reset, paint, endGesture };
}
