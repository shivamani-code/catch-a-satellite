(function (root) {
  'use strict';

  var serial = 0;
  var directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  var ns = 'http://www.w3.org/2000/svg';

  function escapeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function xy(point) {
    var radius = 130 * (90 - point.el) / 90;
    var radians = point.az * Math.PI / 180;
    return { x: 150 + radius * Math.sin(radians), y: 150 - radius * Math.cos(radians) };
  }

  function smoothPath(points) {
    var d = 'M ' + points[0].x + ' ' + points[0].y;
    for (var i = 0; i < points.length - 1; i++) {
      var previous = points[i - 1] || points[i];
      var current = points[i];
      var next = points[i + 1];
      var after = points[i + 2] || next;
      var c1x = current.x + (next.x - previous.x) / 6;
      var c1y = current.y + (next.y - previous.y) / 6;
      var c2x = next.x - (after.x - current.x) / 6;
      var c2y = next.y - (after.y - current.y) / 6;
      d += ' C ' + c1x + ' ' + c1y + ', ' + c2x + ' ' + c2y + ', ' + next.x + ' ' + next.y;
    }
    return d;
  }

  function interpolate(points, time) {
    for (var i = 1; i < points.length; i++) {
      if (time <= points[i].t) {
        var a = points[i - 1];
        var b = points[i];
        var ratio = (time - a.t) / (b.t - a.t || 1);
        var delta = ((b.az - a.az + 540) % 360) - 180;
        return { az: (a.az + delta * ratio + 360) % 360, el: a.el + (b.el - a.el) * ratio };
      }
    }
    return points[points.length - 1];
  }

  function compass(az) {
    return directions[Math.round((((Number(az) % 360) + 360) % 360) / 45) % 8];
  }

  function render(container, pass, opts) {
    opts = opts || {};
    pass = pass || {};
    var points = (pass.points || []).filter(function (p) {
      return p && isFinite(p.t) && isFinite(p.az) && isFinite(p.el);
    });
    if (!container || !points.length) {
      if (container) container.innerHTML = '';
      return;
    }

    var color = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(pass.color || '') ? pass.color : '#ffffff';
    var id = 'skyplot-gradient-' + (++serial);
    var coords = points.map(xy);
    var peak = pass.max || points.reduce(function (best, p) { return p.el > best.el ? p : best; }, points[0]);
    var peakXY = xy(peak);
    var rise = coords[0];
    var set = coords[coords.length - 1];
    var title = (pass.label || 'Satellite pass') + ', maximum elevation ' + Math.round(peak.el) + ' degrees toward ' + compass(peak.az);
    var svg = '<svg xmlns="' + ns + '" viewBox="0 0 300 300" width="100%" role="img" aria-label="' + escapeText(title) + '" style="max-width:340px;height:auto;display:block">';
    svg += '<defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + rise.x + '" y1="' + rise.y + '" x2="' + set.x + '" y2="' + set.y + '"><stop offset="0%" stop-color="' + color + '" stop-opacity=".35"/><stop offset="100%" stop-color="' + color + '" stop-opacity="1"/></linearGradient><marker id="' + id + '-arrow" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 Z" fill="' + color + '"/></marker></defs>';
    svg += '<g fill="none" stroke="rgba(160,190,255,0.18)" stroke-width="1">';
    [130, 130 * 2 / 3, 130 / 3].forEach(function (r) { svg += '<circle cx="150" cy="150" r="' + r + '"/>'; });
    svg += '<path d="M150 20V280 M20 150H280"/></g>';
    svg += '<g fill="#9fb0cf" font-family="system-ui,sans-serif" font-size="10">';
    svg += '<text x="153" y="26">0 deg</text><text x="153" y="69">30 deg</text><text x="153" y="112">60 deg</text>';
    svg += '<text x="150" y="11" text-anchor="middle">N</text><text x="289" y="153" text-anchor="middle">E</text><text x="150" y="298" text-anchor="middle">S</text><text x="11" y="153" text-anchor="middle">W</text></g>';
    if (coords.length > 1) svg += '<path d="' + smoothPath(coords) + '" fill="none" stroke="url(#' + id + ')" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#' + id + '-arrow)"/>';
    svg += '<circle cx="' + rise.x + '" cy="' + rise.y + '" r="4" fill="none" stroke="' + color + '" stroke-width="2"/><text x="' + (rise.x + 7) + '" y="' + (rise.y - 6) + '" fill="#9fb0cf" font-family="system-ui,sans-serif" font-size="10">rise</text>';
    svg += '<circle cx="' + peakXY.x + '" cy="' + peakXY.y + '" r="3.5" fill="' + color + '"/><text x="' + (peakXY.x + 7) + '" y="' + (peakXY.y - 7) + '" fill="#9fb0cf" font-family="system-ui,sans-serif" font-size="10">' + Math.round(peak.el) + '°</text>';

    if (opts.now != null && opts.now >= points[0].t && opts.now <= points[points.length - 1].t) {
      var live = xy(interpolate(points, opts.now));
      svg += '<circle class="sky-now" cx="' + live.x + '" cy="' + live.y + '" r="5" fill="' + color + '" opacity="1"><animate attributeName="r" values="5;9;5" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/></circle>';
    }
    svg += '</svg>';
    container.innerHTML = svg;
  }

  root.SkyPlot = { render: render, compass: compass };
}(window));
