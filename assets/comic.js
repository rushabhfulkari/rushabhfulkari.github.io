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
          t.push('translate3d(0,' + ((1 - e) * (it.to || 40)) + 'px,0)');
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

  /* --- the spider descends as you scroll ----------------------------- */
  var spider = document.querySelector('.spider');
  if (spider && !reduced) {
    var thread = spider.querySelector('.spider__thread');
    var base = parseFloat(getComputedStyle(thread).height) || 200;
    window.addEventListener('scroll', function () {
      var y = Math.min(window.scrollY, 900);
      thread.style.height = (base + y * 0.42) + 'px';
    }, { passive: true });
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

  var y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}());
