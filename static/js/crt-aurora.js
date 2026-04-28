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

  // Cursor rings and click ripples are handled globally by cursor-fx.js.

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

    ctx.globalCompositeOperation = 'screen';
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
        grad.addColorStop(x, 'hsla(' + hue + ',65%,55%,' + (v * 0.07) + ')');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, centreY - bandH / 2, W, bandH);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── Scanlines ─────────────────────────────────────────────────────────────

  function drawScanlines() {
    // multiply darkens only the stripe rows, preserving the colour underneath
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    for (var y = 0; y < H; y += 3) {
      ctx.fillRect(0, y, W, 1);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Slow vertical roll — a faint lighter band drifting downward
    var rollY = ((t * 38) % (H + 100)) - 50;
    var rollGrad = ctx.createLinearGradient(0, rollY, 0, rollY + 100);
    rollGrad.addColorStop(0,   'rgba(255,255,255,0)');
    rollGrad.addColorStop(0.5, 'rgba(255,255,255,0.015)');
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

    // Base background — matches $dark-background in _variables.scss
    ctx.fillStyle = '#15202b';
    ctx.fillRect(0, 0, W, H);

    drawAurora();
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