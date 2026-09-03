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
        // Completes once its top reaches 62% of the viewport. The old 20%
        // meant anything sitting low on the page — the contact links, most
        // obviously — could never scroll high enough to finish, and stayed
        // part-faded forever.
        end: num(el, 'data-end', 0.62),
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
        // And the section is exactly one viewport plus that travel. A fixed
        // 420vh meant the strip finished moving 40% of the way through and
        // then sat still while the reader kept scrolling past nothing —
        // which is what made the section feel broken. At this height one
        // pixel of scroll is one pixel of strip.
        if (it.pin) it.pin.style.height = (window.innerHeight + it.to) + 'px';
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
        // Two more ways to be finished, both belt-and-braces against an
        // element that cannot scroll far enough to complete on its own:
        // it is entirely above the fold, or the page has nowhere left to go.
        if (atBottom || r.bottom < vh) p = 1;
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
          animateCards(el);
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

  /* Each card reacts to where it is across the viewport as the strip travels:
     it rises and squares up as it reaches the middle, and sinks and tilts
     away toward either edge. Without this the strip is a slab of cards moving
     as one lump, which reads as a screenshot being dragged. */
  function animateCards(track) {
    var vw = window.innerWidth;
    var cards = track.children;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var b = card.getBoundingClientRect();
      if (b.right < -200 || b.left > vw + 200) continue;   // skip the off-screen
      var centre = (b.left + b.width / 2) / vw;            // 0 left … 1 right
      var away = Math.max(-1, Math.min(1, (centre - 0.5) * 2));
      card.style.transform =
        'translateY(' + (Math.abs(away) * 22).toFixed(1) + 'px) ' +
        'rotate(' + (away * 2.6).toFixed(2) + 'deg) ' +
        'scale(' + (1 - Math.abs(away) * 0.07).toFixed(3) + ')';
      card.style.opacity = (1 - Math.abs(away) * 0.32).toFixed(3);
    }
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
    window.addEventListener('resize', function () {
      collect();          // re-measure travel and re-size the pinned section
      onScroll();
    }, { passive: true });
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

  /* --- Spinner, the assistant ---------------------------------------- */
  /* A scripted guide, not a language model. It matches on keywords and
     answers from the same content the page is built from, so it can never
     invent a claim about Rushabh that is not already on the page — which is
     the whole reason to script it rather than wire up an API. */
  (function () {
    var openBtn = document.getElementById('chatOpen');
    var panel = document.getElementById('chat');
    if (!openBtn || !panel) return;

    var log = document.getElementById('chatLog');
    var chips = document.getElementById('chatChips');
    var form = document.getElementById('chatForm');
    var input = document.getElementById('chatInput');
    var closeBtn = document.getElementById('chatClose');
    var bubble = document.querySelector('.assistant__bubble');

    var GREETING =
      '<p>Hello — I am <strong>Spinner</strong>. 🕷</p>' +
      '<p>Rushabh built me, and I know this page by heart. Ask me anything ' +
      'and I will take you straight to it.</p>';

    var TOPICS = [
      { keys: ['mission', 'work', 'project', 'built', 'portfolio', 'cadence', 'app'],
        chip: 'The missions',
        reply: '<p>Five worth opening. <strong>Cadence</strong> is the one you ' +
               'can run right now — ten production-grade Flutter features in one ' +
               'codebase, 300 tests, CI green. Then CupidMedia (34 flavours, 60M ' +
               'members), Highlands Brain, Sergo and Apprintly.</p>' +
               '<p><a href="#missions" data-go>Take me there →</a> · ' +
               '<a href="https://rushabhfulkari.github.io/cadence/">Open Cadence ↗</a></p>' },

      { keys: ['skill', 'stack', 'tech', 'power', 'know', 'flutter', 'dart', 'kotlin', 'swift'],
        chip: 'His skills',
        reply: '<p>Seven, and they are specific: cross-platform architecture, ' +
               'native platform work, offline and real-time, monetisation and ' +
               'compliance, testing that finds things, shipping machinery, and ' +
               'building with AI.</p>' +
               '<p>Flutter · Dart · BLoC · Kotlin · Swift · Pigeon · SQLite · BLE · ' +
               'WebRTC · Bitrise.</p><p><a href="#powers" data-go>See the strip →</a></p>' },

      { keys: ['hire', 'available', 'job', 'role', 'contact', 'email', 'reach', 'talk', 'cv', 'resume'],
        chip: 'Hire him',
        reply: '<p>He is open to senior Flutter roles — offline, hardware, or ' +
               'living inside an app that already exists.</p>' +
               '<p><a href="mailto:rushabhfulkari@gmail.com">rushabhfulkari@gmail.com</a> · ' +
               '<a href="rushabh-fulkari-cv.pdf">CV (PDF) ↗</a> · ' +
               '<a href="https://www.linkedin.com/in/rushabh-fulkari-b5200b120/">LinkedIn ↗</a></p>' },

      { keys: ['number', 'scale', 'user', 'many', 'metric', 'stat', 'flavour', 'flavor'],
        reply: '<p><strong>60M+</strong> registered members. <strong>34+</strong> app ' +
               'flavours from one codebase. <strong>180+</strong> countries, ' +
               '<strong>43</strong> languages, <strong>1.4M+</strong> installs a month. ' +
               'Deployment time cut <strong>80%</strong>.</p>' +
               '<p><a href="#numbers" data-go>The full field report →</a></p>' },

      { keys: ['write', 'blog', 'article', 'dispatch', 'read', 'post'],
        reply: '<p>Seven dispatches, and they are bugs with receipts rather than ' +
               '“10 Flutter tips”. The <code>INSERT OR REPLACE</code> cascade that ' +
               'ate an offline queue. The BLE reconnect that doubles every packet. ' +
               'What building with an AI actually cost.</p>' +
               '<p><a href="blog/">Read them all →</a></p>' },

      { keys: ['ai', 'claude', 'llm', 'gpt', 'model'],
        reply: '<p>He uses Claude daily, and has written down what it is actually ' +
               'good at. Short version: ask for the seam, not the feature; make it ' +
               'write the limitation down; and never let a green test suite stand in ' +
               'for looking at the screen.</p>' +
               '<p><a href="blog/ten-features-with-claude.html">The long version ↗</a></p>' },

      { keys: ['ble', 'bluetooth', 'offline', 'sync', 'sqlite', 'pigeon', 'add-to-app', 'native'],
        reply: '<p>All four have their own dispatch — offline-first sync with an ' +
               'outbox, BLE stream lifecycle, add-to-app over Pigeon, and shipping at ' +
               '34 flavours.</p><p><a href="blog/">Pick one ↗</a></p>' },

      { keys: ['who', 'about', 'you', 'spinner', 'bot', 'yourself'],
        reply: '<p>I am scripted — no language model behind me. I match what you ' +
               'type against the same content this page is built from, so I cannot ' +
               'make anything up about him. If I do not know, I will say so.</p>' },

      { keys: ['spider', 'web', 'comic', 'design', 'site', 'made'],
        reply: '<p>The page is hand-written — no framework, no build step. The ' +
               'halftone, the webs and the lettering are all CSS and inline SVG; ' +
               'there is not one background image in the stylesheet.</p>' +
               '<p>Click anywhere, by the way. 🕸</p>' }
    ];

    var SURPRISE = [
      '<p>Six of his own colours failed WCAG contrast. He only knew because he ' +
      'computed the ratios instead of trusting his eyes.</p>',
      '<p><code>INSERT OR REPLACE</code> in SQLite is a <em>delete</em> then an ' +
      'insert — so it fires <code>ON DELETE CASCADE</code> and quietly ate every ' +
      'queued change. That one is in dispatch M-02.</p>',
      '<p>A cold Flutter engine costs about <strong>780ms</strong>. A pre-warmed ' +
      'one costs <strong>40</strong>. That difference is the whole reputation of ' +
      'embedded Flutter.</p>',
      '<p>He once spent four hours on a test suite that would not run. It was not ' +
      'the code — he had exhausted the machine\'s 16,384 ephemeral ports.</p>',
      '<p>RR intervals in a heart-rate packet are in units of 1/1024 s, not ' +
      'milliseconds. Read them as ms and every HRV number you ship is 2.4% wrong.</p>'
    ];

    var FALLBACK =
      '<p>I do not know that one — I am scripted, so I would rather say so than ' +
      'guess.</p><p>Try <strong>missions</strong>, <strong>skills</strong>, ' +
      '<strong>numbers</strong>, <strong>writing</strong>, or ' +
      '<strong>hire him</strong>.</p>';

    var started = false;
    var surpriseAt = 0;

    function scrollDown() { log.scrollTop = log.scrollHeight; }

    function say(html, who) {
      var el = document.createElement('div');
      el.className = 'msg msg--' + (who || 'bot');
      el.innerHTML = html;
      log.appendChild(el);
      scrollDown();
      return el;
    }

    function think(then) {
      var el = document.createElement('div');
      el.className = 'msg msg--think';
      el.innerHTML = 'Thinking <i></i><i></i><i></i>';
      log.appendChild(el);
      scrollDown();
      // Long enough to read as considered, short enough not to be annoying.
      setTimeout(function () { el.remove(); then(); }, 420 + Math.random() * 260);
    }

    function answer(text) {
      var q = text.toLowerCase();
      if (/surprise|random|fact|tell me something/.test(q)) {
        var pick = SURPRISE[surpriseAt % SURPRISE.length];
        surpriseAt++;
        return pick;
      }
      var best = null, bestScore = 0;
      TOPICS.forEach(function (topic) {
        var score = 0;
        topic.keys.forEach(function (k) { if (q.indexOf(k) > -1) score++; });
        if (score > bestScore) { bestScore = score; best = topic; }
      });
      return best ? best.reply : FALLBACK;
    }

    function ask(text) {
      say(text.replace(/[<>]/g, ''), 'you');
      think(function () { say(answer(text)); });
    }

    function buildChips() {
      chips.innerHTML = '';
      ['The missions', 'His skills', 'Hire him', 'Surprise me'].forEach(function (label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', function () { ask(label); });
        chips.appendChild(b);
      });
    }

    function open() {
      panel.hidden = false;
      if (!started) { started = true; say(GREETING); buildChips(); }
      setTimeout(function () { input.focus(); }, 60);
    }
    function close() { panel.hidden = true; openBtn.focus(); }

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) close();
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      ask(text);
    });

    // In-page links close the panel and jump, rather than scrolling the page
    // behind a window that is covering it.
    log.addEventListener('click', function (e) {
      var link = e.target.closest('a[data-go]');
      if (!link) return;
      e.preventDefault();
      close();
      var target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    if (bubble) {
      bubble.addEventListener('click', open);
      bubble.style.cursor = 'pointer';
    }
  }());

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
