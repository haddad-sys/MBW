/* ===========================================================================
   متابِع — DOM helpers, the icon set and the charts.
   Icons replace lucide-react and the charts replace recharts, drawn directly
   so the page carries no external dependency.
   =========================================================================== */
(function () {
  'use strict';
  var M = window.MUT;
  var toAr = M.toAr;

  /* ── DOM ──────────────────────────────────────── */
  function h(tag, attrs, kids) {
    var n = document.createElement(tag), a = attrs || {}, k;
    for (k in a) {
      var v = a[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, String(v));
    }
    var list = Array.isArray(kids) ? kids : (kids === undefined || kids === null ? [] : [kids]);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c === null || c === undefined || c === false || c === '') continue;
      /* Text is set as text, never parsed — a title or comment cannot become markup. */
      n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function mount(node, kids) {
    while (node.firstChild) node.removeChild(node.firstChild);
    var list = Array.isArray(kids) ? kids : [kids];
    for (var i = 0; i < list.length; i++) if (list[i]) node.appendChild(list[i]);
    return node;
  }

  /* Same icon set as the delivered build, drawn inline. */
  var ICONS = {
    home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
    library: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    baby: '<path d="M9 12h.01M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/>',
    food: '<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v6M10 3v8a3 3 0 0 1-3 3"/><path d="M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9"/>',
    boxes: '<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>',
    shopping: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>',
    grad: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-9 9a2.8 2.8 0 0 1-4-4l9-9z"/><path d="M14.7 6.3 18 3l3 3-3.3 3.3"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9 9 0 0 1-4-1L3 20l1-3.8A8.4 8.4 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
    fileDown: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v5M10 15l2 2 2-2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    fileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    checkSquare: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    barChart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5M12 4v12"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'
  };
  function ic(name, size, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size || 18);
    s.setAttribute('height', size || 18);
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = ICONS[name] || ICONS.list;
    s.style.flexShrink = '0';
    return s;
  }

  /* ── charts: the recharts views, drawn directly ── */
  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) n.setAttribute(k, String(attrs[k]));
    return n;
  }
  function donut(data, height) {
    height = height || 190;
    var total = data.reduce(function (s, d) { return s + d.value; }, 0);
    var box = h('div', { style: { width: '100%', height: height + 'px' } });
    if (!total) return box;
    var size = height, cx = size / 2, cy = size / 2, rOut = size * 0.38, rIn = size * 0.22;
    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: '100%', height: '100%' });
    var angle = -Math.PI / 2;
    data.forEach(function (d) {
      var frac = d.value / total;
      var sweep = frac * Math.PI * 2;
      var end = angle + sweep;
      if (frac >= 0.9999) {
        var ring = svgEl('circle', { cx: cx, cy: cy, r: (rOut + rIn) / 2, fill: 'none', stroke: d.color, 'stroke-width': rOut - rIn });
        svg.appendChild(ring);
      } else {
        var large = sweep > Math.PI ? 1 : 0;
        var x1 = cx + rOut * Math.cos(angle), y1 = cy + rOut * Math.sin(angle);
        var x2 = cx + rOut * Math.cos(end), y2 = cy + rOut * Math.sin(end);
        var x3 = cx + rIn * Math.cos(end), y3 = cy + rIn * Math.sin(end);
        var x4 = cx + rIn * Math.cos(angle), y4 = cy + rIn * Math.sin(angle);
        var dPath = 'M' + x1 + ' ' + y1 + ' A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2
          + ' L' + x3 + ' ' + y3 + ' A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 + ' Z';
        var p = svgEl('path', { d: dPath, fill: d.color, stroke: '#fff', 'stroke-width': 2 });
        p.appendChild(svgEl('title', {})).textContent = d.name + ': ' + toAr(d.value);
        svg.appendChild(p);
      }
      angle = end;
    });
    var label = svgEl('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': size * 0.16, 'font-weight': '700', fill: '#334155' });
    label.textContent = toAr(total);
    svg.appendChild(label);
    box.appendChild(svg);
    return box;
  }
  function hbars(data) {
    var max = data.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    return h('div', { class: 'space-y-2' }, data.map(function (d) {
      return h('div', { class: 'flex items-center gap-2' }, [
        h('div', { class: 'text-xs text-slate-600 flex-shrink-0 truncate', style: { width: '62px' } }, d.name),
        h('div', { class: 'flex-1 bg-slate-100 rounded-full', style: { height: '10px' } }, [
          h('div', { class: 'rounded-full', style: { height: '10px', width: Math.round(d.value / max * 100) + '%', background: d.color || '#0ea5e9', minWidth: d.value ? '6px' : '0' } })
        ]),
        h('div', { class: 'text-xs text-slate-400', style: { width: '20px' } }, toAr(d.value))
      ]);
    }));
  }
  function vbars(data, height) {
    height = height || 150;
    var max = data.reduce(function (m, d) { return Math.max(m, d.value); }, 0) || 1;
    return h('div', { class: 'flex items-end justify-center gap-3', style: { height: height + 'px' } },
      data.map(function (d) {
        var barH = Math.max(4, Math.round(d.value / max * (height - 42)));
        return h('div', { class: 'flex flex-col items-center gap-1', style: { flex: '1', maxWidth: '68px' } }, [
          h('div', { class: 'text-xs text-slate-600 font-semibold' }, toAr(d.value)),
          h('div', { class: 'w-full rounded', style: { height: barH + 'px', background: d.color || '#0ea5e9', borderRadius: '6px 6px 0 0' } }),
          h('div', { class: 'text-xs text-slate-500 truncate w-full text-center' }, d.name)
        ]);
      }));
  }


  window.UI = {
    h: h, mount: mount, ic: ic, ICONS: ICONS,
    donut: donut, hbars: hbars, vbars: vbars
  };
}());
