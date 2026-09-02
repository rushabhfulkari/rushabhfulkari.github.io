/* Scroll-driven motion, hand-rolled.
   One rAF loop reads the scroll position once per frame and writes transforms
   from it. Everything animated is declared in the markup with data-attributes,
   so adding motion to an element never means touching this file.

     data-fx="rise|slide|rotate|scale|counter|pin-x"
     data-from / data-to   numeric range, mapped across the element's pass
     data-start / data-end viewport fractions the pass runs between

   No library. A portfolio that needs 90 KB of animation framework to move a
   heading is making a claim it then has to live up to. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = [];
  var ticking = false;

  function num(el, name, fallback) {
    var v = parseFloat(el.getAttribute(name));
    return isNaN(v) ? fallback : v;
  }

  function collect() {
    items = [].slice.call(document.querySelectorAll('[data-fx]')).map(function (el) {
      return {
        el: el,
        fx: el.getAttribute('data-fx').split(' '),
        from: num(el, 'data-from', 0),
        to: num(el, 'data-to', 1),
        // `rise` keeps its own distance. It is almost always combined with
        // slide or scale, and those want `data-to` for something else — one
        // shared number would make a 70px sideways slide into a 70px drop.
        riseY: num(el, 'data-rise', 40),
        start: num(el, 'data-start', 1),      // enters when its top hits 100% vh
        end: num(el, 'data-end', 0.2),        // done when its top hits 20% vh
        done: false
      };
    });

    // Hide the risers here rather than in the stylesheet. If this script
    // never runs — blocked, errored, an old browser — the page stays fully
    // visible instead of being a blank sheet of cream.
    items.forEach(function (it) {
      if (it.fx.indexOf('rise') > -1) it.el.style.opacity = '0';
      if (it.fx.indexOf('pin-x') > -1 && it.el.hasAttribute('data-pin-auto')) {
        // Travel is content width minus viewport, measured rather than
        // guessed, so the rail always ends flush with its last card.
        it.to = Math.max(0, it.el.scrollWidth - window.innerWidth +
                            parseFloat(getComputedStyle(it.el).paddingLeft || 0));
      }
    });
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function frame() {
    ticking = false;
    var vh = window.innerHeight;

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = it.el.getBoundingClientRect();
      // Progress of this element through its own pass, 0 → 1.
      var p = clamp01((it.start - r.top / vh) / (it.start - it.end));
      apply(it, p, r, vh);
    }
  }

  function apply(it, p, r, vh) {
    var el = it.el, e = easeOut(p), t = [];

    for (var i = 0; i < it.fx.length; i++) {
      switch (it.fx[i]) {
        case 'rise':
          el.style.opacity = String(p);
          t.push('translate3d(0,' + ((1 - e) * it.riseY) + 'px,0)');
          break;
        case 'slide':
          t.push('translate3d(' + ((1 - e) * it.to) + 'px,0,0)');
          break;
        case 'drift':
          // Parallax: keeps moving the whole time the element is on screen,
          // rather than settling. Uses raw viewport position, not the pass.
          t.push('translate3d(0,' + ((r.top - vh / 2) / vh * it.to) + 'px,0)');
          break;
        case 'rotate':
          t.push('rotate(' + (it.from + (it.to - it.from) * e) + 'deg)');
          break;
        case 'scale':
          t.push('scale(' + (it.from + (it.to - it.from) * e) + ')');
          break;
        case 'pin-x':
          // Horizontal travel driven by vertical scroll — the rail slides
          // sideways while its sticky parent is held in place.
          t.push('translate3d(' + (-p * it.to) + 'px,0,0)');
          break;
        case 'counter':
          if (!it.done) {
            var target = it.to;
            var now = Math.round(target * e);
            el.textContent = (el.getAttribute('data-prefix') || '') + now +
                             (el.getAttribute('data-suffix') || '');
            if (p >= 1) it.done = true;
          }
          break;
      }
    }
    if (t.length) el.style.transform = t.join(' ');
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  function settle() {
    // Reduce-motion, or no JS support: land everything on its end state. The
    // content still has to be there; it just does not travel.
    items.forEach(function (it) {
      it.el.style.opacity = '1';
      it.el.style.transform = 'none';
      if (it.fx.indexOf('counter') > -1) {
        it.el.textContent = (it.el.getAttribute('data-prefix') || '') + it.to +
                            (it.el.getAttribute('data-suffix') || '');
      }
    });
  }

  collect();
  if (reduced) {
    settle();
  } else {
    frame();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    // Safety net: a document that is hidden never fires scroll, and content
    // parked at opacity 0 would be a blank page. Show everything regardless.
    setTimeout(function () {
      if (document.visibilityState !== 'visible') settle();
    }, 2500);
  }

  /* --- the spider follows the pointer -------------------------------- */
  /* Eased rather than pinned to the cursor: a spider that tracks exactly is a
     cursor decoration, and one that lags and overshoots is an animal on a
     thread. The tilt comes from horizontal velocity, so it swings into the
     direction of travel and settles. */
  var spider = document.querySelector('.spider');
  if (spider && !reduced) {
    var thread = spider.querySelector('.spider__thread');
    var restLen = 150;
    var targetX = window.innerWidth * 0.72, targetLen = restLen;
    var x = targetX, len = restLen, lastX = x, tilt = 0;
    var idle = true;

    window.addEventListener('pointermove', function (e) {
      idle = false;
      targetX = e.clientX;
      // Drop toward the pointer, but never past a comfortable reach, and
      // never above the thread's resting length.
      targetLen = Math.max(restLen, Math.min(e.clientY - 26, window.innerHeight * 0.75));
    }, { passive: true });

    (function loop(t) {
      if (idle) {
        // Nothing has moved yet — drift gently so it reads as alive.
        targetX = window.innerWidth * 0.72 +
                  Math.sin(t / 1400) * Math.min(70, window.innerWidth * 0.05);
      }
      x   += (targetX - x) * 0.055;      // slow follow: the lag is the charm
      len += (targetLen - len) * 0.075;

      var vx = x - lastX;
      lastX = x;
      // Swing into the direction of travel, capped so it never spins.
      tilt += ((-vx * 1.6) - tilt) * 0.1;
      tilt = Math.max(-26, Math.min(26, tilt));

      thread.style.height = len.toFixed(1) + 'px';
      spider.style.transformOrigin = 'top center';
      spider.style.transform =
        'translate3d(' + (x - 43) + 'px,0,0) rotate(' + tilt.toFixed(2) + 'deg)';
      requestAnimationFrame(loop);
    })(0);
  } else if (spider) {
    spider.style.transform = 'translate3d(' + (window.innerWidth * 0.72 - 43) + 'px,0,0)';
  }

  /* --- marquees ------------------------------------------------------ */
  [].forEach.call(document.querySelectorAll('.marquee__track'), function (track) {
    track.innerHTML = track.innerHTML + track.innerHTML;
  });

  /* --- rail: drag to scroll ------------------------------------------ */
  var rail = document.querySelector('.rail');
  if (rail) {
    var down = false, startX = 0, startLeft = 0;
    rail.addEventListener('pointerdown', function (e) {
      down = true; startX = e.clientX; startLeft = rail.scrollLeft;
      rail.setPointerCapture(e.pointerId); rail.style.cursor = 'grabbing';
    });
    rail.addEventListener('pointermove', function (e) {
      if (down) rail.scrollLeft = startLeft - (e.clientX - startX);
    });
    ['pointerup', 'pointercancel'].forEach(function (ev) {
      rail.addEventListener(ev, function () { down = false; rail.style.cursor = ''; });
    });
  }

  /* --- assistant ----------------------------------------------------- */
  var btn = document.querySelector('.assistant__btn');
  var bubble = document.querySelector('.assistant__bubble');
  if (btn && bubble) {
    var lines = [
      'Ten features, 300 tests, zero analyzer issues. Ask me which one broke first.',
      'The offline queue lost data to <code>INSERT OR REPLACE</code>. Dispatch M-02 has the receipt.',
      'Every reconnect used to double the packets. That is a subscription, not a radio.',
      'A cold Flutter engine costs 780&nbsp;ms. A warmed one costs 40. Dispatch M-04.',
      'Six of my own colours failed WCAG contrast. I only knew because I computed it.',
      'Currently shipping to 60M people across 34 app flavours.',
      'Yes, the whole page is hand-written. No framework, no build step.'
    ];
    var n = 0;
    btn.addEventListener('click', function () {
      n = (n + 1) % lines.length;
      bubble.innerHTML = lines[n];
      bubble.style.animation = 'none';
      void bubble.offsetWidth;
      bubble.style.animation = '';
    });
  }

  /* --- loader --------------------------------------------------------- */
  var loader = document.querySelector('.loader');
  if (loader) {
    var fill = loader.querySelector('.loader__fill');
    var pct = loader.querySelector('.loader__pct');
    var shown = 0;
    var started = Date.now();

    // Real progress where the browser gives it to us — images decoded — and a
    // floor so the bar always moves. A loader that sits at 0% then jumps to
    // 100% reads as broken rather than fast.
    var imgs = [].slice.call(document.images);
    var loaded = 0;
    imgs.forEach(function (im) {
      if (im.complete) { loaded++; return; }
      im.addEventListener('load', function () { loaded++; }, { once: true });
      im.addEventListener('error', function () { loaded++; }, { once: true });
    });

    (function tick() {
      var byImage = imgs.length ? loaded / imgs.length : 1;
      var byTime = Math.min(1, (Date.now() - started) / 1100);
      var target = Math.round(Math.min(byImage, byTime) * 100);
      shown += (target - shown) * 0.25;
      var v = Math.round(shown);
      if (fill) fill.style.width = v + '%';
      if (pct) pct.textContent = v + '%';
      if (v >= 99) return finish();
      requestAnimationFrame(tick);
    })();

    function finish() {
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
      setTimeout(function () {
        loader.classList.add('is-done');
        // Taken out of the tree once the panels have parted, so it can never
        // sit invisibly over the page swallowing anything.
        setTimeout(function () { loader.remove(); }, 950);
      }, reduced ? 0 : 240);
    }
    // Belt and braces on top of the CSS bail-out.
    setTimeout(finish, 4000);
  }

  var y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}());
