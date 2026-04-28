/**
 * particles.js  —  static/js/particles.js
 *
 * Magnetic particle field layered above the CRT aurora canvas.
 * Particles drift organically and scatter away from the cursor,
 * snapping back when the cursor moves on. Teal/cyan colour tint
 * on proximity. Loaded with `defer` only on the home page.
 */
(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────────────────────────

  var canvas = document.createElement('canvas');
  canvas.id = 'particle-field';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  var W, H;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    // Recalculate home positions on resize so particles don't cluster at old coords.
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.hx = Math.random() * W;
      p.hy = Math.random() * H;
    }
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  // ── Mouse tracking ────────────────────────────────────────────────────────

  var mx = -9999, my = -9999;

  window.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  });

  window.addEventListener('mouseleave', function () {
    mx = -9999;
    my = -9999;
  });

  // ── Particle definitions ──────────────────────────────────────────────────

  var COUNT        = 160;
  var REPEL_RADIUS = 110;
  var MAX_DISPLACE = 60;
  var LERP_RETURN  = 0.1;   // how fast particles snap back
  var LERP_FLEE    = 0.18;  // how fast they flee

  var particles = [];

  function initParticles() {
    particles = [];
    for (var i = 0; i < COUNT; i++) {
      var hx = Math.random() * W;
      var hy = Math.random() * H;
      particles.push({
        hx:    hx,            // home x
        hy:    hy,            // home y
        x:     hx,            // current x
        y:     hy,            // current y
        r:     0.6 + Math.random() * 1.4,      // radius 0.6–2.0
        phase: Math.random() * Math.PI * 2,    // drift phase offset
        freq:  0.18 + Math.random() * 0.24,    // drift frequency
        ampX:  8  + Math.random() * 14,        // drift amplitude x
        ampY:  6  + Math.random() * 10,        // drift amplitude y
      });
    }
  }

  // ── Draw loop ─────────────────────────────────────────────────────────────

  var t = 0;
  var lastTime = null;
  var raf = null;

  function lerp(a, b, k) { return a + (b - a) * k; }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!lastTime) lastTime = now;
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    t += dt;

    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      // Organic drift around home position
      var driftX = p.hx + Math.sin(t * p.freq       + p.phase)       * p.ampX;
      var driftY = p.hy + Math.cos(t * p.freq * 0.8 + p.phase * 1.3) * p.ampY;

      // Cursor repulsion
      var targetX = driftX;
      var targetY = driftY;
      var proximity = 0; // 0 = far, 1 = right at cursor

      if (mx > -9000) {
        var dx   = p.x - mx;
        var dy   = p.y - my;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < REPEL_RADIUS && dist > 0) {
          proximity = 1 - dist / REPEL_RADIUS;
          var push  = proximity * MAX_DISPLACE;
          targetX   = driftX + (dx / dist) * push;
          targetY   = driftY + (dy / dist) * push;
        }
      }

      // Lerp toward target — flee faster than return
      var k  = proximity > 0 ? LERP_FLEE : LERP_RETURN;
      p.x = lerp(p.x, targetX, k);
      p.y = lerp(p.y, targetY, k);

      // Colour: base dark blue-gray → teal/cyan near cursor
      var alpha = lerp(0.45, 0.9,  proximity);
      var hue   = lerp(210,  195,  proximity);
      var sat   = lerp(35,   70,   proximity);
      var lum   = lerp(28,   72,   proximity);
      var r     = p.r * lerp(1, 1.6, proximity); // slightly bigger near cursor

      // Radial gradient: gold pinpoint core fading out to the teal/blue body.
      // Gold intensity grows with proximity so it pulses when the cursor is near.
      var goldAlpha = lerp(0.7, 1.0, proximity);
      var outerAlpha = alpha;
      var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0,    'hsla(48,100%,78%,' + goldAlpha  + ')');
      grad.addColorStop(0.35, 'hsla(' + hue + ',' + sat + '%,' + lum + '%,' + outerAlpha + ')');
      grad.addColorStop(1,    'hsla(' + hue + ',' + sat + '%,' + lum + '%, 0)');

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ── Visibility — pause when tab is hidden ─────────────────────────────────

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = null;
      lastTime = null;
    } else {
      lastTime = null;
      requestAnimationFrame(loop);
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────

  // W/H must be set before initParticles so home positions are valid.
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  initParticles();
  requestAnimationFrame(loop);

})();
