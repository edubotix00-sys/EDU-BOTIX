(() => {
  'use strict';
  const intro = document.querySelector('.spark-intro');
  if (!intro) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // Native anchors still work without JavaScript. Move keyboard focus with them.
  intro.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      history.replaceState(null, '', link.hash);
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: reduced.matches ? 'instant' : 'smooth' });
    });
  });
  const panel = intro.querySelector('.spark-panel');
  const copy = intro.querySelector('.spark-copy');
  function fitStory() {
    const style = getComputedStyle(panel);
    const available = panel.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    copy.style.setProperty('--spark-copy-scale', Math.min(1, Math.max(1, available) / Math.max(1, copy.offsetHeight)));
    requestStoryUpdate();
  }
  if ('ResizeObserver' in window) {
    const layoutObserver = new ResizeObserver(fitStory);
    layoutObserver.observe(panel);
    layoutObserver.observe(copy);
  }
  window.addEventListener('resize', fitStory, { passive: true });
  if (document.fonts) document.fonts.ready.then(fitStory);
  const lines = [...intro.querySelectorAll('.spark-line')];
  let scrollTicking = false;
  function updateStory() {
    scrollTicking = false;
    const rect = intro.getBoundingClientRect();
    const distance = Math.max(1, intro.offsetHeight - innerHeight);
    const progress = Math.max(0, Math.min(1, -rect.top / distance));
    // All copy is visible by 72%; the remaining scroll holds the full message.
    lines.forEach((line, index) => {
      const threshold = .04 + index * (.68 / Math.max(1, lines.length - 1));
      line.classList.toggle('is-visible', progress >= threshold);
    });
    intro.classList.toggle('is-complete', progress >= .72);
  }
  function requestStoryUpdate() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(updateStory);
  }
  window.addEventListener('scroll', requestStoryUpdate, { passive: true });

  const canvas = document.getElementById('spark-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return; // Story and navigation remain usable without canvas support.
  const stage = canvas.parentElement;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 48;
  const glow = sprite.getContext('2d');
  const gradient = glow.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.12, '#d6e9ff');
  gradient.addColorStop(0.3, '#4a90e288');
  gradient.addColorStop(1, '#4a90e200');
  glow.fillStyle = gradient;
  glow.fillRect(0, 0, 48, 48);

  const cellSize = 80;
  const pointer = { x: 0, y: 0 };
  let width = 1, height = 1, particles = [], grid = [];
  let columns = 1, rows = 1, visible = false, raf = 0, last = 0;

  function resize() {
    const nextWidth = Math.round(stage.clientWidth);
    const nextHeight = Math.round(stage.clientHeight);
    if (nextWidth === width && nextHeight === height) return;
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    // Cap the backing resolution even on high-density phones.
    const dpr = Math.min(devicePixelRatio || 1, width < 768 ? 1 : 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pointer.x = width / 2;
    pointer.y = height / 2;
    columns = Math.ceil(width / cellSize);
    rows = Math.ceil(height / cellSize);
    grid = Array.from({ length: columns * rows }, () => []);
    const count = Math.min(width < 768 ? 64 : 120, Math.max(32, Math.round(width * height / 10000)));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
      radius: Math.random() * 2 + 1, light: 0, cellX: 0, cellY: 0
    }));
    draw(0);
  }

  function draw(dt) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    grid.forEach(cell => { cell.length = 0; });
    particles.forEach((p, i) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0 || p.x >= width) { p.vx *= -1; p.x = Math.max(0, Math.min(width - .01, p.x)); }
      if (p.y < 0 || p.y >= height) { p.vy *= -1; p.y = Math.max(0, Math.min(height - .01, p.y)); }
      const dx = pointer.x - p.x, dy = pointer.y - p.y;
      const squared = dx * dx + dy * dy;
      p.light = squared < 40000 ? 1 - Math.sqrt(squared) / 200 : .055;
      p.cellX = Math.floor(p.x / cellSize);
      p.cellY = Math.floor(p.y / cellSize);
      grid[p.cellY * columns + p.cellX].push(i);
    });
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#82beff';
    ctx.lineWidth = 1;
    particles.forEach((p, i) => {
      // A uniform grid replaces the original all-pairs distance loop.
      for (let y = Math.max(0, p.cellY - 1); y <= Math.min(rows - 1, p.cellY + 1); y++) {
        for (let x = Math.max(0, p.cellX - 1); x <= Math.min(columns - 1, p.cellX + 1); x++) {
          for (const j of grid[y * columns + x]) {
            if (j <= i) continue;
            const q = particles[j];
            const brightness = Math.max(p.light, q.light);
            if (brightness <= .025) continue;
            const dx = p.x - q.x, dy = p.y - q.y;
            const squared = dx * dx + dy * dy;
            if (squared >= 6400) continue;
            const alpha = (1 - Math.sqrt(squared) / 80) * brightness * .8;
            if (alpha <= .02) continue;
            ctx.globalAlpha = alpha;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
    });
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.light * .84 + .27);
      const size = (p.radius + p.light * 3) * 6;
      ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function tick(now) {
    raf = 0;
    if (!visible || document.hidden || reduced.matches) return;
    const elapsed = now - last;
    if (elapsed >= 1000 / 30) {
      draw(last ? Math.min(elapsed / 1000, .05) : 0);
      last = now - elapsed % (1000 / 30);
    }
    raf = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(raf);
    raf = 0; last = 0;
    if (visible && !document.hidden && !reduced.matches) raf = requestAnimationFrame(tick);
    else if (visible && !document.hidden) draw(0);
  }
  intro.addEventListener('pointermove', event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  window.addEventListener('pagehide', () => { visible = false; sync(); });
  function checkVisibility() {
    const rect = stage.getBoundingClientRect();
    visible = rect.bottom > 0 && rect.top < innerHeight;
    sync();
  }
  window.addEventListener('pageshow', checkVisibility);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(stage);
  } else {
    window.addEventListener('scroll', checkVisibility, { passive: true });
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize, { passive: true });
  resize();
  checkVisibility();
  fitStory();
  updateStory();
})();
