/* Scroll reveals, marquee doubling, the rail nudge and the assistant.
   No dependencies: a portfolio that needs 90 KB of animation library to fade
   a heading in is making a claim it then has to live up to. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- reveals, once per element ------------------------------------- */
  var risers = [].slice.call(document.querySelectorAll('.rise'));
  if (!('IntersectionObserver' in window) || reduced) {
    risers.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var group = e.target.parentElement;
        var peers = group ? [].slice.call(group.children).filter(function (c) {
          return c.classList && c.classList.contains('rise');
        }) : [];
        var i = peers.indexOf(e.target);
        // Stagger within a group only. Across the page it would mean content
        // arriving after the reader has already looked at where it should be.
        e.target.style.setProperty('--d', (i > -1 ? Math.min(i, 5) * 70 : 0) + 'ms');
        e.target.classList.add('in');
        io.unobserve(e.target);          // unobserving is what stops a replay
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    risers.forEach(function (el) { io.observe(el); });

    // Safety net. IntersectionObserver does not report intersections while a
    // document is hidden — a background tab, a prerender, some embedded
    // webviews — and content that starts at opacity 0 and is never revealed is
    // a blank page. After three seconds, everything is shown regardless.
    setTimeout(function () {
      risers.forEach(function (el) { el.classList.add('in'); });
    }, 3000);
  }

  /* --- marquee ------------------------------------------------------- */
  // Duplicated in JS rather than in the markup, so the -50% keyframe always
  // lands exactly on the seam however long the text is.
  [].forEach.call(document.querySelectorAll('.marquee__track'), function (track) {
    track.innerHTML = track.innerHTML + track.innerHTML;
  });

  /* --- hero parallax, cheap ------------------------------------------ */
  var name = document.querySelector('[data-parallax]');
  if (name && !reduced) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = Math.min(window.scrollY, 700);
        name.style.transform = 'translateY(' + (y * 0.16) + 'px)';
        name.style.opacity = String(Math.max(0, 1 - y / 620));
        ticking = false;
      });
    }, { passive: true });
  }

  /* --- powers rail: drag to scroll ----------------------------------- */
  var rail = document.querySelector('.rail');
  if (rail) {
    var down = false, startX = 0, startLeft = 0;
    rail.addEventListener('pointerdown', function (e) {
      down = true; startX = e.clientX; startLeft = rail.scrollLeft;
      rail.setPointerCapture(e.pointerId);
      rail.style.cursor = 'grabbing';
    });
    rail.addEventListener('pointermove', function (e) {
      if (!down) return;
      rail.scrollLeft = startLeft - (e.clientX - startX);
    });
    ['pointerup', 'pointercancel'].forEach(function (evt) {
      rail.addEventListener(evt, function () { down = false; rail.style.cursor = ''; });
    });
  }

  /* --- assistant ------------------------------------------------------ */
  var btn = document.querySelector('.assistant__btn');
  var bubble = document.querySelector('.assistant__bubble');
  if (btn && bubble) {
    var lines = [
      'Ten features, 300 tests, zero analyzer issues. Ask me which one broke first.',
      'The offline queue lost data to <code>INSERT OR REPLACE</code>. Post M-02 has the receipt.',
      'Every reconnect used to double the packets. That is a subscription, not a radio.',
      'A cold Flutter engine costs 780&nbsp;ms. A warmed one costs 40. Post M-04.',
      'Six of my own colours failed WCAG contrast. I only knew because I computed it.',
      'Currently shipping to 60M people across 34 app flavours.',
      'Yes, the whole site is hand-written. No framework, no build step.'
    ];
    var i = 0;
    btn.addEventListener('click', function () {
      i = (i + 1) % lines.length;
      bubble.innerHTML = lines[i];
      bubble.style.animation = 'none';
      void bubble.offsetWidth;              // reflow, so the pop replays
      bubble.style.animation = '';
    });
  }

  /* --- year ----------------------------------------------------------- */
  var y = document.querySelector('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}());
