(function () {
  var halo = document.createElement('div');
  halo.id = 'cursor-halo';
  document.body.appendChild(halo);

  var x = -9999, y = -9999;
  var cx = -9999, cy = -9999;
  var raf = null;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function tick() {
    raf = requestAnimationFrame(tick);
    cx = lerp(cx, x, 0.12);
    cy = lerp(cy, y, 0.12);
    halo.style.transform = 'translate(' + (cx - 150) + 'px,' + (cy - 150) + 'px)';
  }

  window.addEventListener('mousemove', function (e) {
    if (x === -9999) { cx = e.clientX; cy = e.clientY; }
    x = e.clientX;
    y = e.clientY;
    if (!raf) tick();
  });

  window.addEventListener('mouseleave', function () {
    x = -9999; y = -9999;
    halo.style.transform = 'translate(-9999px,-9999px)';
    cancelAnimationFrame(raf);
    raf = null;
  });
})();