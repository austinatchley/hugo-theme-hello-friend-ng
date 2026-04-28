/**
 * crt-aurora.js  —  static/js/crt-aurora.js
 *
 * CRT scanline + aurora background with cursor halo and ripple.
 * Loaded with `defer` only on the home page via layouts/partials/extra-head.html.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('crt-aurora');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H;
  let t = 0;
  let raf;
  let lastTime = null;

  // ── Cursor ────────────────────────────────────────────────────────────────

  const mouse = { x: -9999, y: -9999 };

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  window.addEventListener('mouseleave', function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // ── Click ripples ─────────────────────────────────────────────────────────

  var rings = [];
  var MAX_RINGS = 8;

  window.addEventListener('click', function (e) {
    if (rings.length >= MAX_RINGS) rings.shift();
    rings.push({ x: e.clientX, y: e.clientY, born: t });
  });

  function drawRings() {
    var LIFE = 1.4;
    for (var i = rings.length - 1; i >= 0; i--) {
      var ring = rings[i];
      var progress = (t - ring.born) / LIFE;
      if (progress >= 1) { rings.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, progress * 90, 0, Math.PI * 2);
      ctx.strokeStyle = 'hsla(185,75%,65%,' + ((1 - progress) * 0.4) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ── Aurora bands ──────────────────────────────────────────────────────────

  // Three independently drifting bands. yFrac is where the band centres
  // as a fraction of viewport height; amplitude is how much it wanders.
  var BANDS = [
    { hue: 188, speed: 0.26, yFrac: 0.15, amp: 0.07 },
    { hue: 210, speed: 0.18, yFrac: 0.48, amp: 0.06 },
    { hue: 168, speed: 0.22, yFrac: 0.78, amp: 0.08 },
  ];

  function drawAurora() {
    var segments = 14;

    for (var b = 0; b < BANDS.length; b++) {
      var band = BANDS[b];
      var centreY = H * (band.yFrac + Math.sin(t * band.speed * 0.7 + b * 2.3) * band.amp);
      var bandH   = H * 0.24;

      var grad = ctx.createLinearGradient(0, 0, W, 0);
      for (var s = 0; s <= segments; s++) {
        var x     = s / segments;
        var phase = x * Math.PI * 2.8 + t * band.speed;
        var v     = Math.sin(phase) * 0.5 + 0.5;
        var hue   = band.hue + Math.sin(phase * 0.6) * 18;
        grad.addColorStop(x, 'hsla(' + hue + ',65%,45%,' + (v * 0.10) + ')');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, centreY - bandH / 2, W, bandH);
    }
  }

  // ── Cursor halo ───────────────────────────────────────────────────────────

  var RING_PERIOD = 1.8;
  var RING_COUNT  = 3;

  function drawCursorHalo() {
    if (mouse.x < 0) return;

    // Soft glow
    var grd = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 100);
    grd.addColorStop(0, 'hsla(185,80%,60%,0.09)');
    grd.addColorStop(1, 'hsla(185,80%,60%,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(mouse.x, mouse.y, 100, 0, Math.PI * 2);
    ctx.fill();

    // Concentric rings emanating outward
    for (var i = 0; i < RING_COUNT; i++) {
      var phase  = ((t / RING_PERIOD) + i / RING_COUNT) % 1;
      var radius = phase * 75;
      var alpha  = (1 - phase) * 0.22;
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = 'hsla(185,80%,70%,' + alpha + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── Scanlines ─────────────────────────────────────────────────────────────

  function drawScanlines() {
    // Static dark stripes every 3px
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (var y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }

    // Slow vertical roll — a faint lighter band drifting downward
    var rollY = ((t * 38) % (H + 100)) - 50;
    var rollGrad = ctx.createLinearGradient(0, rollY, 0, rollY + 100);
    rollGrad.addColorStop(0,   'rgba(255,255,255,0)');
    rollGrad.addColorStop(0.5, 'rgba(255,255,255,0.022)');
    rollGrad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = rollGrad;
    ctx.fillRect(0, rollY, W, 100);
  }

  // ── Horizontal glitch ─────────────────────────────────────────────────────

  var glitchCooldown = 4;

  function maybeGlitch(dt) {
    glitchCooldown -= dt;
    if (glitchCooldown > 0) return;
    glitchCooldown = 3.5 + Math.random() * 5;

    var lineY = Math.floor(Math.random() * H);
    var lineH = Math.floor(Math.random() * 2) + 1;
    var shift = (Math.random() - 0.5) * 16;

    try {
      var slice = ctx.getImageData(0, lineY, W, lineH);
      ctx.putImageData(slice, shift, lineY);
    } catch (e) { /* ignore cross-origin errors */ }
  }

  // ── Resize ────────────────────────────────────────────────────────────────

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Main loop ─────────────────────────────────────────────────────────────

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    ctx.clearRect(0, 0, W, H);

    // Base background — matches the theme's dark body colour
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    drawAurora();
    drawCursorHalo();
    drawRings();
    drawScanlines();
    maybeGlitch(dt);
  }

  // ── Visibility — pause when tab is hidden ─────────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(loop);
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────

  resize();
  requestAnimationFrame(loop);

})();