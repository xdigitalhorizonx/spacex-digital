/* ============================================================
   spacex.digital — data engine + interactions
   Data: baked snapshot (instant paint + fallback) → live refresh
   from The Space Devs' Launch Library 2 (CC BY 4.0), cached in
   localStorage. Real data or an honest empty state — never faked.
   ============================================================ */
(function () {
  'use strict';
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DATA = null;
  var API = 'https://ll.thespacedevs.com/2.2.0';
  var LSP = 121;
  var CACHE_KEY = 'sxd_live_v3';
  var CACHE_MS = 30 * 60 * 1000; // 30 min

  /* ---------- utilities ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtDate(iso) { if (!iso) return '—'; var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' }); }
  function fmtDateShort(iso) { if (!iso) return '—'; var d = new Date(iso); if (isNaN(d)) return '—';
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
  function fmtWindow(iso) { if (!iso) return '—'; var d = new Date(iso); if (isNaN(d)) return '—';
    return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ' · ' + fmtDateShort(iso); }
  function num(n) { return (n == null ? '—' : Number(n).toLocaleString('en-US')); }
  function relTime(ms) { var s = Math.round(ms / 1000); if (s < 60) return s + 's ago';
    var m = Math.round(s / 60); if (m < 60) return m + ' min ago'; var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; }

  /* ---------- boot ---------- */
  function boot() {
    fetch('assets/data/spacex-data.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('snapshot ' + r.status); return r.json(); })
      .then(function (d) { DATA = d; renderAll('snapshot'); liveRefresh(); })
      .catch(function (e) { console.warn('[spacex.digital] snapshot load failed', e); snapshotFail(); });
  }
  function snapshotFail() {
    // Static HTML remains (real seed content); just mark feed state honestly.
    setPill('stale', 'STATIC');
    var f = $('#footUpdated'); if (f) f.textContent = 'Live feed unavailable — showing built-in snapshot.';
  }

  function renderAll(sourceLabel) {
    try { renderCountdown(); } catch (e) { console.warn(e); }
    try { renderStats(); } catch (e) { console.warn(e); }
    try { renderSilhouettes(); } catch (e) { console.warn(e); }
    try { renderCompare(currentMetric); } catch (e) { console.warn(e); }
    try { renderCadence(); } catch (e) { console.warn(e); }
    try { renderLog(); } catch (e) { console.warn(e); }
    stampUpdated(sourceLabel);
  }

  function stampUpdated(sourceLabel) {
    var gen = DATA && DATA.generated_at ? new Date(DATA.generated_at) : null;
    var when = DATA && DATA._liveAt ? new Date(DATA._liveAt) : gen;
    var live = !!(DATA && DATA._liveAt);
    var txt = live ? ('Live · updated ' + relTime(Date.now() - when.getTime()))
                   : (gen ? ('Snapshot · ' + fmtDate(DATA.generated_at)) : 'Loaded');
    var cu = $('#cdUpdated'); if (cu) cu.textContent = txt;
    var fu = $('#footUpdated');
    if (fu) fu.textContent = (live ? 'Live data' : 'Data snapshot') + ' · last updated ' +
      (when ? when.toUTCString().replace('GMT', 'UTC') : '—') + '.';
    setPill(live ? 'live' : 'stale', live ? 'DATA LIVE' : 'SNAPSHOT');
  }
  function setPill(state, text) {
    var p = $('#livePill'), t = $('#livePillText'); if (!p) return;
    p.classList.toggle('stale', state !== 'live');
    if (t) t.textContent = text;
  }

  /* ---------- live refresh (best-effort) ---------- */
  function liveRefresh() {
    var cached = readCache();
    if (cached) { mergeLive(cached); return; }
    Promise.all([
      fetchJSON(API + '/launch/upcoming/?lsp__id=' + LSP + '&limit=6'),
      fetchJSON(API + '/launch/previous/?lsp__id=' + LSP + '&limit=20'),
      fetchJSON(API + '/agencies/' + LSP + '/')
    ]).then(function (res) {
      var live = { upcoming: slimList(res[0]), previous: slimList(res[1]), agency: res[2], _liveAt: Date.now() };
      writeCache(live); mergeLive(live);
    }).catch(function (e) { console.info('[spacex.digital] live refresh skipped:', e.message); });
  }
  function fetchJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function slimList(resp) {
    if (!resp || !resp.results) return [];
    return resp.results.map(function (l) {
      var rc = (l.rocket && l.rocket.configuration) || {};
      var m = l.mission || {};
      var pad = l.pad || {};
      return {
        id: l.id, name: l.name, status: (l.status || {}).name, status_abbrev: (l.status || {}).abbrev,
        net: l.net, window_start: l.window_start, window_end: l.window_end,
        rocket: rc.name, mission: m.name, mission_type: m.type,
        orbit: (m.orbit || {}).name, orbit_abbrev: (m.orbit || {}).abbrev,
        pad: pad.name, location: (pad.location || {}).name,
        webcast: (l.vidURLs && l.vidURLs[0] && l.vidURLs[0].url) || null, failreason: l.failreason || ''
      };
    });
  }
  function mergeLive(live) {
    if (!DATA) DATA = {};
    if (live.upcoming && live.upcoming.length) DATA.upcoming = live.upcoming;
    if (live.previous && live.previous.length) DATA.previous = live.previous;
    if (live.agency) {
      var a = live.agency, s = DATA.stats || {};
      s.total_launch_count = a.total_launch_count != null ? a.total_launch_count : s.total_launch_count;
      s.successful_launches = a.successful_launches != null ? a.successful_launches : s.successful_launches;
      s.failed_launches = a.failed_launches != null ? a.failed_launches : s.failed_launches;
      s.consecutive_successful_launches = a.consecutive_successful_launches != null ? a.consecutive_successful_launches : s.consecutive_successful_launches;
      s.pending_launches = a.pending_launches != null ? a.pending_launches : s.pending_launches;
      var done = (s.successful_launches || 0) + (s.failed_launches || 0);
      if (done) s.success_rate = Math.round(1000 * s.successful_launches / done) / 10;
      DATA.stats = s;
    }
    DATA._liveAt = live._liveAt || Date.now();
    // re-render live-dependent parts (skip count-up re-trigger)
    try { renderCountdown(); } catch (e) {}
    try { updateStatValues(); } catch (e) {}
    try { renderLog(); } catch (e) {}
    stampUpdated('live');
  }
  function readCache() {
    try { var raw = localStorage.getItem(CACHE_KEY); if (!raw) return null;
      var o = JSON.parse(raw); if (!o._liveAt || Date.now() - o._liveAt > CACHE_MS) return null; return o;
    } catch (e) { return null; }
  }
  function writeCache(o) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(o)); } catch (e) {} }

  /* ---------- countdown ---------- */
  var cdTimer = null, cdTarget = null;
  function nextLaunch() {
    var list = (DATA && DATA.upcoming) || [];
    var now = Date.now(), soon = null;
    for (var i = 0; i < list.length; i++) {
      var t = new Date(list[i].net).getTime();
      if (!isNaN(t) && t > now - 30 * 60 * 1000) { soon = list[i]; break; }
    }
    return soon || list[0] || null;
  }
  function renderCountdown() {
    var L = nextLaunch(); if (!L) return;
    cdTarget = new Date(L.net).getTime();
    var mission = (L.rocket ? L.rocket + ' · ' : '') + (L.mission || L.name || 'Next mission');
    setText('#cdMission', mission);
    setText('#cdVehicle', L.rocket_full || L.rocket || '—');
    setText('#cdPad', (L.pad ? L.pad : '') + (L.location ? (L.pad ? ', ' : '') + shortLoc(L.location) : '') || '—');
    setText('#cdOrbit', L.orbit || (L.orbit_abbrev || '—'));
    setText('#cdWindow', fmtWindow(L.net));
    // status badge
    var b = $('#cdStatus'); if (b) {
      var st = (L.status_abbrev || L.status || '').toLowerCase();
      b.className = 'badge';
      if (st.indexOf('go') === 0) { b.classList.add('go'); b.textContent = 'GO'; }
      else if (st.indexOf('hold') >= 0 || st.indexOf('fail') >= 0) { b.classList.add('hold'); b.textContent = (L.status_abbrev || 'HOLD').toUpperCase(); }
      else { b.classList.add('idle'); b.textContent = (L.status_abbrev || 'TBD').toUpperCase(); }
    }
    // webcast button
    var wb = $('#watchBtn');
    if (wb && L.webcast) { wb.setAttribute('href', L.webcast); wb.setAttribute('target', '_blank');
      wb.setAttribute('rel', 'noopener'); wb.textContent = 'Watch the webcast'; }
    if (cdTimer) clearInterval(cdTimer);
    tick(); cdTimer = setInterval(tick, 1000);
  }
  function shortLoc(s) { if (!s) return ''; return s.split(',')[0]; }
  function tick() {
    if (cdTarget == null) return;
    var diff = cdTarget - Date.now();
    if (diff <= 0) {
      // within/after window — show T-0 and try to advance
      setCD(0, 0, 0, 0);
      var b = $('#cdStatus'); if (b && diff > -3 * 3600 * 1000) { b.className = 'badge idle'; b.textContent = 'T-0'; }
      if (diff < -30 * 60 * 1000) { renderCountdown(); } // launch passed → next
      return;
    }
    var s = Math.floor(diff / 1000);
    var d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600;
    var m = Math.floor(s / 60); s -= m * 60;
    setCD(d, h, m, s);
  }
  function setCD(d, h, m, s) {
    setText('#cdD', pad2(d)); setText('#cdH', pad2(h)); setText('#cdM', pad2(m)); setText('#cdS', pad2(s));
  }
  function setText(sel, t) { var el = $(sel); if (el) el.textContent = t; }

  /* ---------- stats (count-up + live update) ---------- */
  function renderStats() {
    updateStatValues();
    if (RM) { $$('.cval').forEach(function (el) { var v = el.closest('.stat').getAttribute('data-count');
      var dec = +(el.closest('.stat').getAttribute('data-dec') || 0);
      el.textContent = Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); io.unobserve(e.target); } });
    }, { threshold: .4 });
    $$('.stat[data-count]').forEach(function (s) { io.observe(s); });
  }
  function updateStatValues() {
    var s = (DATA && DATA.stats) || {};
    setStat(0, s.total_launch_count);
    setStat(1, s.success_rate);
    setStat(2, s.consecutive_successful_launches);
    // index 3 (Falcon 9 flights) from launcher data
    var f9 = DATA && DATA.launchers && DATA.launchers.falcon9;
    if (f9 && f9.total_launch_count) setStat(3, f9.total_launch_count);
    setStat(4, s.pending_launches);
  }
  function setStat(idx, val) {
    if (val == null) return;
    var tiles = $$('.stat[data-count]');
    var t = tiles[idx]; if (!t) return;
    t.setAttribute('data-count', val);
  }
  function countUp(tile) {
    var end = parseFloat(tile.getAttribute('data-count')); if (isNaN(end)) return;
    var dec = parseInt(tile.getAttribute('data-dec') || '0', 10);
    var dur = parseInt(tile.getAttribute('data-dur') || '1100', 10);
    var el = tile.querySelector('.cval'); if (!el) return;
    var t0 = null;
    function step(ts) { if (!t0) t0 = ts; var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3); var v = end * e;
      el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = end.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    }
    requestAnimationFrame(step);
  }

  /* ---------- to-scale rocket silhouettes ---------- */
  function renderSilhouettes() {
    var row = $('#scaleRow'); if (!row) return;
    var L = (DATA && DATA.launchers) || {};
    var H = 300; // px for the tallest (Starship)
    var maxM = 123;
    var pxm = H / maxM;
    var rockets = [
      { key: 'falcon9', name: 'Falcon 9', m: 70, w: 16, kind: 'f9' },
      { key: 'falconheavy', name: 'Falcon Heavy', m: 70, w: 40, kind: 'fh' },
      { key: 'starship', name: 'Starship', m: 123, w: 34, kind: 'ss' }
    ];
    row.innerHTML = rockets.map(function (r) {
      var h = Math.round(r.m * pxm);
      return '<div class="silhouette"><div class="sil-svg">' + rocketSVG(r.kind, r.w, h) +
        '</div><span class="sil-name">' + r.name + '</span><span class="sil-h">' + r.m + ' m</span></div>';
    }).join('');
  }
  function rocketSVG(kind, w, h) {
    var W = w + 10, cx = W / 2;
    var fill = 'url(#gBody)', stroke = 'rgba(160,190,230,.5)';
    var defs = '<defs><linearGradient id="gBody" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#26344f"/><stop offset=".5" stop-color="#c9d6ee"/><stop offset="1" stop-color="#26344f"/></linearGradient>' +
      '<linearGradient id="gFlame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB27A"/><stop offset="1" stop-color="#FF7A2F"/></linearGradient></defs>';
    var svg = '<svg width="' + W + '" height="' + (h + 14) + '" viewBox="0 0 ' + W + ' ' + (h + 14) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1">';
    svg += defs;
    if (kind === 'f9') {
      var bw = w; var bx = cx - bw / 2; var nose = h * 0.12;
      svg += '<path d="M' + cx + ' 1 L' + (bx + bw) + ' ' + nose + ' L' + (bx + bw) + ' ' + (h - 6) + ' L' + bx + ' ' + (h - 6) + ' L' + bx + ' ' + nose + ' Z"/>';
      svg += '<line x1="' + cx + '" y1="' + (h * .55) + '" x2="' + cx + '" y2="' + (h * .55) + '"/>';
      // legs
      svg += '<path d="M' + bx + ' ' + (h - 6) + ' L' + (bx - 5) + ' ' + (h + 2) + '" stroke-width="2"/><path d="M' + (bx + bw) + ' ' + (h - 6) + ' L' + (bx + bw + 5) + ' ' + (h + 2) + '" stroke-width="2"/>';
    } else if (kind === 'fh') {
      var cw = w * 0.34; var gap = cw * 0.02;
      var centerX = cx; var side = cw + gap;
      var noseC = h * 0.10, noseS = h * 0.26;
      // side boosters
      svg += '<path d="M' + (centerX - side) + ' ' + noseS + ' q0 -8 ' + (cw/2) + ' -8 q' + (cw/2) + ' 0 ' + (cw/2) + ' 8 L' + (centerX - side + cw) + ' ' + (h - 6) + ' L' + (centerX - side) + ' ' + (h - 6) + ' Z"/>';
      svg += '<path d="M' + (centerX + side - cw) + ' ' + noseS + ' q0 -8 ' + (cw/2) + ' -8 q' + (cw/2) + ' 0 ' + (cw/2) + ' 8 L' + (centerX + side) + ' ' + (h - 6) + ' L' + (centerX + side - cw) + ' ' + (h - 6) + ' Z"/>';
      // center core
      svg += '<path d="M' + centerX + ' 1 L' + (centerX + cw/2) + ' ' + noseC + ' L' + (centerX + cw/2) + ' ' + (h - 6) + ' L' + (centerX - cw/2) + ' ' + (h - 6) + ' L' + (centerX - cw/2) + ' ' + noseC + ' Z"/>';
    } else { // starship: booster + ship
      var bw2 = w; var bx2 = cx - bw2 / 2; var split = h * 0.42; var nose = h * 0.10;
      // super heavy (bottom)
      svg += '<path d="M' + bx2 + ' ' + split + ' L' + (bx2 + bw2) + ' ' + split + ' L' + (bx2 + bw2) + ' ' + (h - 6) + ' q0 6 -' + (bw2/2) + ' 6 q-' + (bw2/2) + ' 0 -' + (bw2/2) + ' -6 Z"/>';
      // grid fins
      svg += '<rect x="' + (bx2 - 3) + '" y="' + (split + 6) + '" width="4" height="10"/><rect x="' + (bx2 + bw2 - 1) + '" y="' + (split + 6) + '" width="4" height="10"/>';
      // ship (top) with nosecone + flaps
      svg += '<path d="M' + cx + ' 1 q-' + (bw2/2) + ' ' + nose + ' -' + (bw2/2) + ' ' + (nose + 6) + ' L' + bx2 + ' ' + (split - 2) + ' L' + (bx2 + bw2) + ' ' + (split - 2) + ' L' + (bx2 + bw2) + ' ' + (nose + 6) + ' q0 -' + nose + ' -' + (bw2/2) + ' -' + nose + ' Z"/>';
      svg += '<path d="M' + bx2 + ' ' + (split - 14) + ' l-6 8 l6 4 Z"/><path d="M' + (bx2 + bw2) + ' ' + (split - 14) + ' l6 8 l-6 4 Z"/>';
    }
    svg += '</svg>';
    return svg;
  }

  /* ---------- comparison bars ---------- */
  var currentMetric = 'height';
  var METRICS = {
    height: { label: 'm', get: function (l) { return l.length; }, fix: 0 },
    leo: { label: 'kg', get: function (l) { return l.key === 'starship' ? (l.design_leo_capacity || l.leo_capacity) : l.leo_capacity; }, fix: 0 },
    thrust: { label: 'kN', get: function (l) { return l.to_thrust; }, fix: 0 },
    flights: { label: '', get: function (l) { return l.total_launch_count; }, fix: 0 }
  };
  function fleetList() {
    var L = (DATA && DATA.launchers) || {};
    return [
      assign(L.falcon9, 'falcon9', 'Falcon 9'),
      assign(L.falconheavy, 'falconheavy', 'Falcon Heavy'),
      assign(L.starship, 'starship', 'Starship')
    ].filter(Boolean);
  }
  function assign(o, key, name) { if (!o) return null; o.key = key; o.dispName = name; return o; }
  function renderCompare(metric) {
    var box = $('#cmpBars'); if (!box) return;
    var list = fleetList(); if (!list.length) { box.innerHTML = '<p class="log-empty">Vehicle data unavailable.</p>'; return; }
    var M = METRICS[metric] || METRICS.height;
    var vals = list.map(function (l) { return M.get(l) || 0; });
    var max = Math.max.apply(null, vals) || 1;
    var maxIdx = vals.indexOf(max);
    box.innerHTML = list.map(function (l, i) {
      var v = vals[i]; var pct = Math.max(3, Math.round(100 * v / max));
      var dv = metric === 'height' ? Math.round(v) : v;
      var disp = num(dv) + (M.label ? ' ' + M.label : '');
      if (metric === 'leo' && l.key === 'starship') disp += ' *';
      return '<div class="bar-row' + (i === maxIdx ? ' hot' : '') + '">' +
        '<span class="bl">' + esc(l.dispName) + '</span>' +
        '<span class="bar-track"><span class="bar-fill" data-pct="' + pct + '"></span></span>' +
        '<span class="bar-val">' + disp + '</span></div>';
    }).join('');
    // footnote
    var foot = $('#cmpFoot');
    if (foot) foot.innerHTML = metric === 'leo'
      ? 'Payload to low-Earth orbit. <span class="mut">* Starship shows its design target; it is in flight testing.</span>'
      : metric === 'flights' ? 'Successful and total flights to date, live from public data.'
      : metric === 'thrust' ? 'Total sea-level thrust at liftoff.'
      : 'Height, nose to base — drawn to scale above.';
    // animate widths
    requestAnimationFrame(function () {
      $$('.bar-fill', box).forEach(function (f) { f.style.width = (RM ? f.getAttribute('data-pct') : f.getAttribute('data-pct')) + '%'; });
    });
  }
  function initCompare() {
    var seg = $('#cmpSeg'); if (!seg) return;
    seg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-metric]'); if (!b) return;
      $$('button', seg).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-selected', 'true');
      currentMetric = b.getAttribute('data-metric'); renderCompare(currentMetric);
    });
  }

  /* ---------- cadence chart ---------- */
  function renderCadence() {
    var el = $('#cadenceChart'); if (!el) return;
    var y = (DATA && DATA.launches_per_year) || {};
    var years = Object.keys(y).sort();
    if (!years.length) { el.innerHTML = '<p class="log-empty">Cadence data unavailable.</p>'; return; }
    var max = Math.max.apply(null, years.map(function (k) { return y[k]; })) || 1;
    var peak = years.reduce(function (a, k) { return y[k] > y[a] ? k : a; }, years[0]);
    el.innerHTML = years.map(function (k) {
      var pct = Math.max(2, Math.round(100 * y[k] / max));
      return '<div class="cbar' + (k === peak ? ' peak' : '') + '"><span class="cv">' + y[k] + '</span>' +
        '<span class="fill" data-pct="' + pct + '"></span><span class="cy">’' + k.slice(2) + '</span></div>';
    }).join('');
    var run = function () { $$('.cbar .fill', el).forEach(function (f) { f.style.height = f.getAttribute('data-pct') + '%'; }); };
    if (RM) { run(); return; }
    var io = new IntersectionObserver(function (ents) { ents.forEach(function (e) {
      if (e.isIntersecting) { run(); io.disconnect(); } }); }, { threshold: .3 });
    io.observe(el);
  }

  /* ---------- flight log explorer ---------- */
  var logState = { filter: 'all', q: '', limit: 8 };
  function allLaunches() {
    var up = ((DATA && DATA.upcoming) || []).map(function (x) { var y = Object.assign({}, x); y._up = true; return y; });
    var pv = ((DATA && DATA.previous) || []).map(function (x) { var y = Object.assign({}, x); y._up = false; return y; });
    // upcoming ascending soonest-first already; previous newest-first
    return up.concat(pv);
  }
  function matchRow(l) {
    if (logState.filter === 'upcoming' && !l._up) return false;
    if (logState.filter !== 'all' && logState.filter !== 'upcoming' && l.rocket !== logState.filter) return false;
    if (logState.q) {
      var hay = ((l.mission || '') + ' ' + (l.name || '') + ' ' + (l.rocket || '') + ' ' + (l.orbit || '')).toLowerCase();
      if (hay.indexOf(logState.q) < 0) return false;
    }
    return true;
  }
  function badgeFor(l) {
    if (l._up) { var st = (l.status_abbrev || '').toLowerCase();
      if (st.indexOf('go') === 0) return ['b-go', 'GO'];
      return ['b-idle', (l.status_abbrev || 'TBD').toUpperCase()]; }
    var s = (l.status || l.status_abbrev || '').toLowerCase();
    if (s.indexOf('fail') >= 0 || s.indexOf('partial') >= 0) return ['b-fail', 'FAILURE'];
    return ['b-ok', 'SUCCESS'];
  }
  function renderLog() {
    var list = $('#logList'); if (!list) return;
    var rows = allLaunches().filter(matchRow);
    if (!rows.length) { list.innerHTML = '<li class="log-empty">No missions match — try clearing the search or filter.</li>';
      var mb0 = $('#logMore'); if (mb0) mb0.hidden = true; return; }
    var shown = rows.slice(0, logState.limit);
    list.innerHTML = shown.map(function (l) {
      var b = badgeFor(l);
      var name = l.mission || l.name || 'Mission';
      var nameHtml = l.webcast ? '<a href="' + esc(l.webcast) + '" target="_blank" rel="noopener">' + esc(name) + '</a>' : esc(name);
      return '<li class="log-row"><span class="lr-date">' + fmtDateShort(l.net) + '</span>' +
        '<span class="lr-name">' + nameHtml + '</span>' +
        '<span class="lr-rocket">' + esc(l.rocket || '—') + '</span>' +
        '<span class="lr-orbit">' + esc(l.orbit_abbrev || l.orbit || '—') + '</span>' +
        '<span class="lr-badge ' + b[0] + '">' + b[1] + '</span></li>';
    }).join('');
    var mb = $('#logMore'); if (mb) { mb.hidden = rows.length <= logState.limit; }
  }
  function initLog() {
    var s = $('#logSearch');
    if (s) s.addEventListener('input', function () { logState.q = s.value.trim().toLowerCase(); logState.limit = 8; renderLog(); });
    var chips = $('#logChips');
    if (chips) chips.addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      $$('.chip', chips).forEach(function (x) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      c.classList.add('on'); c.setAttribute('aria-pressed', 'true');
      logState.filter = c.getAttribute('data-filter'); logState.limit = 8; renderLog();
    });
    var mb = $('#logMore'); if (mb) mb.addEventListener('click', function () { logState.limit += 10; renderLog(); });
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    if (RM || !('IntersectionObserver' in window)) return;
    var sel = '.sec-head, .stat, .rocket-card, .scale-stage, .compare, .chart-wrap, .tl li, .faq details, .about-inner, .countdown';
    var els = $$(sel);
    var io = new IntersectionObserver(function (ents) { ents.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el, i) { el.classList.add('reveal'); io.observe(el); });
    // safety: reveal anything still hidden after load
    window.addEventListener('load', function () { setTimeout(function () {
      $$('.reveal:not(.in)').forEach(function (el) { var r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('in'); }); }, 400); });
  }

  /* ---------- hero starfield ---------- */
  function initStars() {
    var cv = $('#heroStars'); if (!cv || RM) return;
    var ctx = cv.getContext('2d'); var stars = [], w, h, dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var running = true;
    function size() { var r = cv.getBoundingClientRect(); w = cv.width = Math.floor(r.width * dpr); h = cv.height = Math.floor(r.height * dpr);
      var n = Math.min(90, Math.floor(r.width * r.height / 14000)); stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * w, y: Math.random() * h,
        z: Math.random() * .8 + .2, tw: Math.random() * Math.PI * 2 }); }
    size();
    var t = 0;
    function draw() { if (!running) return; t += .016; ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < stars.length; i++) { var s = stars[i];
        var a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.tw))) * s.z;
        var rad = s.z * 1.4 * dpr;
        ctx.fillStyle = 'rgba(180,205,255,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, rad, 0, 6.28318); ctx.fill();
        s.y += s.z * 0.12 * dpr; if (s.y > h) { s.y = 0; s.x = Math.random() * w; }
      }
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(draw);
    }
    var raf = requestAnimationFrame(draw);
    window.addEventListener('resize', debounce(size, 200));
    // pause when hero off-screen
    var hero = $('.hero');
    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { running = e[0].isIntersecting;
        if (running) raf = requestAnimationFrame(draw); }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', function () { running = !document.hidden && isHeroVisible(hero);
      if (running) raf = requestAnimationFrame(draw); });
    function isHeroVisible(el) { if (!el) return false; var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  /* ---------- easter egg: launch sequence ---------- */
  function initEgg() {
    var buf = '', KEY = 'launch';
    var konami = [38,38,40,40,37,39,37,39,66,65], ki = 0;
    window.addEventListener('keydown', function (e) {
      // konami
      if (e.keyCode === konami[ki]) { ki++; if (ki === konami.length) { ki = 0; sequence(); } } else { ki = (e.keyCode === konami[0]) ? 1 : 0; }
      // typed word
      var c = (e.key || '').toLowerCase();
      if (c.length === 1 && /[a-z]/.test(c)) { buf = (buf + c).slice(-KEY.length);
        if (buf === KEY && !document.querySelector('input:focus,textarea:focus')) sequence(); }
    });
    console.log('%c▲ spacex.digital %c type "LAUNCH" for liftoff. Godspeed. ',
      'background:#FF7A2F;color:#150a02;font-weight:700;padding:3px 6px;border-radius:4px 0 0 4px',
      'background:#0C1220;color:#8FC4FF;padding:3px 8px;border-radius:0 4px 4px 0');
  }
  var seqRunning = false;
  function sequence() {
    if (seqRunning) return; seqRunning = true;
    var ov = $('#launchSeq'), cnt = $('#lsCount'), word = $('#lsWord');
    ov.classList.add('on'); ov.setAttribute('aria-hidden', 'false');
    var n = 3;
    cnt.style.display = ''; word.classList.remove('show'); cnt.textContent = n;
    if (RM) { // reduced motion: quiet sequence
      cnt.style.display = 'none'; word.textContent = 'LIFTOFF'; word.classList.add('show');
      toast('▲ Liftoff. Godspeed, spacex.digital.');
      setTimeout(endSeq, 2200); return;
    }
    var iv = setInterval(function () {
      n--; if (n > 0) { cnt.textContent = n; }
      else { clearInterval(iv); cnt.style.display = 'none';
        word.textContent = 'LIFTOFF'; word.classList.add('show');
        document.body.classList.add('shake'); setTimeout(function(){document.body.classList.remove('shake');}, 600);
        plume(); toast('▲ Liftoff. You have the conn.');
        setTimeout(endSeq, 2600); }
    }, 850);
  }
  function endSeq() { var ov = $('#launchSeq'); ov.classList.remove('on'); ov.setAttribute('aria-hidden', 'true');
    var w = $('#lsWord'); if (w) w.classList.remove('show'); seqRunning = false; }
  function plume() {
    var cv = $('#lsCanvas'); if (!cv) return; var ctx = cv.getContext('2d');
    var w = cv.width = innerWidth, h = cv.height = innerHeight, P = [], t0 = performance.now();
    for (var i = 0; i < 140; i++) P.push({ x: w/2 + (Math.random()-.5)*60, y: h*.62, vx:(Math.random()-.5)*3,
      vy: -(Math.random()*7+4), life: Math.random()*1+.6, born: 0 });
    (function anim(t) { var dt = (t - t0)/1000; ctx.clearRect(0,0,w,h); ctx.globalCompositeOperation='lighter';
      var alive=false;
      for (var i=0;i<P.length;i++){ var p=P[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.12; var a=1-dt/p.life;
        if(a>0){alive=true; ctx.fillStyle='rgba(255,'+Math.floor(150+80*a)+',80,'+a.toFixed(2)+')';
          ctx.beginPath(); ctx.arc(p.x,p.y,3+3*a,0,6.283); ctx.fill(); } }
      if (alive && dt < 2.6) requestAnimationFrame(anim); else ctx.clearRect(0,0,w,h);
    })(t0);
  }
  var toastTimer;
  function toast(msg) { var t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3600); }

  /* ---------- misc ---------- */
  function initMisc() {
    var yr = $('#yr'); if (yr) yr.textContent = new Date().getUTCFullYear();
    // grain layer
    var g = document.createElement('div'); g.className = 'grain'; document.body.appendChild(g);
    // nav shadow on scroll
    var nav = $('#nav'); if (nav) { var onScroll = function () { nav.style.boxShadow = window.scrollY > 20 ? '0 10px 30px -18px rgba(0,0,0,.8)' : 'none'; };
      onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); }
  }

  /* ---------- go ---------- */
  function init() { initMisc(); initCompare(); initLog(); initReveal(); initStars(); initEgg(); boot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
