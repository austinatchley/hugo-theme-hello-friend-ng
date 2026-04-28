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
  // Shared hue spectrum all bands sample from. Values are hue degrees; the
  // sampler interpolates between stops so transitions are smooth.
  var SPECTRUM = [168, 188, 210, 240, 315, 38, 42, 168];

  function sampleSpectrum(pos) {
    // pos is 0–1, wraps. Returns interpolated hue.
    var scaled = ((pos % 1) + 1) % 1;  // ensure 0–1
    var n      = SPECTRUM.length - 1;
    var idx    = scaled * n;
    var lo     = Math.floor(idx);
    var frac   = idx - lo;
    return SPECTRUM[lo] + (SPECTRUM[lo + 1] - SPECTRUM[lo]) * frac;
  }

  var BANDS = [
    { speed: 0.26, xSpeed: 1.1, yFrac: 0.10, amp: 0.06, offset: Math.random() },
    { speed: 0.18, xSpeed: 0.8, yFrac: 0.37, amp: 0.05, offset: Math.random() },
    { speed: 0.22, xSpeed: 1.3, yFrac: 0.63, amp: 0.07, offset: Math.random() },
    { speed: 0.21, xSpeed: 0.9, yFrac: 0.88, amp: 0.06, offset: Math.random() },
  ];

  function drawAurora() {
    var segments = 14;

    ctx.globalCompositeOperation = 'screen';
    for (var b = 0; b < BANDS.length; b++) {
      var band = BANDS[b];
      var centreY = H * (band.yFrac + Math.sin(t * band.speed * 0.7 + b * 2.3) * band.amp);
      var bandH   = H * 0.36;

      var top = centreY - bandH / 2;

      // Horizontal colour gradient — one strip per segment column.
      for (var s = 0; s < segments; s++) {
        var x0     = (s / segments) * W;
        var x1     = ((s + 1) / segments) * W;
        var xMid   = (s + 0.5) / segments;
        var phase  = xMid * Math.PI * 2.8 + t * band.xSpeed;
        var v      = Math.sin(phase) * 0.5 + 0.5;
        var specPos  = (phase * 0.18 / (Math.PI * 2) + band.offset) % 1;
        var finalHue = sampleSpectrum(specPos);
        var finalSat = 65 + v * 25;
        var peakAlpha = v * 0.13;

        // Vertical fade: transparent → full at centre → transparent.
        var vGrad = ctx.createLinearGradient(0, top, 0, top + bandH);
        vGrad.addColorStop(0,    'hsla(' + finalHue + ',' + finalSat + '%,60%,0)');
        vGrad.addColorStop(0.35, 'hsla(' + finalHue + ',' + finalSat + '%,60%,' + peakAlpha + ')');
        vGrad.addColorStop(0.65, 'hsla(' + finalHue + ',' + finalSat + '%,60%,' + peakAlpha + ')');
        vGrad.addColorStop(1,    'hsla(' + finalHue + ',' + finalSat + '%,60%,0)');

        ctx.fillStyle = vGrad;
        ctx.fillRect(x0, top, x1 - x0, bandH);
      }
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