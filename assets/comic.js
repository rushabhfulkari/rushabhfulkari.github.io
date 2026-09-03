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
        dp: num(el, 'data-decimals', 0),
        start: num(el, 'data-start', 1),      // enters when its top hits 100% vh
        end: num(el, 'data-end', 0.2),        // done when its top hits 20% vh
        done: false,
        pin: el.closest ? el.closest('.pin') : null
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
    var atBottom = (window.scrollY + vh) >= (document.body.scrollHeight - 4);

    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var r = it.el.getBoundingClientRect();
      var p;

      if (it.pin) {
        // A sticky element's own rect barely moves, so measuring the track
        // gives a progress that never advances — which is exactly why the
        // strip sat still. Progress comes from the tall .pin ancestor
        // scrolling past instead.
        var pr = it.pin.getBoundingClientRect();
        var travel = it.pin.offsetHeight - vh;
        p = travel > 0 ? clamp01(-pr.top / travel) : 0;
      } else {
        p = clamp01((it.start - r.top / vh) / (it.start - it.end));
        // At the very bottom of the document an element can never reach its
        // end threshold, so it would stay part-faded forever. That is why the
        // contact buttons looked washed out.
        if (atBottom) p = 1;
      }
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
            var now = (target * e).toFixed(it.dp);
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

  /* --- the hero spider: a pendulum on a fixed thread ------------------ */
  /* The thread length never changes — a spider does not telescope. The body
     swings on a damped spring driven by pointer velocity, so it overshoots,
     comes back, and settles rather than sliding to a stop. It hangs from a
     fixed anchor and fades out once the hero has scrolled away. */
  var spider = document.querySelector('.spider');
  if (spider && !reduced) {
    var pivot = spider.querySelector('.spider__pivot');
    var anchorX = window.innerWidth * 0.62;
    var targetX = anchorX;
    var angle = 0, angVel = 0;
    var lastPointerX = null;
    var idle = true;

    window.addEventListener('pointermove', function (e) {
      idle = false;
      if (lastPointerX !== null) {
        // Pointer speed becomes a shove on the pendulum. Capped, or a fast
        // flick sends it spinning like a propeller.
        var shove = Math.max(-3.2, Math.min(3.2, (e.clientX - lastPointerX) * 0.05));
        angVel += shove;
      }
      lastPointerX = e.clientX;
      targetX = e.clientX;
    }, { passive: true });

    window.addEventListener('resize', function () {
      anchorX = window.innerWidth * 0.62;
    }, { passive: true });

    (function swing(t) {
      // Where the pointer is, relative to the anchor, is where the pendulum
      // wants to rest — so it leans toward the cursor and hangs there.
      var lean = idle
        ? Math.sin(t / 1500) * 7
        : Math.max(-34, Math.min(34, (targetX - anchorX) * 0.045));

      // Damped spring toward the rest angle.
      angVel += (lean - angle) * 0.012;   // stiffness
      angVel *= 0.965;                     // damping — high enough to settle
      angle += angVel;

      var hero = document.querySelector('.hero');
      var fade = 1;
      if (hero) {
        var b = hero.getBoundingClientRect().bottom;
        // Gone by the time the hero has left: it belongs to the first screen.
        fade = clamp01(b / (window.innerHeight * 0.55));
      }
      spider.style.opacity = fade.toFixed(3);
      spider.style.visibility = fade < 0.02 ? 'hidden' : 'visible';
      spider.style.transform = 'translate3d(' + (anchorX - 43) + 'px,0,0)';
      if (pivot) pivot.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';

      requestAnimationFrame(swing);
    })(0);
  }

  /* --- the red spider that rides the scrollbar ------------------------ */
  var bug = document.querySelector('.scrollbug');
  if (bug) {
    var bugThread = bug.querySelector('.scrollbug__thread');
    var shownY = 0;
    (function ride() {
      var max = document.body.scrollHeight - window.innerHeight;
      var progress = max > 0 ? window.scrollY / max : 0;
      // Travel between a little below the top and a little above the bottom,
      // so it never collides with the menu or runs off the end.
      // Starts below the corner menu, ends above the assistant, so it never
      // collides with either.
      var top = 132, bottom = window.innerHeight - 110;
      var y = top + (bottom - top) * progress;
      shownY += (y - shownY) * 0.16;      // eased, so it trails the scroll
      bug.style.transform = 'translate3d(0,' + shownY.toFixed(1) + 'px,0)';
      if (bugThread) bugThread.style.height = shownY.toFixed(1) + 'px';
      requestAnimationFrame(ride);
    })();
  }

  /* --- a burst of webbing wherever you click -------------------------- */
  if (!reduced) {
    document.addEventListener('pointerdown', function (e) {
      // Skip real controls: a web erupting out of the CV link is noise.
      if (e.target.closest && e.target.closest('a, button, input, textarea, select')) return;
      var web = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      web.setAttribute('class', 'clickweb');
      web.setAttribute('width', '190'); web.setAttribute('height', '190');
      web.setAttribute('viewBox', '0 0 120 120'); web.setAttribute('fill', 'none');
      web.setAttribute('stroke', '#14110D'); web.setAttribute('stroke-width', '1.6');
      web.innerHTML =
        '<circle cx="60" cy="60" r="14"/><circle cx="60" cy="60" r="27"/>' +
        '<circle cx="60" cy="60" r="41"/><circle cx="60" cy="60" r="55"/>' +
        '<path d="M60 3v114M3 60h114M19 19l82 82M101 19l-82 82"/>';
      web.style.left = e.clientX + 'px';
      web.style.top = e.clientY + 'px';
      document.body.appendChild(web);
      // Removed on its own animation end rather than a guessed timeout, so a
      // slow frame never leaves one behind.
      web.addEventListener('animationend', function () { web.remove(); });
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

  /* --- corner menu ---------------------------------------------------- */
  var navBtn = document.querySelector('.corner-nav__btn');
  var navSheet = document.getElementById('navsheet');
  if (navBtn && navSheet) {
    var setOpen = function (open) {
      navSheet.hidden = !open;
      navBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    navBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(navSheet.hidden);
    });
    // Closing on outside click and on Escape, because a panel you can only
    // dismiss with the button that opened it is a panel people get stuck in.
    document.addEventListener('click', function (e) {
      if (!navSheet.hidden && !navSheet.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !navSheet.hidden) { setOpen(false); navBtn.focus(); }
    });
    navSheet.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
  }

  var y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}());
