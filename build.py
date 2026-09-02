#!/usr/bin/env python3
"""Turn posts/*.md into static pages.

The output is committed, so the site itself has no build step and no runtime
dependency — this only runs when a post is added or edited.

    /tmp/pdfv/bin/python build.py
"""
import html
import pathlib
import re

import markdown

ROOT = pathlib.Path(__file__).parent
POSTS = ROOT / 'posts'
BLOG = ROOT / 'blog'

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Rushabh Fulkari</title>
<meta name="description" content="{excerpt}">
<meta name="theme-color" content="#F1EADA">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{excerpt}">
<meta property="og:type" content="article">
<meta property="og:image" content="https://rushabhfulkari.github.io/art/app_icon.png">
<meta name="twitter:card" content="summary">
<link rel="canonical" href="https://rushabhfulkari.github.io/blog/{slug}.html">
<link rel="icon" type="image/png" sizes="64x64" href="../favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bangers&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/comic.css">
</head>
<body>
<article class="article">
  <a class="backlink" href="./">← All dispatches</a>
  <p class="article__meta" style="margin-top:22px">
    <span class="stamp stamp--red">{issue}</span>
    <span>{date}</span><span>·</span><span>{tags}</span>
  </p>
  <h1>{title}</h1>
  <div class="article__body">
{body}
  </div>
  <p style="margin-top:56px"><a class="btn btn--ghost" href="./">← All dispatches</a>
     <a class="btn" href="../">Back to the top</a></p>
</article>
<footer>
  <div class="wrap">
    <p style="margin:0"><b style="color:var(--paper)">Rushabh Fulkari</b> ·
    Senior Flutter Developer · <a href="mailto:rushabhfulkari@gmail.com">rushabhfulkari@gmail.com</a></p>
  </div>
</footer>
</body>
</html>
"""


def parse(path):
    """Split `--- key: value ---` frontmatter from the markdown body."""
    raw = path.read_text()
    if not raw.startswith('---'):
        raise SystemExit(f'{path.name}: no frontmatter')
    _, front, body = raw.split('---', 2)
    meta = {}
    for line in front.strip().splitlines():
        key, _, value = line.partition(':')
        meta[key.strip()] = value.strip().strip('"')
    meta['body'] = body.strip()
    return meta


def main():
    BLOG.mkdir(exist_ok=True)
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'attr_list'])

    posts = sorted((parse(p) for p in POSTS.glob('*.md')),
                   key=lambda m: m['date'], reverse=True)

    for post in posts:
        md.reset()
        page = HEAD.format(
            title=html.escape(post['title']),
            excerpt=html.escape(post['excerpt']),
            slug=post['slug'],
            issue=html.escape(post.get('issue', '')),
            date=post['date'],
            tags=html.escape(post['tags']),
            body=md.convert(post['body']),
        )
        (BLOG / f"{post['slug']}.html").write_text(page)

    # --- the blog index -------------------------------------------------
    rows = '\n'.join(
        f'''      <a class="dispatch" data-fx="rise" href="{p['slug']}.html">
        <span class="dispatch__no">{html.escape(p.get('issue', ''))}</span>
        <span><h3>{html.escape(p['title'])}</h3><p>{html.escape(p['excerpt'])}</p></span>
        <span class="dispatch__date">{p['date']}</span>
      </a>''' for p in posts)

    (BLOG / 'index.html').write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dispatches — Rushabh Fulkari</title>
<meta name="description" content="Writing on production Flutter, offline-first sync, BLE, add-to-app and building with AI.">
<meta name="theme-color" content="#F1EADA">
<link rel="icon" type="image/png" sizes="64x64" href="../favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Bangers&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/comic.css">
</head>
<body>
<section style="padding-top:clamp(80px,12vh,130px)">
  <div class="wrap">
    <a class="backlink" href="../">← Back to the front page</a>
    <p class="kicker" data-fx="rise" style="margin-top:26px">— {len(posts)} dispatches —</p>
    <h2 class="section-title" data-fx="rise">Things I<br>wrote down</h2>
    <p class="section-sub" data-fx="rise">
      Bugs with receipts, mostly. What building production Flutter with an AI in
      the loop actually costs, and the specific things that broke.
    </p>
{rows}
  </div>
</section>
<footer>
  <div class="wrap">
    <p style="margin:0"><b style="color:var(--paper)">Rushabh Fulkari</b> ·
    Senior Flutter Developer · <a href="mailto:rushabhfulkari@gmail.com">rushabhfulkari@gmail.com</a></p>
  </div>
</footer>
<script src="../assets/comic.js"></script>
</body>
</html>
""")

    # --- the four newest, injected into the front page ------------------
    cards = ''.join(
        f'''<a class="dispatch" data-fx="rise" href="blog/{p['slug']}.html">'''
        f'''<span class="dispatch__no">{html.escape(p.get('issue', ''))}</span>'''
        f'''<span><h3>{html.escape(p['title'])}</h3>'''
        f'''<p>{html.escape(p['excerpt'])}</p></span>'''
        f'''<span class="dispatch__date">{p['date']}</span></a>'''
        for p in posts[:4])

    (ROOT / 'assets' / 'posts.js').write_text(
        '/* Generated by build.py — the four newest dispatches. */\n'
        '(function () {\n'
        '  var slot = document.querySelector("[data-posts]");\n'
        '  if (!slot) return;\n'
        f'  slot.innerHTML = {cards!r};\n'
        '  // Injected after comic.js collected its elements, so these are\n'
        '  // shown outright rather than waiting for a scroll pass that will\n'
        '  // never include them.\n'
        '  [].forEach.call(slot.querySelectorAll("[data-fx]"), function (el) {\n'
        '    el.style.opacity = "1";\n'
        '    el.style.transform = "none";\n'
        '  });\n'
        '}());\n')

    print(f'built {len(posts)} posts → blog/, plus the index and posts.js')


if __name__ == '__main__':
    main()
