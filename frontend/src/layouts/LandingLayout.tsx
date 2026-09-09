import type { FC } from 'hono/jsx'
import { Icon, ICONS } from '../lib/Icon'
import { GlidoLogo } from '../lib/GlidoLogo'

interface Props {
  title?: string
  children: any
}

export const LandingLayout: FC<Props> = ({ title = 'Home', children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title} — Glido</title>
        <link rel="icon" type="image/svg+xml" href="/public/favicon.svg" />

        {/* Inter font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=swap" rel="stylesheet" />

        <link rel="stylesheet" href="/public/styles.css" />
        <style>{`
          [x-cloak]{display:none!important}
          * { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
          @keyframes dot-drift {
            from { background-position: 0 0; }
            to   { background-position: 28px 28px; }
          }
          .section-dots {
            background-image: radial-gradient(rgba(0,0,0,0.06) 1.5px, transparent 1.5px);
            background-size: 28px 28px;
          }
          @keyframes warp-beam-fly {
            0%   { transform: translateY(620px); opacity: 0; }
            8%   { opacity: 1; }
            92%  { opacity: 1; }
            100% { transform: translateY(-420px); opacity: 0; }
          }
          .warp-beam {
            position: absolute;
            top: 0;
            width: 2px;
            border-radius: 9999px;
            pointer-events: none;
            animation: warp-beam-fly linear infinite;
          }
          @media (max-width: 640px) {
            .hero-content { padding: 40px 28px 48px !important; }
          }

          /* ── Nav ─────────────────────────────── */
          #nav-pill {
            transition: max-width 0.5s cubic-bezier(0.16,1,0.3,1),
                        margin   0.5s cubic-bezier(0.16,1,0.3,1),
                        border-radius 0.5s cubic-bezier(0.16,1,0.3,1),
                        box-shadow 0.5s cubic-bezier(0.16,1,0.3,1),
                        border-color 0.5s ease;
          }
          #main-nav { transition: padding 0.5s cubic-bezier(0.16,1,0.3,1); }

          .nav-link {
            position: relative;
            z-index: 1;
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 7px 13px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            color: #78716C;
            text-decoration: none;
            transition: color 0.15s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
            user-select: none;
          }
          .nav-link:hover  { color: #1C1917; transform: translateY(-1.5px); }
          .nav-link:active { color: #1C1917; transform: translateY(0px) scale(0.96); }

          #nav-hl {
            position: absolute;
            border-radius: 8px;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06);
            opacity: 0;
            pointer-events: none;
            z-index: 0;
            transition: opacity 0.2s ease, width 0.25s cubic-bezier(0.16,1,0.3,1),
                        height 0.25s cubic-bezier(0.16,1,0.3,1),
                        left 0.25s cubic-bezier(0.16,1,0.3,1),
                        top 0.25s cubic-bezier(0.16,1,0.3,1);
          }

          /* Login shimmer */
          #nav-login {
            position: relative;
            overflow: hidden;
            transition: transform 0.22s cubic-bezier(0.16,1,0.3,1),
                        box-shadow 0.22s ease,
                        background 0.22s ease;
          }
          #nav-login::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: 9999px;
            background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%);
            transform: translateX(-120%);
            transition: transform 0.5s ease;
            pointer-events: none;
          }
          #nav-login:hover::after  { transform: translateX(120%); }
          #nav-login:hover         { transform: translateY(-2px); }
          #nav-login:active        { transform: translateY(0) scale(0.97); }
        `}</style>

        {/* Alpine init must be synchronous before defer */}
        <script src="/public/alpine-init.js"></script>
        <script src="https://unpkg.com/alpinejs@3.14.3/dist/cdn.min.js" defer></script>
        <script src="https://unpkg.com/htmx.org@2.0.4/dist/htmx.min.js" defer></script>
        <script src="https://code.iconify.design/3/3.1.1/iconify.min.js" defer></script>

        {/* ── Instant preloader — runs before body renders ── */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var D='#1C232C',O='#FF6610',O2='var(--brand-color)';
            /* Only show full preloader on first visit per session */
            var firstVisit = !sessionStorage.getItem('g-visited');
            if (firstVisit) sessionStorage.setItem('g-visited','1');
            var s=document.createElement('style');
            s.textContent='#g-pl-overlay{position:fixed;inset:0;z-index:99998;background:#fff;pointer-events:none}'
              +'#g-pl-bar{position:fixed;top:0;left:0;height:4px;width:0%;background:linear-gradient(90deg,'+O2+',#FF9500);box-shadow:0 0 10px rgba(var(--brand-rgb),0.5);z-index:100000}'
              +(firstVisit ? '#g-pl-logo-wrap{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99999;pointer-events:none}' : '');
            document.head.appendChild(s);
            /* Subsequent navigations: only show thin progress bar, no overlay or logo */
            if (!firstVisit) {
              var bar=document.createElement('div');bar.id='g-pl-bar';
              document.documentElement.appendChild(bar);
              var raf=requestAnimationFrame;raf(function(){raf(function(){
                bar.style.transition='width 0.3s ease';bar.style.width='80%';
              });});
              window.__gPlSafetyTimer=setTimeout(function(){
                var b=document.getElementById('g-pl-bar');
                if(b){b.style.transition='width 0.1s ease';b.style.width='100%';setTimeout(function(){b.style.transition='opacity 0.2s ease';b.style.opacity='0';setTimeout(function(){if(b&&b.parentNode)b.parentNode.removeChild(b);},220);},120);}
              },4000);
              return;
            }
            var H=28,W=145;
            var svg='<svg id="g-pl-logo-svg" viewBox="0 0 160 31" height="'+H+'" width="'+W+'" xmlns="http://www.w3.org/2000/svg" style="display:block">'
              +'<path fill="'+D+'" d="m25.5 13c-1.2 0-2.5 0.6-3.4 1.6l-3 3.2 0.1 0.2h24.8l-0.8 3.1c-0.6 2.3-1.9 3.5-4.3 3.5h-23.6c-5.3 0-8.7-3.1-8.3-8.3s3.1-9.8 8.3-9.8h15.5c0.8 0 1.4-0.5 1.8-1.1l2-3.5-0.1-0.6h-19.3c-8.2 0-12.8 6.1-13.3 14-0.5 7.1 2.8 14.2 12.7 14.3h24.4c5.4 0 8.6-2.2 9.9-7.3l2.4-9.2-25.8-0.1z"/>'
              +'<path fill="'+D+'" d="m60.9 1.3-6.3 21.2c-0.9 4.1 1.1 6.8 5.5 6.9h5.8l1.3-5h-4.6c-1.6 0-2.5-0.9-2-2.6l5.7-20.5h-5.4z"/>'
              +'<path fill="'+D+'" d="m75.6 9.3-5.4 20.1h5.8l5.6-20.5h-5.5l-0.5 0.4z"/>'
              +'<path fill="'+D+'" d="m116.5 1.4-5.3 19.1c-0.8 2.6-2.3 3.8-4.9 3.8h-12.4c-2.5 0-4.2-1.4-3.8-4.4 0.5-3.6 3-6 6.2-6h12c1 0 1.4-0.4 1.9-1.1l1.8-3.5v-0.4h-16c-5.9 0-11.2 3.9-12 10.7-0.6 5.8 2.4 9.7 9.3 9.7h13c5.6 0 9.1-1.9 10.6-7.7l5.7-20.3h-6l-0.1 0.1z"/>'
              +'<path fill="'+D+'" d="m150.5 16c-0.4 0-0.4 0.2-0.6 0.5l-0.8 3.5c-0.6 2.7-2.6 4.4-4.7 4.4h-11.9c-2.7 0-4.6-1.5-4-4.8 0.5-3.3 2.8-5.7 6.3-5.7h12.2c0.7 0 1.2-0.3 1.6-1l1.8-3.6-0.2-0.4h-15.2c-6.3 0-11 3.4-12.2 9.8-1.1 6.1 1.4 10.6 8.7 10.7h13c5.9 0 9.1-3.1 10.2-7.8l1.3-5.5-5.5-0.1z"/>'
              +'<path fill="'+O+'" d="m43.1 1.4c-1.5 0-2.6 0.3-3.5 1.4-0.7 0.7-2.9 3.4-2.8 3.6l0.2 0.1h13.6c1 0 1.5-0.4 2-1.1 0.6-0.8 2.4-3.7 2.3-4h-11.8z"/>'
              +'<path fill="'+O2+'" d="m77.8 1.4-1.4 5.1h5.1c0.5 0 0.7-0.4 0.8-0.6l1.3-4.6h-5.8v0.1z"/>'
              +'<path fill="'+O+'" d="m152.8 8.9c-0.2 0-0.2 0.1-0.3 0.2l-1.9 4.3 4 0.1c0.7 0 1-0.3 1.5-0.8 0.7-0.8 2.4-3.4 2.4-3.6l-0.1-0.2h-5.6z"/>'
              +'</svg>';
            var overlay=document.createElement('div');overlay.id='g-pl-overlay';
            var bar=document.createElement('div');bar.id='g-pl-bar';
            var wrap=document.createElement('div');wrap.id='g-pl-logo-wrap';wrap.innerHTML=svg;
            document.documentElement.appendChild(overlay);
            document.documentElement.appendChild(bar);
            document.documentElement.appendChild(wrap);
            var raf=requestAnimationFrame;raf(function(){raf(function(){
              bar.style.transition='width 0.5s ease';bar.style.width='60%';
            });});
            function _safetyDismiss(){
              var b=document.getElementById('g-pl-bar');
              var o=document.getElementById('g-pl-overlay');
              var w=document.getElementById('g-pl-logo-wrap');
              if(b){b.style.transition='width 0.16s ease';b.style.width='100%';}
              setTimeout(function(){
                if(b){b.style.transition='opacity 0.3s ease';b.style.opacity='0';}
                if(o){o.style.transition='opacity 0.4s ease';o.style.opacity='0';}
                if(w){w.style.transition='opacity 0.4s ease';w.style.opacity='0';}
                setTimeout(function(){
                  [b,o,w].forEach(function(el){if(el&&el.parentNode)el.parentNode.removeChild(el);});
                },450);
              },200);
            }
            window.__gPlSafetyTimer=setTimeout(_safetyDismiss,5000);
          })();
        `}} />
      </head>
      <body style="background:#fff; color:#1C1917; overflow-x:hidden;">

        {/* ── Nav ─────────────────────────────────────────────────────────── */}
        <header id="main-nav" style="position:fixed; top:0; left:0; right:0; z-index:50; padding:0; pointer-events:none;">
          <div
            id="nav-pill"
            style="pointer-events:all; max-width:100%; margin:0; background:rgba(255,255,255,0.88); backdrop-filter:blur(20px) saturate(200%); -webkit-backdrop-filter:blur(20px) saturate(200%); border:1px solid rgba(0,0,0,0.07); border-radius:0; box-shadow:none;"
          >
            <div style="max-width:1200px; margin:0 auto; padding:0 24px; height:60px; display:flex; align-items:center; justify-content:space-between;">

              {/* Logo */}
              <a href="/" style="display:flex; align-items:center; text-decoration:none; flex-shrink:0; transition:opacity 0.15s ease;"
                onmouseover="this.style.opacity='0.75'"
                onmouseout="this.style.opacity='1'"
              >
                <GlidoLogo height={21} onDark={false} />
              </a>

              {/* Center nav — pill track */}
              <nav id="nav-wrap" style="position:relative; display:flex; align-items:center; gap:2px; padding:4px; background:rgba(0,0,0,0.045); border-radius:12px;">
                {/* Liquid highlight blob */}
                <div id="nav-hl"></div>

                {[
                  { href: '/',         label: 'Home',        icon: ICONS.home     },
                  { href: '/book',     label: 'Book a Slot', icon: ICONS.calendar },
                  { href: '/bookings', label: 'My Bookings', icon: ICONS.bookings },
                ].map(l => (
                  <a key={l.href} href={l.href} class="nav-link">
                    <Icon name={l.icon} size={14} style="opacity:0.65; transition:opacity 0.15s ease;" />
                    {l.label}
                  </a>
                ))}
              </nav>

              {/* Login CTA */}
              <a
                id="nav-login"
                href="/login"
                style="display:inline-flex; align-items:center; gap:6px; padding:9px 20px; font-size:13px; font-weight:600; color:#1C1917; background:linear-gradient(160deg,#F9F8F7 0%,#EEEDEC 100%); border:1px solid rgba(0,0,0,0.10); border-radius:9999px; text-decoration:none; box-shadow:0 1px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.85); flex-shrink:0;"
              >
                <Icon name={ICONS.users} size={13} style="opacity:0.55;" />
                Login
              </a>

            </div>
          </div>
        </header>

        {/* ── Main content ────────────────────────────────────────────── */}
        <main style="padding-top:60px;">
          {children}
        </main>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style="border-top:1px solid #f0f0f0; background:#fff; padding:64px 24px 32px;">
          <div class="max-w-6xl mx-auto">
            <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:48px; margin-bottom:48px;" class="footer-grid">

              {/* Brand column */}
              <div>
                <div class="flex items-center mb-4">
                  <GlidoLogo height={20} onDark={false} />
                </div>
                <p style="font-size:13px; color:#78716C; line-height:1.7; max-width:220px;">
                  Streamlining container freight station operations from booking to bay door.
                </p>
                <div style="display:flex; gap:12px; margin-top:20px;">
                  {[
                    { icon: 'solar:letter-bold-duotone', href: '#' },
                    { icon: 'solar:global-bold-duotone', href: '#' },
                  ].map(s => (
                    <a
                      key={s.icon}
                      href={s.href}
                      style="width:32px; height:32px; border-radius:8px; background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.08); display:flex; align-items:center; justify-content:center; transition:background 0.15s ease;"
                      onmouseover="this.style.background='rgba(var(--brand-rgb),0.12)'"
                      onmouseout="this.style.background='rgba(0,0,0,0.05)'"
                    >
                      <Icon name={s.icon} size={14} style="color:#78716C;" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Links */}
              {[
                { heading: 'Platform', links: [{ label: 'Book a Visit', href: '/book' }, { label: 'My Bookings', href: '/bookings' }, { label: 'Kiosk', href: '/kiosk' }] },
                { heading: 'Operations', links: [{ label: 'Reception', href: '/reception' }, { label: 'Dashboard', href: '/reception' }, { label: 'Reports', href: '/reception/reports' }] },
                { heading: 'Company', links: [{ label: 'Privacy', href: '#' }, { label: 'Terms', href: '#' }, { label: 'Contact', href: '#' }] },
              ].map(col => (
                <div key={col.heading}>
                  <p style="font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:#A8A29E; margin-bottom:16px;">{col.heading}</p>
                  <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;">
                    {col.links.map(l => (
                      <li key={l.label}>
                        <a
                          href={l.href}
                          style="font-size:13px; color:#78716C; text-decoration:none; transition:color 0.15s ease;"
                          onmouseover="this.style.color='#1C1917'"
                          onmouseout="this.style.color='#78716C'"
                        >
                          {l.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div style="padding-top:24px; border-top:1px solid rgba(0,0,0,0.07); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <span style="font-size:12px; color:#A8A29E;">© 2026 Glido CFS. All rights reserved.</span>
              <span style="font-size:12px; color:#A8A29E;">Sydney Container Freight Station · Mon–Fri 06:00–18:00</span>
            </div>
          </div>
        </footer>

        {/* ── Landing-specific animations (hero words, rotating text) ──── */}
        <script dangerouslySetInnerHTML={{ __html: `
          /* ── Staggered word reveal in hero ── */
          (function() {
            function initHeroWords() {
              var hero = document.querySelector('.hero-words');
              if (!hero) return;
              var words = hero.querySelectorAll('.hero-word');
              words.forEach(function(w, i) {
                w.style.opacity = '0';
                w.style.transform = 'translateY(22px)';
                w.style.filter = 'blur(2px)';
                w.style.transition = 'opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1), filter 0.5s ease';
                w.style.transitionDelay = (i * 85 + 340) + 'ms';
                setTimeout(function() {
                  w.style.opacity = '1';
                  w.style.transform = 'translateY(0)';
                  w.style.filter = 'blur(0)';
                }, 40);
              });
            }
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', initHeroWords);
            } else {
              initHeroWords();
            }
          })();

          /* ── Rotating word cycle ── */
          (function() {
            function initRotatingWord() {
              var el = document.getElementById('rotating-word');
              if (!el) return;
              var words = ['Collection', 'Delivery', 'Drop Off', 'Pick Up', 'Clearance'];
              var i = 0;
              el.style.transition = 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1)';
              function cycle() {
                el.style.opacity = '0';
                el.style.transform = 'translateY(-10px)';
                setTimeout(function() {
                  i = (i + 1) % words.length;
                  el.textContent = words[i];
                  el.style.opacity = '1';
                  el.style.transform = 'translateY(0)';
                }, 320);
              }
              setInterval(cycle, 2800);
            }
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', initRotatingWord);
            } else {
              initRotatingWord();
            }
          })();
        `}} />

        {/* ── Global animation engine ───────────────────────────────────── */}
        <script src="/public/transitions.js"></script>

        {/* ── Hero: mouse-parallax 3D ───────────────────────────────────── */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var heroSection = document.getElementById('hero-section');
            var card        = document.getElementById('hero-card');
            var bg          = document.getElementById('hero-bg');
            var spec        = document.getElementById('hero-spec');
            var content     = document.getElementById('hero-content-layer');
            if (!heroSection || !card) return;

            /* Target values (set by mousemove) */
            var tCardRx = 0, tCardRy = 0;   /* card tilt °       */
            var tBgX = 0,    tBgY = 0;       /* bg shift px       */
            var tCtX = 0,    tCtY = 0;       /* content shift px  */
            var tSpecX = 50, tSpecY = 50;    /* spec % position   */
            var tScale = 1.0;

            /* Current lerped values */
            var cCardRx = 0, cCardRy = 0;
            var cBgX = 0,    cBgY = 0;
            var cCtX = 0,    cCtY = 0;
            var cSpecX = 50, cSpecY = 50;
            var cScale = 1.0;
            var inside = false;

            function lerp(a, b, t) { return a + (b - a) * t; }

            var rafId = null;
            function tick() {
              var ease = inside ? 0.07 : 0.05;
              cCardRx = lerp(cCardRx, tCardRx, ease);
              cCardRy = lerp(cCardRy, tCardRy, ease);
              cBgX    = lerp(cBgX,    tBgX,    ease);
              cBgY    = lerp(cBgY,    tBgY,    ease);
              cCtX    = lerp(cCtX,    tCtX,    ease);
              cCtY    = lerp(cCtY,    tCtY,    ease);
              cSpecX  = lerp(cSpecX,  tSpecX,  ease);
              cSpecY  = lerp(cSpecY,  tSpecY,  ease);
              cScale  = lerp(cScale,  tScale,  ease);

              card.style.transform =
                'perspective(900px) rotateX(' + cCardRx + 'deg) rotateY(' + cCardRy + 'deg) scale(' + cScale + ')';

              bg.style.transform =
                'translate(' + cBgX + 'px,' + cBgY + 'px)';

              if (content) {
                content.style.transform =
                  'translate(' + cCtX + 'px,' + cCtY + 'px)';
              }

              if (spec) {
                /* opacity ramps up as tilt increases */
                var tiltMag = Math.sqrt(cCardRx * cCardRx + cCardRy * cCardRy);
                var specOp  = Math.min(tiltMag / 4, 1) * 0.18;
                spec.style.background =
                  'radial-gradient(ellipse 70% 60% at ' + cSpecX + '% ' + cSpecY + '%,' +
                  'rgba(255,255,255,' + specOp + ') 0%,' +
                  'transparent 70%)';
              }

              rafId = requestAnimationFrame(tick);
            }
            rafId = requestAnimationFrame(tick);

            heroSection.addEventListener('mousemove', function(e) {
              inside = true;
              var r  = heroSection.getBoundingClientRect();
              var mx = (e.clientX - r.left) / r.width;   /* 0→1 */
              var my = (e.clientY - r.top)  / r.height;

              /* Card tilt: max ±5° X, ±8° Y */
              tCardRx = (my - 0.5) * -10;
              tCardRy = (mx - 0.5) *  16;

              /* BG moves opposite direction (window parallax), max ±28px */
              tBgX = (mx - 0.5) * -28;
              tBgY = (my - 0.5) * -20;

              /* Content floats with tilt, max ±10px */
              tCtX = (mx - 0.5) * 10;
              tCtY = (my - 0.5) *  7;

              /* Specular: light source stays roughly top-left, shifts subtly */
              tSpecX = 20 + mx * 30;
              tSpecY = 10 + my * 25;

              tScale = 1.012;
            }, { passive: true });

            heroSection.addEventListener('mouseleave', function() {
              inside = false;
              tCardRx = 0; tCardRy = 0;
              tBgX = 0;    tBgY = 0;
              tCtX = 0;    tCtY = 0;
              tSpecX = 50; tSpecY = 50;
              tScale = 1.0;
            });
          })();
        `}} />

        {/* ── Nav: floating pill + 3D interactions ─────────────────────── */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var nav    = document.getElementById('main-nav');
            var pill   = document.getElementById('nav-pill');
            var wrap   = document.getElementById('nav-wrap');
            var hl     = document.getElementById('nav-hl');
            var links  = document.querySelectorAll('.nav-link');
            var login  = document.getElementById('nav-login');
            var pinned = false;

            /* ── Scroll → floating pill ── */
            function applyScroll() {
              var s = window.scrollY > 28;
              if (s === pinned) return;
              pinned = s;
              if (s) {
                nav.style.padding = '10px 20px';
                pill.style.maxWidth = '860px';
                pill.style.margin = '0 auto';
                pill.style.borderRadius = '20px';
                pill.style.borderColor = 'rgba(255,255,255,0.28)';
                pill.style.boxShadow =
                  '0 1px 0 rgba(255,255,255,0.9) inset,' +
                  '0 4px 8px rgba(0,0,0,0.04),' +
                  '0 14px 36px rgba(0,0,0,0.11),' +
                  '0 0 0 1px rgba(0,0,0,0.05)';
              } else {
                nav.style.padding = '0';
                pill.style.maxWidth = '100%';
                pill.style.margin = '0';
                pill.style.borderRadius = '0';
                pill.style.borderColor = 'rgba(0,0,0,0.07)';
                pill.style.boxShadow = 'none';
              }
            }
            window.addEventListener('scroll', applyScroll, { passive: true });
            applyScroll();

            /* ── Liquid highlight ── */
            links.forEach(function(link) {
              link.addEventListener('mouseenter', function() {
                var lr = this.getBoundingClientRect();
                var wr = wrap.getBoundingClientRect();
                hl.style.opacity = '1';
                hl.style.width  = lr.width  + 'px';
                hl.style.height = lr.height + 'px';
                hl.style.left   = (lr.left - wr.left) + 'px';
                hl.style.top    = (lr.top  - wr.top)  + 'px';
              });
              link.addEventListener('mouseleave', function() {
                hl.style.opacity = '0';
              });
            });

            /* ── Login button shadow depth ── */
            if (login) {
              login.addEventListener('mouseenter', function() {
                this.style.boxShadow =
                  '0 2px 6px rgba(0,0,0,0.07),' +
                  '0 8px 22px rgba(0,0,0,0.11),' +
                  'inset 0 1px 0 rgba(255,255,255,0.95)';
              });
              login.addEventListener('mouseleave', function() {
                this.style.boxShadow =
                  '0 1px 3px rgba(0,0,0,0.06),' +
                  'inset 0 1px 0 rgba(255,255,255,0.85)';
              });
              login.addEventListener('mousedown', function() {
                this.style.boxShadow =
                  '0 1px 2px rgba(0,0,0,0.05),' +
                  'inset 0 1px 0 rgba(255,255,255,0.7)';
              });
              login.addEventListener('mouseup', function() {
                this.style.boxShadow =
                  '0 2px 6px rgba(0,0,0,0.07),' +
                  '0 8px 22px rgba(0,0,0,0.11),' +
                  'inset 0 1px 0 rgba(255,255,255,0.95)';
              });
            }
          })();
        `}} />

        <style>{`
          @media (max-width: 768px) {
            .footer-grid {
              grid-template-columns: 1fr 1fr !important;
              gap: 32px !important;
            }
          }
          @media (max-width: 480px) {
            .footer-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </body>
    </html>
  )
}
