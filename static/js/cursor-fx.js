(function () {
  // ── Halo div (CSS radial gradient, mix-blend-mode: screen) ────────────────
  var halo = document.createElement('div');
  halo.id = 'cursor-halo';
  document.body.appendChild(halo);

  // ── Overlay canvas (rings + click ripples) ────────────────────────────────
  var canvas = document.createElement('canvas');
  canvas.id = 'cursor-fx';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  var W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Mouse tracking ────────────────────────────────────────────────────────
  var mx = -9999, my = -9999;
  var hx = -9999, hy = -9999; // lerped halo position

  function lerp(a, b, t) { return a + (b - a) * t; }

  window.addEventListener('mousemove', function (e) {
    if (mx === -9999) { hx = e.clientX; hy = e.clientY; }
    mx = e.clientX;
    my = e.clientY;
  });

  window.addEventListener('mouseleave', function () {
    mx = -9999; my = -9999;
    halo.style.transform = 'translate(-9999px,-9999px)';
  });

  // ── Click ripples ─────────────────────────────────────────────────────────
  var ripples = [];
  var MAX_RIPPLES = 8;

  window.addEventListener('click', function (e) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x: e.clientX, y: e.clientY, born: t });
  });

  // ── Time ──────────────────────────────────────────────────────────────────
  var t = 0;
  var lastTime = null;
  var raf = null;

  // ── Draw ──────────────────────────────────────────────────────────────────
  var RING_PERIOD = 1.8;
  var RING_COUNT  = 3;
  var RIPPLE_LIFE = 1.4;

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (!lastTime) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    // Lerp halo div
    if (mx !== -9999) {
      hx = lerp(hx, mx, 0.12);
      hy = lerp(hy, my, 0.12);
      halo.style.transform = 'translate(' + (hx - 150) + 'px,' + (hy - 150) + 'px)';
    }

    ctx.clearRect(0, 0, W, H);

    // Cursor rings — gold near centre, teal as they expand
    if (mx > 0) {
      for (var i = 0; i < RING_COUNT; i++) {
        var phase  = ((t / RING_PERIOD) + i / RING_COUNT) % 1;
        var radius = phase * 75;
        var alpha  = (1 - phase) * 0.18;
        // phase 0 = just born (small, gold); phase 1 = dying (large, teal)
        var hue    = 48 + phase * (185 - 48);   // 48 gold → 185 teal
        var sat    = 100 + phase * (80 - 100);  // 100% → 80%
        var lum    = 78  + phase * (70 - 78);   // 78% → 70%
        ctx.beginPath();
        ctx.arc(mx, my, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'hsla(' + hue + ',' + sat + '%,' + lum + '%,' + alpha + ')';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Click ripples
    for (var j = ripples.length - 1; j >= 0; j--) {
      var ripple   = ripples[j];
      var progress = (t - ripple.born) / RIPPLE_LIFE;
      if (progress >= 1) { ripples.splice(j, 1); continue; }
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, progress * 90, 0, Math.PI * 2);
      ctx.strokeStyle = 'hsla(185,75%,65%,' + ((1 - progress) * 0.4) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  requestAnimationFrame(draw);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = null;
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(draw);
    }
  });
})();
