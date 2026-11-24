/* Klien API tunggal Mongso AgriPlan: harga SISKAPERBAPO, cuaca Open-Meteo,
   warta tani RSS, manajemen titik lahan, dan kalkulator rencana tanam. */

(function () {
  "use strict";

  var REGENCIES = [
    "Kab. Kediri", "Kota Kediri", "Kab. Malang", "Kota Malang",
    "Kab. Nganjuk", "Kab. Banyuwangi", "Kota Batu", "Kota Surabaya",
    "Kab. Sidoarjo", "Kab. Probolinggo"
  ];

  var COMMODITIES = [
    { id: 1, name: "Cabai Rawit", icon: "🌶️" },
    { id: 2, name: "Bawang Merah", icon: "🧅" },
    { id: 3, name: "Cabai Merah Besar", icon: "🌶️" },
    { id: 4, name: "Tomat", icon: "🍅" },
    { id: 5, name: "Kentang", icon: "🥔" },
    { id: 6, name: "Kubis / Kol", icon: "🥬" },
    { id: 7, name: "Bawang Putih", icon: "🧄" },
    { id: 8, name: "Cabai Merah Keriting", icon: "🌶️" },
    { id: 9, name: "Buncis", icon: "🫛" },
    { id: 10, name: "Wortel", icon: "🥕" },
    { id: 11, name: "Ketela Pohon", icon: "🍠" }
  ];

  var DEFAULT_REGENCY = "Kab. Kediri";

  var store = {
    get: function (key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); } catch (e) {}
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) {}
    }
  };

  var state = {
    regency: store.get("mongso-regency") || DEFAULT_REGENCY,
    token: store.get("mongso_token") || null,
    user: null
  };

  if (REGENCIES.indexOf(state.regency) === -1) state.regency = DEFAULT_REGENCY;

  var nf = new Intl.NumberFormat("id-ID");

  function num(value, digits) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return new Intl.NumberFormat("id-ID", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0
    }).format(Number(value));
  }

  function rupiah(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return "Rp " + nf.format(Math.round(Number(value)));
  }

  function compactRupiah(value) {
    if (value === null || value === undefined) return "-";
    var n = Number(value);
    if (Math.abs(n) >= 1e9) return "Rp " + num(n / 1e9, 1) + " M";
    if (Math.abs(n) >= 1e6) return "Rp " + num(n / 1e6, 1) + " jt";
    if (Math.abs(n) >= 1e3) return "Rp " + num(n / 1e3, 0) + " rb";
    return rupiah(n);
  }

  function pct(value, digits) {
    if (value === null || value === undefined) return "-";
    var n = Number(value);
    return (n > 0 ? "+" : n < 0 ? "−" : "") + num(Math.abs(n), digits === undefined ? 1 : digits) + "%";
  }

  function shortDate(iso) {
    if (!iso) return "-";
    var d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
  }

  function clock(iso) {
    if (!iso) return "-";
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
    });
  }

  function todayLabel() {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(new Date()).toUpperCase();
  }

  function shiftDate(iso, days) {
    var d = new Date(String(iso || "").slice(0, 10) + "T00:00:00");
    if (Number.isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function lineChart(values, labels) {
    var clean = (values || []).map(Number).filter(function (v) { return !Number.isNaN(v); });
    if (clean.length < 2) return "";
    var compact = window.matchMedia("(max-width: 680px)").matches;
    var width = compact ? 360 : 720;
    var height = compact ? 220 : 300;
    var left = compact ? 44 : 58, right = compact ? 16 : 20, top = 20, bottom = compact ? 36 : 40;
    var innerW = width - left - right;
    var innerH = height - top - bottom;
    var min = Math.min.apply(null, clean);
    var max = Math.max.apply(null, clean);
    var span = max - min || 1;
    var lo = min - span * 0.12;
    var hi = max + span * 0.12;
    var range = hi - lo || 1;
    var step = innerW / (clean.length - 1);

    function xAt(i) { return left + i * step; }
    function yAt(v) { return top + (1 - (v - lo) / range) * innerH; }

    var points = clean.map(function (value, index) {
      return xAt(index).toFixed(1) + " " + yAt(value).toFixed(1);
    });
    var path = "M" + points.join(" L");
    var area = path + " L" + xAt(clean.length - 1).toFixed(1) + " " + (top + innerH).toFixed(1) +
      " L" + xAt(0).toFixed(1) + " " + (top + innerH).toFixed(1) + " Z";

    var grid = "";
    for (var g = 0; g <= 4; g++) {
      var y = top + (innerH / 4) * g;
      var value = hi - (range / 4) * g;
      grid += '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (width - right) + '" y2="' + y.toFixed(1) +
        '" stroke="#e8e4dc" stroke-width="1"' + (g === 4 ? "" : ' stroke-dasharray="4 4"') + '/>' +
        '<text x="' + (left - 10) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" ' +
        'font-family="IBM Plex Mono, monospace" font-size="' + (compact ? 9 : 10) + '" fill="#4e5951">' +
        num(value, 0) + "</text>";
    }

    var xLabels = "";
    var last = clean.length - 1;
    var labelIdx = compact ? [0, last] : [0, Math.floor(last / 3), Math.floor((2 * last) / 3), last];
    labelIdx.forEach(function (index) {
      if (index < 0 || index > last) return;
      if (!labels || !labels[index]) return;
      var x = xAt(index);
      var anchor = index === 0 ? "start" : index === last ? "end" : "middle";
      xLabels += '<text x="' + x.toFixed(1) + '" y="' + (height - 10) + '" text-anchor="' + anchor + '" ' +
        'font-family="IBM Plex Mono, monospace" font-size="' + (compact ? 9 : 10) + '" fill="#4e5951">' +
        escapeHtml(labels[index]) + "</text>";
    });

    var dots = clean.map(function (value, index) {
      var x = xAt(index), y = yAt(value);
      var outer = index === 0 || index === last ? 4.5 : 3.2;
      var inner = index === 0 || index === last ? 2 : 0;
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + outer + '" fill="#fff" stroke="#23533e" stroke-width="2"/>' +
        (inner ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + inner + '" fill="#23533e"/>' : "");
    }).join("");

    var baseVal = clean[0] || 1;
    var hits = clean.map(function (value, index) {
      var x = xAt(index), y = yAt(value);
      var hitW = Math.max(12, step);
      var hitX = Math.max(left, x - hitW / 2);
      var lbl = (labels && labels[index]) ? labels[index] : ("Hari ke-" + (index + 1));
      var diffPct = ((value - baseVal) / baseVal) * 100;
      var sub = index === 0 ? "Awal periode" : (pct(diffPct) + " vs " + ((labels && labels[0]) || "awal"));
      return '<rect class="chart-hit" tabindex="0" x="' + hitX.toFixed(1) + '" y="' + top + '" width="' + hitW.toFixed(1) +
        '" height="' + innerH + '" fill="transparent" data-x="' + x.toFixed(1) + '" data-y="' + y.toFixed(1) +
        '" data-pct-x="' + ((x / width) * 100).toFixed(1) + '" data-title="' + escapeHtml(lbl) +
        '" data-main="' + escapeHtml(rupiah(value) + "/kg") + '" data-sub="' + escapeHtml(sub) +
        '" aria-label="' + escapeHtml(lbl + ": " + rupiah(value) + " per kg (" + sub + ")") + '"/>';
    }).join("");

    var uid = "lc" + Math.random().toString(36).slice(2, 7);
    return '<div class="chart-interactive" data-chart-interactive>' +
      '<div class="chart-tooltip" hidden></div>' +
      '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik interaktif pergerakan harga">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#23533e" stop-opacity="0.22"/>' +
      '<stop offset="100%" stop-color="#23533e" stop-opacity="0.02"/></linearGradient></defs>' +
      grid +
      '<path d="' + area + '" fill="url(#' + uid + ')"/>' +
      '<path d="' + path + '" fill="none" stroke="#23533e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<line class="chart-guide" x1="0" y1="' + top + '" x2="0" y2="' + (top + innerH) + '" stroke="#163323" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>' +
      dots +
      '<circle class="chart-focus-dot" cx="0" cy="0" r="6" fill="#23533e" stroke="#fff" stroke-width="2.5" opacity="0"/>' +
      xLabels + hits + "</svg></div>";
  }

  function miniForecast(days) {
    return (days || []).slice(0, 4).map(function (day, index) {
      return '<div class="mini-day">' +
        "<span>" + escapeHtml(index === 0 ? "Hari ini" : (day.weekday || "")) + "</span>" +
        '<span class="mini-icon" aria-hidden="true">' + escapeHtml(day.icon || "☀️") + "</span>" +
        "<strong>" + num(day.temp_max_c, 0) + "°</strong></div>";
    }).join("");
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function riskClass(score) {
    if (score >= 70) return "badge--danger";
    if (score >= 40) return "badge--warn";
    return "";
  }

  function riskColor(score) {
    if (score >= 70) return "#b5382a";
    if (score >= 40) return "#8a5c07";
    return "#23533e";
  }

  var API_BASE = (function () {
    try {
      var custom = window.localStorage.getItem("mongso_api_base") || window.MONGSO_API_BASE;
      if (custom) return String(custom).replace(/\/+$/, "");
    } catch (e) {}
    return "";
  })();

  function request(path, options) {
    var opts = options || {};
    var headers = { "Accept": "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (state.token) headers["Authorization"] = "Bearer " + state.token;

    var fullUrl = (path.indexOf("http:") === 0 || path.indexOf("https:") === 0)
      ? path
      : (API_BASE + path);

    return fetch(fullUrl, {
      method: opts.method || "GET",
      headers: headers,
      credentials: "same-origin",
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (!response.ok) {
          var detail = payload && payload.detail;
          if (Array.isArray(detail)) detail = detail.map(function (d) { return d.msg; }).join(", ");
          var error = new Error(detail || "Permintaan gagal (" + response.status + ")");
          error.status = response.status;
          throw error;
        }
        return payload;
      });
    });
  }

  function apiGet(path, query) {
    var url = path;
    if (query) {
      var pairs = [];
      Object.keys(query).forEach(function (key) {
        if (query[key] !== undefined && query[key] !== null && query[key] !== "") {
          pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(query[key]));
        }
      });
      if (pairs.length) url += "?" + pairs.join("&");
    }
    return request(url);
  }

  function apiPost(path, body) {
    return request(path, { method: "POST", body: body === undefined ? {} : body });
  }

  function apiDelete(path) {
    return request(path, { method: "DELETE" });
  }

  function sparkline(values, options) {
    var opts = options || {};
    var width = opts.width || 84;
    var height = opts.height || 24;
    var pad = 2;
    var clean = (values || []).map(Number).filter(function (v) { return !Number.isNaN(v); });
    if (clean.length < 2) return "";
    var min = Math.min.apply(null, clean);
    var max = Math.max.apply(null, clean);
    var span = max - min || 1;
    var points = clean.map(function (value, index) {
      var x = pad + (index * (width - pad * 2)) / (clean.length - 1);
      var y = height - pad - ((value - min) / span) * (height - pad * 2);
      return x.toFixed(1) + " " + y.toFixed(1);
    });
    var path = "M" + points.join(" L");
    return '<svg class="sparkline" viewBox="0 0 ' + width + " " + height + '" aria-hidden="true" focusable="false">' +
      '<path d="' + path + '" fill="none" stroke="' + (opts.color || "#23533e") +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  function rainChart(values, labels) {
    var clean = (values || []).map(Number);
    if (!clean.length) return "";
    var compact = window.matchMedia("(max-width: 680px)").matches;
    var width = compact ? 340 : 640, height = compact ? 160 : 150;
    var padX = compact ? 16 : 30, padY = 16, gap = compact ? 7 : 10;
    var max = Math.max.apply(null, clean.concat([1]));
    var barWidth = (width - padX * 2 - gap * (clean.length - 1)) / clean.length;

    var bars = clean.map(function (value, index) {
      var h = Math.max(2, (value / max) * (height - padY * 2 - 16));
      var x = padX + index * (barWidth + gap);
      var y = height - padY - h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barWidth.toFixed(1) +
        '" height="' + h.toFixed(1) + '" rx="3" fill="' + (index === 0 ? "#a54c1f" : "#bfd3b8") + '"/>' +
        '<text x="' + (x + barWidth / 2).toFixed(1) + '" y="' + (height - 2) + '" text-anchor="middle" ' +
        'font-family="IBM Plex Mono, monospace" font-size="' + (compact ? 9 : 8) + '" fill="#4e5951">' +
        escapeHtml(labels && labels[index] ? String(labels[index]).slice(-5) : "") + "</text>" +
        '<text x="' + (x + barWidth / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle" ' +
        'font-family="Inter, sans-serif" font-size="' + (compact ? 10 : 9) + '" font-weight="600" fill="#4a574e">' +
        (value > 0 ? num(value, 1) : "") + "</text>";
    }).join("");

    return '<svg viewBox="0 0 ' + width + " " + height + '" role="img" aria-label="Curah hujan tujuh hari terakhir dalam milimeter">' +
      '<line x1="' + padX + '" y1="' + (height - padY) + '" x2="' + (width - padX) + '" y2="' + (height - padY) +
      '" stroke="#e3ded5" stroke-width="1"/>' + bars + "</svg>";
  }

  function hourlyChart(hours) {
    var compact = window.matchMedia("(max-width: 680px)").matches;
    var list = (hours || []).slice(0, 24);
    if (list.length < 2) return "";
    var width = compact ? 360 : 760;
    var height = compact ? 200 : 240;
    var left = compact ? 38 : 46, right = compact ? 12 : 16, top = 16, bottom = compact ? 28 : 30;
    var labelStep = compact ? 4 : 3;
    var axisFont = compact ? 10 : 10;
    var innerW = width - left - right;
    var innerH = height - top - bottom;

    var temps = list.map(function (h) { return Number(h.temp_c); });
    var rains = list.map(function (h) { return Number(h.rain_mm) || 0; });
    var minT = Math.min.apply(null, temps);
    var maxT = Math.max.apply(null, temps);
    var padT = Math.max(1, (maxT - minT) * 0.18);
    var loT = minT - padT;
    var hiT = maxT + padT;
    var spanT = hiT - loT || 1;
    var maxR = Math.max.apply(null, rains.concat([1]));

    var step = innerW / (list.length - 1);
    function xAt(i) { return left + i * step; }
    function yAt(v) { return top + (1 - (v - loT) / spanT) * innerH; }

    var tempPoints = temps.map(function (value, index) {
      return xAt(index).toFixed(1) + " " + yAt(value).toFixed(1);
    });
    var tempPath = "M" + tempPoints.join(" L");
    var tempArea = tempPath + " L" + xAt(list.length - 1).toFixed(1) + " " + (top + innerH).toFixed(1) +
      " L" + xAt(0).toFixed(1) + " " + (top + innerH).toFixed(1) + " Z";

    var grid = "";
    for (var g = 0; g <= 3; g++) {
      var y = top + (innerH / 3) * g;
      var val = hiT - (spanT / 3) * g;
      grid += '<line x1="' + left + '" y1="' + y.toFixed(1) + '" x2="' + (width - right) + '" y2="' + y.toFixed(1) +
        '" stroke="#e8e4dc" stroke-width="1"' + (g === 3 ? "" : ' stroke-dasharray="4 4"') + '/>' +
        '<text x="' + (left - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" ' +
        'font-family="IBM Plex Mono, monospace" font-size="' + axisFont + '" fill="#4e5951">' +
        num(val, 0) + "°</text>";
    }

    var rainBars = rains.map(function (value, index) {
      var h = (value / maxR) * innerH * 0.42;
      var x = xAt(index) - step * 0.28;
      var y = top + innerH - h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (step * 0.56).toFixed(1) +
        '" height="' + Math.max(value > 0 ? 2 : 0, h).toFixed(1) + '" rx="2" fill="#cfe0d4" opacity="0.9"/>';
    }).join("");

    var labels = list.map(function (hour, index) {
      if (index % labelStep !== 0 && index !== list.length - 1) return "";
      var x = xAt(index);
      var last = index === list.length - 1;
      var anchor = last ? "end" : index === 0 ? "start" : "middle";
      var labelX = last ? width - 2 : x;
      return '<text x="' + labelX.toFixed(1) + '" y="' + (height - 6) + '" text-anchor="' + anchor + '" ' +
        'font-family="IBM Plex Mono, monospace" font-size="' + (compact ? 9 : 10) + '" fill="#4e5951">' +
        escapeHtml(hour.hour_label || "") + "</text>";
    }).join("");

    var dots = temps.map(function (value, index) {
      if (index % labelStep !== 0 && index !== 0 && index !== list.length - 1) return "";
      var x = xAt(index);
      var y = yAt(value);
      var r = (index === 0 || index === list.length - 1) ? 4 : 3;
      return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="#fff" stroke="#23533e" stroke-width="2"/>';
    }).join("");

    var hits = list.map(function (hour, index) {
      var value = temps[index];
      var rainVal = rains[index];
      var prob = Number(hour.rain_prob_pct) || 0;
      var x = xAt(index), y = yAt(value);
      var hitW = Math.max(10, step);
      var hitX = Math.max(left, x - hitW / 2);
      var title = "Pukul " + (hour.hour_label || "-") + (hour.condition ? " · " + hour.condition : "");
      var main = num(value, 0) + "°C";
      var sub = "Hujan " + num(rainVal, 1) + " mm" + (prob ? " · Peluang " + num(prob, 0) + "%" : "");
      return '<rect class="chart-hit" tabindex="0" x="' + hitX.toFixed(1) + '" y="' + top + '" width="' + hitW.toFixed(1) +
        '" height="' + innerH + '" fill="transparent" data-x="' + x.toFixed(1) + '" data-y="' + y.toFixed(1) +
        '" data-pct-x="' + ((x / width) * 100).toFixed(1) + '" data-title="' + escapeHtml(title) +
        '" data-main="' + escapeHtml(main) + '" data-sub="' + escapeHtml(sub) +
        '" aria-label="' + escapeHtml(title + ": " + main + ", " + sub) + '"/>';
    }).join("");

    var uid = "hc" + Math.random().toString(36).slice(2, 7);
    return '<div class="chart-interactive" data-chart-interactive>' +
      '<div class="chart-tooltip" hidden></div>' +
      '<svg viewBox="0 0 ' + width + " " + height + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik interaktif suhu dan curah hujan per jam">' +
      '<defs><linearGradient id="' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#23533e" stop-opacity="0.18"/>' +
      '<stop offset="100%" stop-color="#23533e" stop-opacity="0.01"/></linearGradient></defs>' +
      grid + rainBars +
      '<path d="' + tempArea + '" fill="url(#' + uid + ')"/>' +
      '<path d="' + tempPath + '" fill="none" stroke="#23533e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<line class="chart-guide" x1="0" y1="' + top + '" x2="0" y2="' + (top + innerH) + '" stroke="#163323" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>' +
      dots +
      '<circle class="chart-focus-dot" cx="0" cy="0" r="6" fill="#23533e" stroke="#fff" stroke-width="2.5" opacity="0"/>' +
      labels + hits + "</svg></div>";
  }

  function gauge(score) {
    var radius = 62;
    var circumference = 2 * Math.PI * radius;
    var clamped = Math.max(0, Math.min(100, Number(score) || 0));
    /* Keep a visible tick at zero so the ring never looks broken. */
    var arc = Math.max(clamped, 2);
    var offset = circumference * (1 - arc / 100);
    return '<svg viewBox="0 0 150 150" aria-hidden="true" focusable="false">' +
      '<circle cx="75" cy="75" r="' + radius + '" fill="none" stroke="#ece8e1" stroke-width="11"/>' +
      '<circle cx="75" cy="75" r="' + radius + '" fill="none" stroke="' + riskColor(clamped) +
      '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + circumference.toFixed(1) +
      '" stroke-dashoffset="' + offset.toFixed(1) + '"/></svg>';
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function setHtml(id, value) {
    var node = document.getElementById(id);
    if (node) node.innerHTML = value;
  }

  function errorState(target, message, retry) {
    if (!target) return;
    if (!message) { target.innerHTML = ""; return; }
    target.innerHTML = '<div class="error-state">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>' +
      '<div><strong>Data belum bisa dimuat.</strong>' + escapeHtml(message) +
      (retry ? '<br><button class="btn btn--ghost btn--sm" type="button" data-retry> Coba lagi</button>' : "") +
      "</div></div>";
    if (retry) {
      var button = target.querySelector("[data-retry]");
      if (button) button.addEventListener("click", retry);
    }
  }

  function skeletonRows(columns, rows) {
    var html = "";
    for (var r = 0; r < (rows || 4); r++) {
      html += "<tr>";
      for (var c = 0; c < columns; c++) {
        html += '<td><div class="skeleton skeleton-line" style="width:' + (55 + ((r + c) % 4) * 12) + '%"></div></td>';
      }
      html += "</tr>";
    }
    return html;
  }

  var accountRoot = document.querySelector("[data-account]");
  var accountGuest = accountRoot ? accountRoot.querySelector(".account-guest") : null;
  var accountTrigger = accountRoot ? accountRoot.querySelector(".account-trigger") : null;
  var accountMenu = accountRoot ? accountRoot.querySelector(".account-menu") : null;
  var loginButton = accountRoot ? accountRoot.querySelector(".account-login-btn") : null;
  var registerButton = accountRoot ? accountRoot.querySelector(".account-register-btn") : null;
  var logoutButton = accountRoot ? accountRoot.querySelector(".account-logout") : null;
  var mobileNavFooter = document.querySelector(".mobile-nav-footer");
  var loginDialog = document.getElementById("account-login");
  var authTabsWrap = document.getElementById("auth-tabs");
  var loginForm = document.getElementById("login-form");
  var loginOtpForm = document.getElementById("login-otp-form");
  var registerForm = document.getElementById("register-form");
  var verifyForm = document.getElementById("verify-form");
  var resetForm = document.getElementById("reset-form");
  var loginError = document.getElementById("login-error");
  var loginInfo = document.getElementById("login-info");
  var registerError = document.getElementById("register-error");
  var verifyError = document.getElementById("verify-error");
  var verifyInfo = document.getElementById("verify-info");
  var resetError = document.getElementById("reset-error");
  var resetInfo = document.getElementById("reset-info");
  var authTabs = loginDialog ? loginDialog.querySelectorAll("[data-auth-tab]") : [];
  var authPanels = loginDialog ? loginDialog.querySelectorAll(".auth-panel") : [];
  var loginModeButtons = loginDialog ? loginDialog.querySelectorAll("[data-login-mode]") : [];
  var registerRegency = document.getElementById("register-regency");

  var authUiState = {
    pendingVerifyEmail: "",
    loginOtpSent: false,
    loginOtpEmail: "",
    resetSent: false,
    resetEmail: "",
    googleClientId: null,
    googleLoaded: false,
    configLoaded: false
  };

  if (registerRegency) {
    registerRegency.innerHTML = REGENCIES.map(function (name) {
      return '<option value="' + escapeHtml(name) + '"' + (name === state.regency ? " selected" : "") + ">" +
        escapeHtml(name) + "</option>";
    }).join("");
  }

  function initials(name) {
    return String(name || "M")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) { return part.charAt(0).toUpperCase(); })
      .join("");
  }

  function closeMenu() {
    if (accountMenu) accountMenu.hidden = true;
    if (accountTrigger) accountTrigger.setAttribute("aria-expanded", "false");
  }

  function performLogout() {
    closeMenu();
    apiPost("/api/v1/auth/logout", null).catch(function () {}).then(function () {
      state.token = null;
      state.user = null;
      store.remove("mongso_token");
      renderAccount();
      document.dispatchEvent(new CustomEvent("mongso:account", { detail: { user: null } }));
    });
  }

  function renderMobileFooterAccount(signedIn) {
    if (!mobileNavFooter) return;
    if (signedIn && state.user) {
      var name = state.user.full_name || "Akun Mongso";
      var place = state.user.regency || "Jawa Timur";
      mobileNavFooter.innerHTML =
        '<div class="mobile-nav-user">' +
        '<span class="avatar" aria-hidden="true">' + escapeHtml(initials(name)) + "</span>" +
        '<div class="mobile-nav-user-copy"><strong>' + escapeHtml(name) + "</strong><span>" + escapeHtml(place) + "</span></div>" +
        "</div>" +
        '<button class="btn btn--outline-earth w-full" type="button" data-mobile-logout>Keluar dari Akun</button>';
      var mobileLogoutBtn = mobileNavFooter.querySelector("[data-mobile-logout]");
      if (mobileLogoutBtn) {
        mobileLogoutBtn.addEventListener("click", function () {
          var overlay = document.getElementById("mobile-nav-overlay");
          if (overlay && typeof overlay.close === "function") {
            try { overlay.close(); } catch (e) {}
          }
          document.body.classList.remove("nav-open", "scroll-lock", "no-scroll");
          document.body.style.overflow = "";
          performLogout();
        });
      }
    } else {
      mobileNavFooter.innerHTML =
        '<button class="btn btn--outline-earth w-full" type="button" data-open-register>Daftar Akun Baru</button>' +
        '<button class="btn btn--pine w-full" type="button" data-open-login>Masuk ke Akun</button>';
      mobileNavFooter.querySelectorAll("[data-open-login]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var closeBtn = document.getElementById("mobile-nav-close");
          if (closeBtn) closeBtn.click();
          openLogin();
        });
      });
      mobileNavFooter.querySelectorAll("[data-open-register]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var closeBtn = document.getElementById("mobile-nav-close");
          if (closeBtn) closeBtn.click();
          openRegister();
        });
      });
    }
  }

  function renderAccount() {
    if (!accountRoot) return;
    var signedIn = !!state.user;

    accountRoot.setAttribute("data-account-state", signedIn ? "signedin" : "signedout");

    if (accountGuest) accountGuest.hidden = signedIn;
    if (loginButton) loginButton.hidden = signedIn;
    if (registerButton) registerButton.hidden = signedIn;
    if (accountTrigger) accountTrigger.hidden = !signedIn;
    if (logoutButton) logoutButton.hidden = !signedIn;

    if (signedIn) {
      var name = state.user.full_name || "Akun Mongso";
      var place = state.user.regency || "Jawa Timur";
      setText("account-name", name);
      setText("account-loc", place + " · Akun Anda");
      setText("account-initials", initials(name));
      setText("account-menu-name", name);
      setText("account-menu-loc", (state.user.role ? state.user.role + " · " : "") + place);
    } else {
      setText("account-name", "");
      setText("account-loc", "");
      setText("account-initials", "");
    }
    renderMobileFooterAccount(signedIn);
    closeMenu();
  }

  function loadAccount() {
    if (!state.token) {
      state.user = null;
      renderAccount();
      return Promise.resolve();
    }
    return apiGet("/api/v1/auth/me").then(function (user) {
      state.user = user;
      renderAccount();
      document.dispatchEvent(new CustomEvent("mongso:account", { detail: { user: user } }));
    }).catch(function (error) {
      if (error.status === 401 || error.status === 403) {
        state.token = null;
        state.user = null;
        store.remove("mongso_token");
      }
      renderAccount();
    });
  }

  function clearAuthFeedback() {
    [loginError, loginInfo, registerError, verifyError, verifyInfo, resetError, resetInfo].forEach(function (el) {
      if (el) { el.hidden = true; el.innerHTML = ""; }
    });
  }

  function showAuthError(node, message) {
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
  }

  function showAuthInfo(node, message, devCode) {
    if (!node) return;
    var html = "<div>" + escapeHtml(message || "") + "</div>";
    if (devCode) {
      html += '<div class="dev-otp-box">Mode Uji Lokal (Email belum diatur) — Kode Anda: <strong class="dev-otp-code">' +
        escapeHtml(devCode) + "</strong></div>";
    }
    node.innerHTML = html;
    node.hidden = false;
  }

  function startResendCooldown(button, baseLabel, seconds) {
    if (!button) return;
    if (button._cooldownTimer) window.clearInterval(button._cooldownTimer);
    var remaining = seconds || 45;
    button.disabled = true;
    button.textContent = baseLabel + " (" + remaining + "d)";
    button._cooldownTimer = window.setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(button._cooldownTimer);
        button._cooldownTimer = null;
        button.disabled = false;
        button.textContent = baseLabel;
      } else {
        button.textContent = baseLabel + " (" + remaining + "d)";
      }
    }, 1000);
  }

  function setLoginMode(mode) {
    var isOtp = mode === "otp";
    loginModeButtons.forEach(function (btn) {
      btn.setAttribute("aria-pressed", String(btn.getAttribute("data-login-mode") === (isOtp ? "otp" : "password")));
    });
    if (loginForm) loginForm.hidden = isOtp;
    if (loginOtpForm) loginOtpForm.hidden = !isOtp;
    if (loginError) loginError.hidden = true;
    if (loginInfo) loginInfo.hidden = true;
    if (isOtp) {
      var pwEmail = document.getElementById("login-email");
      var otpEmail = document.getElementById("login-otp-email");
      if (pwEmail && otpEmail && !otpEmail.value && pwEmail.value) {
        otpEmail.value = pwEmail.value;
      }
    }
  }

  function setAuthTab(tab) {
    var target = (tab === "register" || tab === "verify" || tab === "reset") ? tab : "login";
    var showTabs = target === "login" || target === "register";
    if (authTabsWrap) authTabsWrap.hidden = !showTabs;

    authTabs.forEach(function (button) {
      var active = button.getAttribute("data-auth-tab") === target;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    authPanels.forEach(function (panel) {
      panel.hidden = panel.id !== "auth-panel-" + target;
    });

    if (target === "reset") {
      var loginEmailEl = document.getElementById("login-email");
      var resetEmailEl = document.getElementById("reset-email");
      if (loginEmailEl && resetEmailEl && !resetEmailEl.value && loginEmailEl.value) {
        resetEmailEl.value = loginEmailEl.value;
      }
    }
  }

  function renderGoogleButtons() {
    if (!authUiState.googleClientId || !window.google || !window.google.accounts || !window.google.accounts.id) return;
    if (!authUiState.googleLoaded) {
      window.google.accounts.id.initialize({
        client_id: authUiState.googleClientId,
        callback: function (response) {
          if (!response || !response.credential) return;
          clearAuthFeedback();
          apiPost("/api/v1/auth/google", {
            credential: response.credential,
            regency: state.regency
          }).then(function (payload) {
            completeAuth(payload);
          }).catch(function (error) {
            showAuthError(loginError, error.message || "Masuk dengan Google gagal. Coba lagi.");
            showAuthError(registerError, error.message || "Daftar dengan Google gagal. Coba lagi.");
          });
        }
      });
      authUiState.googleLoaded = true;
    }

    document.querySelectorAll("[data-google-auth]").forEach(function (wrap) {
      wrap.hidden = false;
    });
    document.querySelectorAll("[data-google-btn]").forEach(function (slot) {
      if (slot.getAttribute("data-rendered") === "1") return;
      var kind = slot.getAttribute("data-google-btn");
      slot.innerHTML = "";
      window.google.accounts.id.renderButton(slot, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: kind === "register" ? "signup_with" : "signin_with",
        locale: "id",
        width: Math.min(360, Math.max(260, (slot.parentElement && slot.parentElement.clientWidth) || 320))
      });
      slot.setAttribute("data-rendered", "1");
    });
  }

  function initAuthConfig() {
    if (authUiState.configLoaded || !loginDialog) return;
    authUiState.configLoaded = true;
    apiGet("/api/v1/auth/config").then(function (cfg) {
      if (cfg && cfg.google_client_id) {
        authUiState.googleClientId = cfg.google_client_id;
        if (window.google && window.google.accounts && window.google.accounts.id) {
          renderGoogleButtons();
        } else if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
          var script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.defer = true;
          script.onload = renderGoogleButtons;
          document.head.appendChild(script);
        }
      }
    }).catch(function () {});
  }

  function enterVerifyStep(email, message, devCode) {
    authUiState.pendingVerifyEmail = email;
    setText("verify-email-label", email);
    clearAuthFeedback();
    showAuthInfo(verifyInfo, message || "Masukkan kode verifikasi 6 digit yang dikirim ke email Anda.", devCode);
    var codeInput = document.getElementById("verify-code");
    if (codeInput) codeInput.value = "";
    setAuthTab("verify");
    startResendCooldown(document.getElementById("verify-resend-btn"), "Kirim ulang kode", 45);
    window.setTimeout(function () {
      if (codeInput) codeInput.focus();
    }, 40);
  }

  function openAuth(tab) {
    if (!loginDialog) return;
    closeMenu();
    clearAuthFeedback();
    initAuthConfig();
    if (tab === "login") setLoginMode("password");
    setAuthTab(tab);
    if (typeof loginDialog.showModal === "function") loginDialog.showModal();
    else loginDialog.setAttribute("open", "");
    if (authUiState.googleClientId) renderGoogleButtons();
    window.setTimeout(function () {
      var field = document.getElementById(tab === "register" ? "register-name" : "login-email");
      if (field) field.focus();
    }, 40);
  }

  function openLogin() { openAuth("login"); }
  function openRegister() { openAuth("register"); }

  function closeLogin() {
    if (!loginDialog) return;
    if (typeof loginDialog.close === "function") loginDialog.close();
    else loginDialog.removeAttribute("open");
  }

  function completeAuth(payload) {
    state.token = payload.token;
    state.user = payload.user;
    store.set("mongso_token", payload.token);
    renderAccount();
    closeLogin();
    if (loginForm) loginForm.reset();
    if (loginOtpForm) loginOtpForm.reset();
    if (registerForm) registerForm.reset();
    if (verifyForm) verifyForm.reset();
    if (resetForm) resetForm.reset();
    authUiState.loginOtpSent = false;
    authUiState.resetSent = false;
    var otpStep2 = document.getElementById("login-otp-step2");
    if (otpStep2) otpStep2.hidden = true;
    var otpSubmit = document.getElementById("login-otp-submit");
    if (otpSubmit) otpSubmit.textContent = "Kirim kode 6 digit";
    var resetStep2 = document.getElementById("reset-step2");
    if (resetStep2) resetStep2.hidden = true;
    var resetSubmit = document.getElementById("reset-submit");
    if (resetSubmit) resetSubmit.textContent = "Kirim kode reset";
    document.dispatchEvent(new CustomEvent("mongso:account", { detail: { user: state.user } }));
  }

  if (accountTrigger) {
    accountTrigger.addEventListener("click", function () {
      var willOpen = accountMenu.hidden;
      accountMenu.hidden = !willOpen;
      accountTrigger.setAttribute("aria-expanded", String(willOpen));
    });
  }

  if (loginButton) loginButton.addEventListener("click", openLogin);
  if (registerButton) registerButton.addEventListener("click", openRegister);

  document.querySelectorAll("[data-open-login]").forEach(function (button) {
    button.addEventListener("click", openLogin);
  });

  document.querySelectorAll("[data-open-register]").forEach(function (button) {
    button.addEventListener("click", openRegister);
  });

  authTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      clearAuthFeedback();
      setAuthTab(tab.getAttribute("data-auth-tab"));
    });
    tab.addEventListener("keydown", function (event) {
      var tabs = Array.prototype.slice.call(authTabs);
      var current = tabs.indexOf(event.currentTarget);
      var next = current;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      var targetTab = tabs[next];
      clearAuthFeedback();
      setAuthTab(targetTab.getAttribute("data-auth-tab"));
      targetTab.focus();
    });
  });

  loginModeButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setLoginMode(button.getAttribute("data-login-mode"));
    });
  });

  document.querySelectorAll("[data-auth-switch]").forEach(function (button) {
    button.addEventListener("click", function () {
      clearAuthFeedback();
      setAuthTab(button.getAttribute("data-auth-switch"));
    });
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", performLogout);
  }

  if (loginDialog) {
    var loginCancel = loginDialog.querySelector("#login-cancel");
    var registerCancel = loginDialog.querySelector("#register-cancel");
    if (loginCancel) loginCancel.addEventListener("click", closeLogin);
    if (registerCancel) registerCancel.addEventListener("click", closeLogin);

    loginDialog.addEventListener("click", function (event) {
      if (event.target === loginDialog) closeLogin();
    });

    loginDialog.querySelectorAll(".otp-input").forEach(function (input) {
      input.addEventListener("input", function () {
        input.value = String(input.value || "").replace(/\D/g, "").slice(0, 6);
      });
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var email = document.getElementById("login-email");
      var password = document.getElementById("login-password");
      var submit = loginForm.querySelector('button[type="submit"]');
      if (loginError) loginError.hidden = true;
      if (loginInfo) loginInfo.hidden = true;

      if (!email.value.trim() || !password.value) {
        return showAuthError(loginError, "Isi email dan kata sandi terlebih dahulu.");
      }

      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = "Memeriksa…";

      apiPost("/api/v1/auth/login", {
        email: email.value.trim(),
        password: password.value
      }).then(function (payload) {
        if (payload && payload.requires_verification) {
          enterVerifyStep(payload.email || email.value.trim(), payload.message, payload.dev_code);
        } else {
          completeAuth(payload);
        }
      }).catch(function (error) {
        showAuthError(loginError, error.message || "Masuk gagal. Periksa email dan kata sandi.");
      }).then(function () {
        submit.disabled = false;
        submit.textContent = label;
      });
    });
  }

  if (loginOtpForm) {
    var loginOtpEmailEl = document.getElementById("login-otp-email");
    var loginOtpStep2 = document.getElementById("login-otp-step2");
    var loginOtpCodeEl = document.getElementById("login-otp-code");
    var loginOtpSubmit = document.getElementById("login-otp-submit");
    var loginOtpResend = document.getElementById("login-otp-resend");

    function sendLoginOtpCode() {
      var emailVal = loginOtpEmailEl ? loginOtpEmailEl.value.trim() : "";
      if (!emailVal) return showAuthError(loginError, "Isi alamat email terdaftar terlebih dahulu.");
      if (loginError) loginError.hidden = true;
      if (loginOtpSubmit) {
        loginOtpSubmit.disabled = true;
        loginOtpSubmit.textContent = "Mengirim kode…";
      }

      apiPost("/api/v1/auth/login-code/request", { email: emailVal }).then(function (payload) {
        authUiState.loginOtpSent = true;
        authUiState.loginOtpEmail = emailVal;
        if (loginOtpStep2) loginOtpStep2.hidden = false;
        if (loginOtpSubmit) loginOtpSubmit.textContent = "Verifikasi & Masuk";
        showAuthInfo(loginInfo, payload.message, payload.dev_code);
        startResendCooldown(loginOtpResend, "Kirim ulang", 45);
        if (loginOtpCodeEl) {
          loginOtpCodeEl.value = "";
          loginOtpCodeEl.focus();
        }
      }).catch(function (error) {
        showAuthError(loginError, error.message || "Gagal mengirim kode masuk.");
        if (loginOtpSubmit) {
          loginOtpSubmit.textContent = authUiState.loginOtpSent ? "Verifikasi & Masuk" : "Kirim kode 6 digit";
        }
      }).then(function () {
        if (loginOtpSubmit) loginOtpSubmit.disabled = false;
      });
    }

    if (loginOtpEmailEl) {
      loginOtpEmailEl.addEventListener("input", function () {
        if (authUiState.loginOtpSent && loginOtpEmailEl.value.trim() !== authUiState.loginOtpEmail) {
          authUiState.loginOtpSent = false;
          if (loginOtpStep2) loginOtpStep2.hidden = true;
          if (loginOtpSubmit) loginOtpSubmit.textContent = "Kirim kode 6 digit";
        }
      });
    }

    if (loginOtpResend) {
      loginOtpResend.addEventListener("click", sendLoginOtpCode);
    }

    loginOtpForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (loginError) loginError.hidden = true;

      if (!authUiState.loginOtpSent) {
        sendLoginOtpCode();
        return;
      }

      var emailVal = loginOtpEmailEl ? loginOtpEmailEl.value.trim() : "";
      var codeVal = loginOtpCodeEl ? loginOtpCodeEl.value.trim() : "";
      if (codeVal.length !== 6) {
        return showAuthError(loginError, "Masukkan 6 digit kode verifikasi dari email Anda.");
      }

      if (loginOtpSubmit) {
        loginOtpSubmit.disabled = true;
        loginOtpSubmit.textContent = "Memverifikasi…";
      }

      apiPost("/api/v1/auth/login-code/verify", {
        email: emailVal,
        code: codeVal
      }).then(function (payload) {
        completeAuth(payload);
      }).catch(function (error) {
        showAuthError(loginError, error.message || "Kode verifikasi tidak valid.");
      }).then(function () {
        if (loginOtpSubmit) {
          loginOtpSubmit.disabled = false;
          loginOtpSubmit.textContent = "Verifikasi & Masuk";
        }
      });
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = document.getElementById("register-name");
      var email = document.getElementById("register-email");
      var password = document.getElementById("register-password");
      var confirm = document.getElementById("register-confirm");
      var role = document.getElementById("register-role");
      var regency = document.getElementById("register-regency");
      var submit = registerForm.querySelector('button[type="submit"]');
      if (registerError) registerError.hidden = true;

      if (!name.value.trim()) return showAuthError(registerError, "Isi nama lengkap terlebih dahulu.");
      if (!email.value.trim()) return showAuthError(registerError, "Isi alamat email terlebih dahulu.");
      if (password.value.length < 8) return showAuthError(registerError, "Kata sandi minimal 8 karakter.");
      if (password.value !== confirm.value) return showAuthError(registerError, "Kata sandi dan ulangannya belum sama.");

      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = "Mengirim kode…";

      apiPost("/api/v1/auth/register", {
        email: email.value.trim(),
        password: password.value,
        full_name: name.value.trim(),
        role: role ? role.value : "Petani Hortikultura",
        regency: regency ? regency.value : state.regency
      }).then(function (payload) {
        if (payload && payload.requires_verification) {
          enterVerifyStep(payload.email || email.value.trim(), payload.message, payload.dev_code);
        } else {
          completeAuth(payload);
        }
      }).catch(function (error) {
        showAuthError(registerError, error.message || "Pendaftaran gagal. Coba lagi.");
      }).then(function () {
        submit.disabled = false;
        submit.textContent = label;
      });
    });
  }

  if (verifyForm) {
    var verifyResendBtn = document.getElementById("verify-resend-btn");
    if (verifyResendBtn) {
      verifyResendBtn.addEventListener("click", function () {
        if (!authUiState.pendingVerifyEmail) return;
        if (verifyError) verifyError.hidden = true;
        verifyResendBtn.disabled = true;
        apiPost("/api/v1/auth/resend-code", { email: authUiState.pendingVerifyEmail })
          .then(function (payload) {
            showAuthInfo(verifyInfo, payload.message, payload.dev_code);
            startResendCooldown(verifyResendBtn, "Kirim ulang kode", 45);
          })
          .catch(function (error) {
            verifyResendBtn.disabled = false;
            showAuthError(verifyError, error.message || "Gagal mengirim ulang kode.");
          });
      });
    }

    verifyForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var codeInput = document.getElementById("verify-code");
      var submit = verifyForm.querySelector('button[type="submit"]');
      if (verifyError) verifyError.hidden = true;

      var codeVal = codeInput ? codeInput.value.trim() : "";
      if (codeVal.length !== 6) {
        return showAuthError(verifyError, "Masukkan 6 digit angka kode verifikasi.");
      }

      submit.disabled = true;
      var label = submit.textContent;
      submit.textContent = "Memverifikasi…";

      apiPost("/api/v1/auth/verify-email", {
        email: authUiState.pendingVerifyEmail,
        code: codeVal
      }).then(function (payload) {
        completeAuth(payload);
      }).catch(function (error) {
        showAuthError(verifyError, error.message || "Kode verifikasi salah atau kedaluwarsa.");
      }).then(function () {
        submit.disabled = false;
        submit.textContent = label;
      });
    });
  }

  if (resetForm) {
    var resetEmailEl = document.getElementById("reset-email");
    var resetStep2 = document.getElementById("reset-step2");
    var resetCodeEl = document.getElementById("reset-code");
    var resetPwEl = document.getElementById("reset-password");
    var resetSubmit = document.getElementById("reset-submit");
    var resetResendBtn = document.getElementById("reset-resend-btn");

    function sendResetCode() {
      var emailVal = resetEmailEl ? resetEmailEl.value.trim() : "";
      if (!emailVal) return showAuthError(resetError, "Masukkan alamat email terdaftar.");
      if (resetError) resetError.hidden = true;
      if (resetSubmit) {
        resetSubmit.disabled = true;
        resetSubmit.textContent = "Mengirim kode…";
      }

      apiPost("/api/v1/auth/forgot-password", { email: emailVal }).then(function (payload) {
        authUiState.resetSent = true;
        authUiState.resetEmail = emailVal;
        if (resetStep2) resetStep2.hidden = false;
        if (resetSubmit) resetSubmit.textContent = "Simpan sandi baru & Masuk";
        showAuthInfo(resetInfo, payload.message, payload.dev_code);
        startResendCooldown(resetResendBtn, "Kirim ulang", 45);
        if (resetCodeEl) {
          resetCodeEl.value = "";
          resetCodeEl.focus();
        }
      }).catch(function (error) {
        showAuthError(resetError, error.message || "Gagal mengirim kode reset sandi.");
        if (resetSubmit) {
          resetSubmit.textContent = authUiState.resetSent ? "Simpan sandi baru & Masuk" : "Kirim kode reset";
        }
      }).then(function () {
        if (resetSubmit) resetSubmit.disabled = false;
      });
    }

    if (resetEmailEl) {
      resetEmailEl.addEventListener("input", function () {
        if (authUiState.resetSent && resetEmailEl.value.trim() !== authUiState.resetEmail) {
          authUiState.resetSent = false;
          if (resetStep2) resetStep2.hidden = true;
          if (resetSubmit) resetSubmit.textContent = "Kirim kode reset";
        }
      });
    }

    if (resetResendBtn) {
      resetResendBtn.addEventListener("click", sendResetCode);
    }

    resetForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (resetError) resetError.hidden = true;

      if (!authUiState.resetSent) {
        sendResetCode();
        return;
      }

      var emailVal = resetEmailEl ? resetEmailEl.value.trim() : "";
      var codeVal = resetCodeEl ? resetCodeEl.value.trim() : "";
      var newPw = resetPwEl ? resetPwEl.value : "";

      if (codeVal.length !== 6) return showAuthError(resetError, "Masukkan 6 digit kode reset.");
      if (newPw.length < 8) return showAuthError(resetError, "Kata sandi baru minimal 8 karakter.");

      if (resetSubmit) {
        resetSubmit.disabled = true;
        resetSubmit.textContent = "Menyimpan…";
      }

      apiPost("/api/v1/auth/reset-password", {
        email: emailVal,
        code: codeVal,
        new_password: newPw
      }).then(function (payload) {
        completeAuth(payload);
      }).catch(function (error) {
        showAuthError(resetError, error.message || "Gagal mengatur ulang kata sandi.");
      }).then(function () {
        if (resetSubmit) {
          resetSubmit.disabled = false;
          resetSubmit.textContent = "Simpan sandi baru & Masuk";
        }
      });
    });
  }

  if (loginDialog) {
    loginDialog.querySelectorAll("[data-auth-close]").forEach(function (btn) {
      btn.addEventListener("click", closeLogin);
    });
    loginDialog.querySelectorAll("[data-toggle-pw]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var targetId = btn.getAttribute("data-toggle-pw");
        var input = document.getElementById(targetId);
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Sembunyikan" : "Lihat";
        btn.setAttribute("aria-pressed", String(show));
      });
    });

    var regPw = document.getElementById("register-password");
    var regConf = document.getElementById("register-confirm");
    var regHint = document.getElementById("register-pw-hint");
    function updatePwHint() {
      if (!regPw || !regHint) return;
      var val = regPw.value || "";
      var conf = regConf ? (regConf.value || "") : "";
      if (!val) {
        regHint.textContent = "Gunakan minimal 8 karakter.";
        regHint.className = "pw-hint";
      } else if (val.length < 8) {
        regHint.textContent = "Kurang " + (8 - val.length) + " karakter lagi (minimal 8 karakter).";
        regHint.className = "pw-hint is-warn";
      } else if (conf && val !== conf) {
        regHint.textContent = "Ulangan kata sandi belum cocok.";
        regHint.className = "pw-hint is-warn";
      } else if (conf && val === conf) {
        regHint.textContent = "Kata sandi kuat dan sudah cocok.";
        regHint.className = "pw-hint is-ok";
      } else {
        regHint.textContent = "Panjang kata sandi sudah memenuhi syarat (≥ 8 karakter).";
        regHint.className = "pw-hint is-ok";
      }
    }
    if (regPw) regPw.addEventListener("input", updatePwHint);
    if (regConf) regConf.addEventListener("input", updatePwHint);
  }

  function activateChartHit(hit) {
    if (!hit) return;
    var wrap = hit.closest("[data-chart-interactive]");
    if (!wrap) return;
    var tip = wrap.querySelector(".chart-tooltip");
    var guide = wrap.querySelector(".chart-guide");
    var dot = wrap.querySelector(".chart-focus-dot");
    var x = hit.getAttribute("data-x");
    var y = hit.getAttribute("data-y");
    var pctX = Number(hit.getAttribute("data-pct-x")) || 50;

    if (guide && x) {
      guide.setAttribute("x1", x);
      guide.setAttribute("x2", x);
      guide.setAttribute("opacity", "1");
    }
    if (dot && x && y) {
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      dot.setAttribute("opacity", "1");
    }
    if (tip) {
      tip.innerHTML = '<span class="chart-tip-title">' + escapeHtml(hit.getAttribute("data-title") || "") + "</span>" +
        '<strong class="chart-tip-main">' + escapeHtml(hit.getAttribute("data-main") || "") + "</strong>" +
        '<span class="chart-tip-sub">' + escapeHtml(hit.getAttribute("data-sub") || "") + "</span>";
      tip.hidden = false;
      var clamped = Math.max(14, Math.min(86, pctX));
      tip.style.left = clamped + "%";
    }
  }

  function clearChartInteractive(wrap) {
    if (!wrap) return;
    var tip = wrap.querySelector(".chart-tooltip");
    var guide = wrap.querySelector(".chart-guide");
    var dot = wrap.querySelector(".chart-focus-dot");
    if (tip) tip.hidden = true;
    if (guide) guide.setAttribute("opacity", "0");
    if (dot) dot.setAttribute("opacity", "0");
  }

  document.addEventListener("pointerover", function (event) {
    var hit = event.target.closest ? event.target.closest(".chart-hit") : null;
    if (hit) activateChartHit(hit);
  });
  document.addEventListener("focusin", function (event) {
    var hit = event.target.closest ? event.target.closest(".chart-hit") : null;
    if (hit) activateChartHit(hit);
  });
  document.addEventListener("focusout", function (event) {
    var hit = event.target.closest ? event.target.closest(".chart-hit") : null;
    if (hit) clearChartInteractive(hit.closest("[data-chart-interactive]"));
  });
  document.addEventListener("pointerout", function (event) {
    var wrap = event.target.closest ? event.target.closest("[data-chart-interactive]") : null;
    if (wrap && (!event.relatedTarget || !wrap.contains(event.relatedTarget))) {
      clearChartInteractive(wrap);
    }
  });

  document.addEventListener("click", function (event) {
    if (accountRoot && !accountRoot.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeMenu();
  });

  // Mobile Navigation Pop-up Overlay Controller (R4)
  function initMobileOverlay() {
    var overlay = document.getElementById("mobile-nav-overlay");
    var toggleBtn = document.querySelector(".nav-toggle");
    var closeBtn = document.getElementById("mobile-nav-close");
    var nav = document.getElementById("site-nav");

    function lockScroll(lock) {
      if (lock) {
        document.body.classList.add("nav-open", "scroll-lock", "no-scroll");
        document.body.style.overflow = "hidden";
      } else {
        document.body.classList.remove("nav-open", "scroll-lock", "no-scroll");
        document.body.style.overflow = "";
      }
    }

    if (overlay && toggleBtn) {
      function openOverlay() {
        if (typeof overlay.showModal === "function") {
          try {
            overlay.showModal();
          } catch (e) {
            overlay.setAttribute("open", "");
          }
        } else {
          overlay.setAttribute("open", "");
        }
        overlay.classList.add("is-active");
        overlay.setAttribute("aria-hidden", "false");
        lockScroll(true);
        toggleBtn.setAttribute("aria-expanded", "true");
        var label = toggleBtn.querySelector(".nav-toggle-label");
        if (label) label.textContent = "Tutup";
        if (closeBtn) closeBtn.focus();
      }

      function closeOverlay() {
        overlay.classList.remove("is-active");
        lockScroll(false);
        toggleBtn.setAttribute("aria-expanded", "false");
        var label = toggleBtn.querySelector(".nav-toggle-label");
        if (label) label.textContent = "Menu";
        if (typeof overlay.close === "function") {
          try {
            overlay.close();
          } catch (e) {
            overlay.removeAttribute("open");
          }
        } else {
          overlay.removeAttribute("open");
        }
        overlay.setAttribute("aria-hidden", "true");
        toggleBtn.focus();
      }

      toggleBtn.addEventListener("click", function () {
        var isOpen = overlay.hasAttribute("open") || overlay.classList.contains("is-active");
        if (isOpen) {
          closeOverlay();
        } else {
          openOverlay();
        }
      });

      if (closeBtn) {
        closeBtn.addEventListener("click", closeOverlay);
      }

      // Dismiss overlay on backdrop / scrim click
      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) {
          closeOverlay();
        }
      });

      // Close on navigation link click
      overlay.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
          closeOverlay();
        }
      });

      // Keyboard ESC key listener registered for overlay dismissal
      overlay.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeOverlay(); // dismiss nav overlay
        }
      });

      // Close overlay if opening login or register
      overlay.querySelectorAll("[data-open-register], [data-open-login]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          closeOverlay();
        });
      });
    } else if (toggleBtn && nav) {
      toggleBtn.addEventListener("click", function () {
        var open = nav.classList.toggle("is-open");
        toggleBtn.setAttribute("aria-expanded", String(open));
        toggleBtn.querySelector(".nav-toggle-label").textContent = open ? "Tutup" : "Menu";
      });
      nav.addEventListener("click", function (event) {
        if (event.target.closest("a")) {
          nav.classList.remove("is-open");
          toggleBtn.setAttribute("aria-expanded", "false");
          toggleBtn.querySelector(".nav-toggle-label").textContent = "Menu";
        }
      });
    }
  }

  initMobileOverlay();

  var regencySelects = document.querySelectorAll("[data-regency-select]");
  regencySelects.forEach(function (select) {
    select.innerHTML = REGENCIES.map(function (name) {
      return '<option value="' + escapeHtml(name) + '"' + (name === state.regency ? " selected" : "") + ">" +
        escapeHtml(name) + "</option>";
    }).join("");
    select.addEventListener("change", function () {
      state.regency = select.value;
      store.set("mongso-regency", state.regency);
      regencySelects.forEach(function (other) { other.value = state.regency; });
      if (typeof window.mongsoReload === "function") window.mongsoReload();
    });
  });

  function initDashboard() {
    var root = document.getElementById("live-price");
    if (!root) return;

    var retry = function () { loadDashboard(); };
    var categoryFilter = document.getElementById("news-category-filter");
    var fieldAdvisories = [];
    var rssItems = [];

    function renderCombinedNews() {
      var selectedCat = categoryFilter ? categoryFilter.value : "";
      var combined = [];

      fieldAdvisories.forEach(function (item) {
        if (selectedCat && selectedCat !== "Lapangan" && item.category !== selectedCat) return;
        var targetUrl = item.url || item.link || "";
        var hasValidUrl = targetUrl && targetUrl !== "#";
        var isExternal = targetUrl.indexOf("http:") === 0 || targetUrl.indexOf("https:") === 0;
        var linkAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
        var titleHtml = hasValidUrl
          ? ('<a href="' + escapeHtml(targetUrl) + '"' + linkAttrs + ">" + escapeHtml(item.title) + "</a>")
          : escapeHtml(item.title);
        var sourceLinkHtml = hasValidUrl
          ? ('<div class="mt-8"><a class="link-arrow" href="' + escapeHtml(targetUrl) + '"' + linkAttrs + ">Buka " + escapeHtml(item.source || "detail") + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg></a></div>')
          : "";
        combined.push(
          '<article class="news-item">' +
          '<div class="news-meta"><span class="badge badge--neutral">' + escapeHtml(item.category || "Saran lapangan") +
          "</span><span>" + escapeHtml((item.source ? item.source + " · " : "") + (item.date || item.pub_date || "")) + "</span></div>" +
          "<h4>" + titleHtml + "</h4>" +
          "<p>" + escapeHtml(item.summary) + "</p>" +
          (item.action_advice ? '<div class="news-advice"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
          '<path d="M20 6 9 17l-5-5"/></svg><span>' + escapeHtml(item.action_advice) + "</span></div>" : "") +
          sourceLinkHtml +
          "</article>"
        );
      });

      rssItems.forEach(function (item) {
        if (selectedCat === "Lapangan") return;
        if (selectedCat && item.category !== selectedCat) return;
        var targetUrl = item.url || item.link || "#";
        var pubLabel = item.published_label || item.pub_date || item.time_ago || "";
        combined.push(
          '<article class="news-item">' +
          '<div class="news-meta"><span class="news-cat">' + escapeHtml(item.category || "Warta") + "</span>" +
          "<span>" + escapeHtml(item.source || "RSS") + (pubLabel ? " · " + escapeHtml(pubLabel) : "") + "</span></div>" +
          '<h4><a href="' + escapeHtml(targetUrl) + '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(item.title) + "</a></h4>" +
          "<p>" + escapeHtml(item.summary || "") + "</p>" +
          (targetUrl !== "#" ? '<div class="mt-8"><a class="link-arrow" href="' + escapeHtml(targetUrl) + '" target="_blank" rel="noopener noreferrer">Baca berita asli di ' + escapeHtml(item.source || "pusat berita") + ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg></a></div>' : "") +
          "</article>"
        );
      });

      setHtml("news-list", combined.join("") || '<p class="panel-pad muted">Belum ada warta pada kategori ini.</p>');
    }

    if (categoryFilter) {
      categoryFilter.addEventListener("change", renderCombinedNews);
    }

    function loadDashboard() {
      setText("live-price", "…");
      setText("hero-location", state.regency + " · Jawa Timur");
      setHtml("news-list", '<p class="panel-pad loading">Memuat warta…</p>');
      setHtml("tool-weather", '<span class="loading">Memuat…</span>');
      errorState(document.getElementById("dashboard-error"), "");

      apiGet("/api/v1/dashboard/summary", { regency: state.regency }).then(function (data) {
        setText("live-price", rupiah(data.top_price_rp));
        setText("live-price-note", data.commodity_name + " · per kg · " + (data.price_is_estimated ? "perkiraan" : "SISKAPERBAPO"));

        var delta = document.getElementById("live-delta");
        if (delta) {
          var change = Number(data.weekly_change_pct) || 0;
          delta.textContent = pct(change);
          delta.className = "dossier-delta" + (change < 0 ? " is-down" : "");
        }

        setText("live-rain", num(data.weekly_rainfall_mm, 1) + " mm");
        setText("live-rain-note", data.weather_is_estimated ? "Perkiraan Open-Meteo" : "Open-Meteo · live");
        setText("live-risk", num(data.risk_score, 0) + "%");
        setText("live-risk-note", data.risk_status);
        setText("stat-area", num(data.total_planted_ha, 1) + " ha");
        setText("stat-quota", "Kuota aman " + num(data.safe_quota_ha, 0) + " ha");

        setText("tool-market-price", rupiah(data.top_price_rp));
        setText("tool-market-change", pct(data.weekly_change_pct) + " pekan ini");
        var marketChange = document.getElementById("tool-market-change");
        if (marketChange) marketChange.className = Number(data.weekly_change_pct) < 0 ? "neg" : "pos";
        setText("tool-quota", num(data.safe_quota_ha, 0) + " ha");

        fieldAdvisories = data.news_feed || [];
        renderCombinedNews();
      }).catch(function (error) {
        errorState(document.getElementById("dashboard-error"),
          error.message + ". Pastikan backend berjalan dan halaman dibuka dari alamat server yang sama.",
          retry);
        setText("live-price", "-");
        setHtml("news-list", '<p class="panel-pad muted">Warta belum tersedia.</p>');
      });

      apiGet("/api/v1/news", { limit: 6 }).then(function (newsData) {
        rssItems = (newsData && newsData.items) || [];
        var srcCount = Number(newsData && newsData.configured_sources) || 0;
        setText("news-source-meta", rssItems.length
          ? ("Saran lapangan + " + rssItems.length + " berita RSS dari " + srcCount + " media pertanian")
          : "Tiga catatan pilihan lapangan berdasarkan harga dan cuaca terkini");
        renderCombinedNews();
      }).catch(function () {
        setText("news-source-meta", "Tiga catatan pilihan lapangan berdasarkan harga dan cuaca terkini");
      });

      apiGet("/api/v1/weather/forecast", { regency: state.regency }).then(function (weather) {
        var current = weather.current || {};
        var spray = weather.spray_advice || {};
        var good = spray.verdict === "baik";

        setText("hero-weather-icon", current.icon || "☀️");
        setText("hero-weather-temp", num(current.temp_c, 0) + "°");
        setText("hero-weather-cond", current.condition || "Kondisi tidak tersedia");
        setText("hero-weather-note", spray.summary || "Periksa kondisi lahan sebelum bekerja.");

        var badge = document.getElementById("hero-weather-badge");
        if (badge) {
          badge.textContent = good ? "Waktu kerja baik" : "Tunda semprot";
          badge.className = "badge" + (good ? " badge--safe" : " badge--warn");
        }

        var weekRain = (weather.daily || []).reduce(function (total, day) {
          return total + (Number(day.rain_mm) || 0);
        }, 0);
        setHtml("tool-weather", miniForecast(weather.daily));
        setText("tool-weather-note", "Hujan " + num(weekRain, 0) + " mm · " + (weather.source || "Open-Meteo"));
      }).catch(function () {
        setText("hero-weather-cond", "Cuaca belum tersedia");
        setText("hero-weather-note", "Coba muat ulang halaman.");
        setHtml("tool-weather", "");
        setText("tool-weather-note", "Cuaca belum tersedia");
      });
    }

    window.mongsoReload = loadDashboard;
    loadDashboard();
  }

  var CROP_PROFILES = {
    1: { name: "Cabai Rawit", pathogen: "Penyakit Patek / Busuk Buah", pestDry: "Hama Kutu Daun (Thrips) & Tungau", rhLimit: 80, windLimit: 14, rain7dMax: 45 },
    2: { name: "Bawang Merah", pathogen: "Penyakit Trotol (Bercak Ungu) & Moler", pestDry: "Ulat Grayak Bawang", rhLimit: 82, windLimit: 15, rain7dMax: 35 },
    3: { name: "Cabai Merah Besar", pathogen: "Penyakit Patek & Busuk Buah", pestDry: "Kutu Kebul (Penyebab Daun Kuning)", rhLimit: 80, windLimit: 14, rain7dMax: 45 },
    4: { name: "Tomat", pathogen: "Penyakit Busuk Daun & Batang", pestDry: "Ulat Penggerek Buah", rhLimit: 83, windLimit: 14, rain7dMax: 40 },
    5: { name: "Kentang", pathogen: "Penyakit Kresek / Busuk Daun (Lodoh)", pestDry: "Lalat Pengorok Daun", rhLimit: 84, windLimit: 16, rain7dMax: 40 },
    6: { name: "Kubis / Kol", pathogen: "Penyakit Busuk Hitam pada Krop", pestDry: "Ulat Pemakan Daun & Krop Kubis", rhLimit: 84, windLimit: 16, rain7dMax: 50 },
    7: { name: "Bawang Putih", pathogen: "Penyakit Embun Tepung / Busuk Daun", pestDry: "Hama Kutu Thrips", rhLimit: 82, windLimit: 15, rain7dMax: 35 },
    8: { name: "Cabai Merah Keriting", pathogen: "Penyakit Patek & Bercak Daun", pestDry: "Kutu Daun (Keriting Pucuk)", rhLimit: 80, windLimit: 14, rain7dMax: 45 },
    9: { name: "Buncis", pathogen: "Penyakit Karat Daun", pestDry: "Ulat Penggerek Polong", rhLimit: 83, windLimit: 15, rain7dMax: 45 },
    10: { name: "Wortel", pathogen: "Penyakit Bercak Daun Coklat", pestDry: "Kutu Daun Pucuk", rhLimit: 84, windLimit: 16, rain7dMax: 45 },
    11: { name: "Ketela Pohon", pathogen: "Penyakit Bercak Daun Coklat", pestDry: "Tungau Merah Daun", rhLimit: 85, windLimit: 18, rain7dMax: 60 }
  };

  var PHASE_LABELS = {
    semai: "Bibit / Pindah Tanam (0–14 HST)",
    vegetatif: "Masa Tumbuh Daun (15–35 HST)",
    generatif: "Masa Berbunga & Berbuah (36–65 HST)",
    panen: "Siap Panen (>65 HST)"
  };

  var SUBDISTRICTS = {
    "Kab. Kediri": [
      { name: "Kec. Pare (Sentra Cabai & Bawang)", lat: -7.7735, lon: 112.1895 },
      { name: "Kec. Kepung (Lereng Kelud)", lat: -7.8342, lon: 112.2621 },
      { name: "Kec. Plosoklaten", lat: -7.8615, lon: 112.1480 },
      { name: "Kec. Puncu", lat: -7.8580, lon: 112.2285 },
      { name: "Kec. Wates", lat: -7.9150, lon: 112.1120 },
      { name: "Kec. Ngancar", lat: -7.9355, lon: 112.1945 }
    ],
    "Kota Kediri": [
      { name: "Kec. Mojoroto", lat: -7.8012, lon: 111.9885 },
      { name: "Kec. Pesantren", lat: -7.8380, lon: 112.0490 },
      { name: "Kec. Kota Kediri", lat: -7.8228, lon: 112.0119 }
    ],
    "Kab. Malang": [
      { name: "Kec. Poncokusumo (Lereng Semeru)", lat: -8.0410, lon: 112.7650 },
      { name: "Kec. Pujon (Dataran Tinggi)", lat: -7.8485, lon: 112.4630 },
      { name: "Kec. Ngantang", lat: -7.8560, lon: 112.3715 },
      { name: "Kec. Karangploso", lat: -7.8920, lon: 112.5960 },
      { name: "Kec. Pakis", lat: -7.9620, lon: 112.7050 }
    ],
    "Kota Malang": [
      { name: "Kec. Kedungkandang", lat: -8.0010, lon: 112.6620 },
      { name: "Kec. Lowokwaru", lat: -7.9420, lon: 112.6150 },
      { name: "Kec. Sukun", lat: -8.0050, lon: 112.6080 }
    ],
    "Kab. Nganjuk": [
      { name: "Kec. Sukomoro (Sentra Bawang Merah)", lat: -7.6065, lon: 111.9465 },
      { name: "Kec. Bagor", lat: -7.5820, lon: 111.8610 },
      { name: "Kec. Rejoso", lat: -7.5290, lon: 111.8940 },
      { name: "Kec. Gondang", lat: -7.5150, lon: 111.9640 },
      { name: "Kec. Wilangan", lat: -7.5710, lon: 111.7980 }
    ],
    "Kab. Banyuwangi": [
      { name: "Kec. Wongsorejo (Sentra Cabai Utara)", lat: -7.9680, lon: 114.3950 },
      { name: "Kec. Muncar", lat: -8.4350, lon: 114.3320 },
      { name: "Kec. Kalipuro", lat: -8.1510, lon: 114.3310 },
      { name: "Kec. Genteng", lat: -8.3620, lon: 114.1520 }
    ],
    "Kota Batu": [
      { name: "Kec. Bumiaji (Sentra Kentang & Sayur)", lat: -7.8120, lon: 112.5310 },
      { name: "Kec. Batu", lat: -7.8671, lon: 112.5239 },
      { name: "Kec. Junrejo", lat: -7.9020, lon: 112.5610 }
    ],
    "Kota Surabaya": [
      { name: "Kec. Sambikerep (Lahan Tani Barat)", lat: -7.2710, lon: 112.6420 },
      { name: "Kec. Benowo", lat: -7.2310, lon: 112.6250 },
      { name: "Kec. Rungkut", lat: -7.3210, lon: 112.7850 }
    ],
    "Kab. Sidoarjo": [
      { name: "Kec. Krembung", lat: -7.4980, lon: 112.6180 },
      { name: "Kec. Prambon", lat: -7.4620, lon: 112.5610 },
      { name: "Kec. Taman (Area Puspa Agro)", lat: -7.3620, lon: 112.6910 }
    ],
    "Kab. Probolinggo": [
      { name: "Kec. Dringu (Sentra Bawang Probolinggo)", lat: -7.7720, lon: 113.2610 },
      { name: "Kec. Sukapura (Lereng Bromo)", lat: -7.9120, lon: 113.0350 },
      { name: "Kec. Leces", lat: -7.8410, lon: 113.2250 }
    ]
  };

  function getFieldMetaMap() {
    var raw = store.get("mongso.field_meta");
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }

  function saveFieldMeta(fieldKey, meta) {
    var map = getFieldMetaMap();
    map[String(fieldKey)] = meta;
    store.set("mongso.field_meta", JSON.stringify(map));
  }

  function computeHst(plantedDate) {
    if (!plantedDate) return null;
    var start = new Date(plantedDate + "T00:00:00");
    if (Number.isNaN(start.getTime())) return null;
    var diff = Math.floor((Date.now() - start.getTime()) / 86400000);
    return diff >= 0 ? diff : 0;
  }

  function inferPhaseFromHst(hst) {
    if (hst === null || hst === undefined) return "generatif";
    if (hst <= 14) return "semai";
    if (hst <= 35) return "vegetatif";
    if (hst <= 65) return "generatif";
    return "panen";
  }

  function formatAgoMinutes(isoStr) {
    if (!isoStr) return "baru saja";
    var t = new Date(isoStr).getTime();
    if (Number.isNaN(t)) return "baru saja";
    var mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return "baru saja";
    if (mins < 60) return mins + " menit lalu";
    var hrs = Math.floor(mins / 60);
    return hrs + " jam " + (mins % 60) + " mnt lalu";
  }

  function initWeather() {
    var root = document.getElementById("forecast-grid");
    if (!root) return;

    var activeField = null;
    var activeSubdistrict = null;
    var activeCropId = Number(store.get("mongso.weather.crop") || 1);
    var activePhase = store.get("mongso.weather.phase") || "generatif";
    var latestWeatherData = null;
    var latestSummaryData = null;

    var resetBtn = document.getElementById("field-reset-regency");
    var districtSelect = document.getElementById("weather-district-select");
    var gpsBtn = document.getElementById("weather-gps-btn");
    var cropSelect = document.getElementById("weather-crop-select");
    var phaseSelect = document.getElementById("weather-phase-select");
    var retry = function () { loadWeather(); };

    function populateDistrictSelect() {
      if (!districtSelect) return;
      var list = SUBDISTRICTS[state.regency] || [];
      districtSelect.innerHTML =
        '<option value="">Semua ' + escapeHtml(state.regency) + " (Pusat)</option>" +
        list.map(function (d, idx) {
          var sel = activeSubdistrict && activeSubdistrict.name === d.name ? " selected" : (!activeSubdistrict && idx === 0 ? " selected" : "");
          return '<option value="' + idx + '"' + sel + ">" + escapeHtml(d.name) + "</option>";
        }).join("");
      if (!activeSubdistrict && list.length > 0) {
        activeSubdistrict = list[0];
        districtSelect.value = "0";
      }
    }

    populateDistrictSelect();

    if (districtSelect) {
      districtSelect.addEventListener("change", function () {
        var list = SUBDISTRICTS[state.regency] || [];
        var val = districtSelect.value;
        activeField = null;
        if (resetBtn) resetBtn.hidden = true;
        if (val === "") {
          activeSubdistrict = null;
        } else {
          activeSubdistrict = list[Number(val)] || null;
        }
        loadWeather();
        loadFields();
      });
    }

    if (gpsBtn) {
      gpsBtn.addEventListener("click", function () {
        if (!navigator.geolocation) {
          errorState(document.getElementById("weather-error"), "Browser Anda belum mendukung fitur GPS lokasi.");
          return;
        }
        var origText = gpsBtn.querySelector("span");
        if (origText) origText.textContent = "Mencari GPS…";
        gpsBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            gpsBtn.disabled = false;
            if (origText) origText.textContent = "GPS Aktif";
            activeField = null;
            activeSubdistrict = {
              name: "Titik GPS Kebun Saya",
              lat: Number(pos.coords.latitude.toFixed(4)),
              lon: Number(pos.coords.longitude.toFixed(4))
            };
            if (districtSelect) districtSelect.value = "";
            if (resetBtn) resetBtn.hidden = false;
            loadWeather();
          },
          function () {
            gpsBtn.disabled = false;
            if (origText) origText.textContent = "GPS Lokasi Kebun Saya";
            errorState(
              document.getElementById("weather-error"),
              "Izin lokasi GPS belum aktif di browser. Anda tetap bisa memilih Kecamatan di atas atau memasukkan titik kebun di bawah."
            );
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }

    if (cropSelect) {
      cropSelect.innerHTML = COMMODITIES.map(function (c) {
        return '<option value="' + c.id + '"' + (Number(c.id) === activeCropId ? " selected" : "") + ">" +
          c.icon + " " + escapeHtml(c.name) + "</option>";
      }).join("");
      cropSelect.addEventListener("change", function () {
        activeCropId = Number(cropSelect.value) || 1;
        store.set("mongso.weather.crop", String(activeCropId));
        if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
      });
    }

    if (phaseSelect) {
      phaseSelect.value = activePhase;
      phaseSelect.addEventListener("change", function () {
        activePhase = phaseSelect.value || "generatif";
        store.set("mongso.weather.phase", activePhase);
        if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        activeField = null;
        activeSubdistrict = (SUBDISTRICTS[state.regency] || [])[0] || null;
        populateDistrictSelect();
        resetBtn.hidden = true;
        loadWeather();
        loadFields();
      });
    }

    function updateSyncPill(isOffline, cachedAtIso, sourceName) {
      var pill = document.getElementById("sync-status-pill");
      if (!pill) return;
      if (isOffline) {
        pill.className = "data-chip data-chip--offline";
        pill.textContent = "Terakhir diperbarui " + formatAgoMinutes(cachedAtIso) + " · Mode Offline";
      } else {
        pill.className = "data-chip";
        pill.textContent = "Sinkron " + clock(cachedAtIso || new Date().toISOString()) + " · " + (sourceName || "Online");
      }
    }

    window.addEventListener("online", function () { loadWeather(); });
    window.addEventListener("offline", function () {
      var cacheKey = "mongso.weather.cache." + (activeField ? ("field_" + activeField.id) : state.regency);
      var raw = store.get(cacheKey);
      var cached = null;
      try { cached = raw ? JSON.parse(raw) : null; } catch (e) {}
      updateSyncPill(true, cached && cached.cached_at, "Cache Lokal");
    });

    function renderAgronomyIntelligence(weatherData, summaryData) {
      var current = (weatherData && weatherData.current) || {};
      var hourly = (weatherData && weatherData.hourly) || [];
      var daily = (weatherData && weatherData.daily) || [];
      var spray = (weatherData && weatherData.spray_advice) || {};

      var crop = CROP_PROFILES[activeCropId] || CROP_PROFILES[1];
      var cropMeta = COMMODITIES.filter(function (c) { return Number(c.id) === Number(activeCropId); })[0] || COMMODITIES[0];
      var phaseLabel = PHASE_LABELS[activePhase] || PHASE_LABELS.generatif;

      var rh = Number(current.humidity_pct) || 72;
      var temp = Number(current.temp_c) || 28;
      var wind = Number(current.wind_kmh) || 8;
      var rainNow = Number(current.rain_mm) || 0;

      var next6h = hourly.slice(0, 6);
      var rainNext6h = next6h.reduce(function (acc, h) { return acc + (Number(h.rain_mm) || 0); }, 0);
      var maxProbNext6h = next6h.reduce(function (acc, h) { return Math.max(acc, Number(h.rain_prob_pct) || 0); }, 0);
      var rain7d = daily.reduce(function (acc, d) { return acc + (Number(d.rain_mm) || 0); }, 0);

      var fieldExtra = "";
      if (activeField && activeField.hst !== null && activeField.hst !== undefined) {
        fieldExtra = " · Umur " + activeField.hst + " hari";
      }
      setText("digest-crop-tag", cropMeta.icon + " " + crop.name + " · " + phaseLabel + fieldExtra);
      setText("spray-crop-badge", cropMeta.icon + " " + crop.name);

      var isRainingNow = rainNow >= 0.5;
      var isRainSoon = rainNext6h >= 2.5 || maxProbNext6h >= 65;
      var isRainRisk = isRainingNow || isRainSoon;
      var isWindRisk = wind >= crop.windLimit;
      var isHighHumidity = rh >= crop.rhLimit;
      var isHeavyWeekRain = rain7d >= crop.rain7dMax;
      var isFungalRisk = isHighHumidity || isHeavyWeekRain;

      var locName = activeField
        ? activeField.name
        : (activeSubdistrict ? activeSubdistrict.name.split(" (")[0] : state.regency);

      /* 1. Global Alert Banner (Urutan Pertama) */
      var globalAlert = document.getElementById("weather-global-alert");
      if (globalAlert) {
        if (rainNext6h >= 5 || maxProbNext6h >= 75 || wind >= 18 || rh >= 86) {
          var alertReason = rainNext6h >= 5 || maxProbNext6h >= 75
            ? "Diperkirakan bakal turun hujan " + num(rainNext6h, 1) + " mm dalam 6 jam ke depan. Jangan nyemprot obat dulu agar tidak luntur."
            : wind >= 18
              ? "Angin di kebun cukup kencang (" + num(wind, 1) + " km/jam). Tunda nyemprot supaya kabut obat tidak terbang terbawa angin."
              : "Udara sangat lembap (" + num(rh, 0) + "%), jamur " + crop.pathogen + " gampang menyerang daun dan buah.";
          globalAlert.hidden = false;
          globalAlert.innerHTML =
            '<div class="shell global-alert-inner">' +
              '<div class="global-alert-copy">' +
                '<span class="badge badge--danger">PERINGATAN CUACA KEBUN</span>' +
                "<strong>Perhatian untuk petani di " + escapeHtml(locName) + ":</strong> " +
                "<span>" + escapeHtml(alertReason) + "</span>" +
              "</div>" +
              '<div class="global-alert-actions">' +
                '<a class="btn btn--sm btn--lime" href="#field-logbook-panel">Buka Catatan Kebun</a>' +
              "</div>" +
            "</div>";
        } else {
          globalAlert.hidden = true;
          globalAlert.innerHTML = "";
        }
      }

      /* 2. Actionable Digest Card (Bahasa Petani yang Jelas & Tidak Kontradiktif) */
      var statusBadge = document.getElementById("digest-status-badge");
      if (isRainRisk || isWindRisk) {
        if (statusBadge) {
          statusBadge.className = "badge badge--warn";
          statusBadge.textContent = "TUNDA NYEMPROT DULU";
        }
        var reasonTitle = isRainingNow
          ? "Sedang Turun Hujan"
          : isRainSoon
            ? "Bakal Hujan Dalam 6 Jam"
            : "Angin Terlalu Kencang";
        setText("digest-headline", "Saran Hari Ini: Tunda Nyemprot (" + reasonTitle + ")");

        var reasonDetail = isRainingNow
          ? "Saat ini sedang turun hujan (" + num(rainNow, 1) + " mm) di sekitar " + locName + ". Kalau dipaksa nyemprot sekarang, obat langsung luntur tercuci air hujan."
          : isRainSoon
            ? "Ada peluang hujan " + num(maxProbNext6h, 0) + "% (" + num(rainNext6h, 1) + " mm) dalam 6 jam ke depan. Sebaiknya tunggu cuaca terang supaya obat meresap ke daun " + crop.name + "."
            : "Angin bertiup " + num(wind, 1) + " km/jam (di atas batas aman " + crop.windLimit + " km/jam). Kabut semprotan rawan terbang dan tidak rata mengenai daun.";
        setText("digest-subtext", reasonDetail);
      } else {
        if (statusBadge) {
          statusBadge.className = "badge badge--safe";
          statusBadge.textContent = "CUACA AMAN UNTUK KE SAWAH";
        }
        var bestWin = "06:00–09:00 WIB";
        if (spray.windows && spray.windows[0]) {
          bestWin = typeof spray.windows[0] === "string" ? spray.windows[0] : (spray.windows[0].label || bestWin);
        }
        setText("digest-headline", "Saran Hari Ini: Aman untuk Nyemprot & Mupuk (" + bestWin + ")");
        setText("digest-subtext", "Saat ini tidak hujan, angin tenang (" + num(wind, 1) + " km/jam), dan 6 jam ke depan cuaca mendukung untuk merawat tanaman " + crop.name + " di " + locName + ".");
      }

      var sprayDir = isRainingNow
        ? "Jangan nyemprot saat hujan turun. Tunggu daun agak kering, lalu campur perekat obat."
        : isRainSoon
          ? "Tunda nyemprot. Kalau terpaksa karena ada serangan hama, wajib campur perekat obat."
          : isWindRisk
            ? "Tunggu angin agak reda di pagi hari, arahkan spuyer dekat ke tajuk daun."
            : "Waktu bagus pukul 06:00–09:00 pagi" + (activePhase === "generatif" ? " (semprot halus, jangan terlalu keras ke bunga)." : ".");

      var fertDir = isHeavyWeekRain
        ? "Minggu ini banyak hujan (" + num(rain7d, 0) + " mm). Jangan kocor pupuk daun (Urea/ZA) dulu, ganti pupuk penguat batang & buah (Kalsium/Kalium)."
        : "Tanah cukup lembap, aman memberikan pupuk susulan " + (activePhase === "vegetatif" ? "NPK untuk pertumbuhan daun." : "Kalium & Fosfat untuk pengisian buah/umbi.");

      var pestDir = "";
      if (isHighHumidity && isHeavyWeekRain) {
        pestDir = "Awas " + crop.pathogen + " karena udara lembap (" + num(rh, 0) + "%) & hujan minggu ini cukup sering (" + num(rain7d, 0) + " mm).";
      } else if (isHighHumidity) {
        pestDir = "Awas " + crop.pathogen + " karena udara lembap (" + num(rh, 0) + "%). Rajin cek bagian bawah daun.";
      } else if (isHeavyWeekRain) {
        pestDir = "Awas " + crop.pathogen + " karena curah hujan 7 hari tinggi (" + num(rain7d, 0) + " mm). Jaga got tetap lancar.";
      } else {
        pestDir = "Cuaca agak kering/hangat, periksa " + crop.pestDry + " di pucuk dan balik daun muda.";
      }

      setText("digest-dir-spray", sprayDir);
      setText("digest-dir-fert", fertDir);
      setText("digest-dir-pest", pestDir);

      /* 3. Spesifik Komoditas pada Jendela Semprot & Analisis Penyakit */
      setText("spray-verdict", (!isRainRisk && !isWindRisk) ? "Waktu semprot aman" : "Tunda nyemprot dulu");
      setText("spray-summary", (spray.summary || "") + " Angin aman untuk " + crop.name + ": di bawah " + crop.windLimit + " km/jam.");
      setHtml("spray-windows", (spray.windows || []).map(function (w) {
        var lbl = typeof w === "string" ? w : (w.label || "");
        return '<span class="badge">' + escapeHtml(lbl) + "</span>";
      }).join("") || '<span class="badge">Pagi 06:00–08:30 WIB</span>');

      var riskLevel = (isHighHumidity && rain7d >= 25) ? "TINGGI" : (rh >= crop.rhLimit - 5 || rain7d >= 15) ? "SEDANG" : "RENDAH";
      var badgeCls = riskLevel === "TINGGI" ? "badge--danger" : riskLevel === "SEDANG" ? "badge--warn" : "badge--safe";
      var threatTitle = isFungalRisk ? crop.pathogen : crop.pestDry;
      var phaseNote = "Tanaman " + crop.name + " · " + phaseLabel;
      var triggerText = isFungalRisk
        ? "Saat ini kelembapan udara " + num(rh, 0) + "%, suhu " + num(temp, 0) + "°C, dan total hujan 7 hari mencapai " + num(rain7d, 1) + " mm. Kondisi basah seperti ini membuat jamur cepat menular."
        : "Saat ini udara cukup hangat (" + num(temp, 0) + "°C) dengan kelembapan " + num(rh, 0) + "%. Kondisi ini biasanya disukai hama kutu dan ulat untuk berkembang biak.";
      var steps = isFungalRisk ? [
        "Pangkas daun tua di bagian bawah yang menyentuh tanah dan bersihkan parit (got) agar air hujan cepat surut.",
        "Semprot obat jamur (fungisida) untuk " + crop.name + " di pagi hari saat daun sudah tidak basah kuyup.",
        activePhase === "generatif"
          ? "Berikan pupuk Kalsium agar kulit buah & tangkai bunga lebih kuat dan tidak gampang rontok."
          : "Cabut rumput liar di sekitar bedengan supaya angin bisa masuk dan kebun tidak terlalu pengap."
      ] : [
        "Cek pucuk daun dan balik daun muda setiap pagi untuk melihat apakah ada " + crop.pestDry + ".",
        "Pasang perangkap likat kuning di kebun untuk menangkap kutu/lalat yang terbang.",
        "Kalau hama mulai banyak, semprot obat hama (insektisida) pada sore hari."
      ];

      setHtml("pest-card",
        '<div class="pest-head">' +
          '<span class="badge ' + badgeCls + '">BAHAYA ' + riskLevel + " · " + escapeHtml(crop.name.toUpperCase()) + "</span>" +
          "<div><h3>" + escapeHtml(threatTitle) + "</h3><p>" + escapeHtml(phaseNote) + "</p></div>" +
        "</div>" +
        '<div class="pest-body">' +
          "<h4>Penyebab &amp; Cara Mencegah di Kebun</h4><p>" + escapeHtml(triggerText) + "</p>" +
          '<ul class="pest-steps">' + steps.map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; }).join("") + "</ul>" +
        "</div>");

      /* 4. Cross-Module Integration (Cuaca × Kalkulator & Pasar) */
      var areaParam = (activeField && activeField.area_ha) ? activeField.area_ha : 1.0;
      var regParam = activeField ? activeField.regency : state.regency;
      var recDate = new Date();
      recDate.setDate(recDate.getDate() + (rainNext6h >= 8 ? 3 : 1));
      var recDateIso = recDate.toISOString().slice(0, 10);
      var calcHref = "kalkulator.html?commodity=" + encodeURIComponent(activeCropId) +
        "&regency=" + encodeURIComponent(regParam) +
        "&area=" + encodeURIComponent(areaParam) +
        "&date=" + encodeURIComponent(recDateIso);

      var topCta = document.getElementById("weather-calc-cta");
      if (topCta) topCta.setAttribute("href", calcHref);
      var bridgeCalcLink = document.getElementById("bridge-calc-link");
      if (bridgeCalcLink) bridgeCalcLink.setAttribute("href", calcHref);

      var rainSuitability = rain7d > crop.rain7dMax
        ? "Hujan 7 hari (" + num(rain7d, 1) + " mm) cukup deras untuk ukuran bibit " + crop.name + " (batas aman " + crop.rain7dMax + " mm). Sebaiknya undur pindah tanam 2–3 hari & tinggikan bedengan."
        : "Hujan 7 hari (" + num(rain7d, 1) + " mm) masih aman untuk " + crop.name + " (di bawah " + crop.rain7dMax + " mm). Tanah cukup basah dan bagus untuk mulai pindah tanam.";
      setText("bridge-calc-title", "Jadwal Tanam " + crop.name + " · " + locName);
      setText("bridge-calc-desc", rainSuitability);
      var calcBadge = document.getElementById("bridge-calc-badge");
      if (calcBadge) {
        calcBadge.className = "badge " + (rain7d > crop.rain7dMax ? "badge--warn" : "badge--safe");
        calcBadge.textContent = rain7d > crop.rain7dMax ? "Tunggu 2-3 Hari" : "Cocok Tanam";
      }
      setHtml("bridge-calc-metrics",
        '<div class="bridge-metric"><span>Perkiraan Hujan 7 Hari</span><strong>' + num(rain7d, 1) + " mm</strong></div>" +
        '<div class="bridge-metric"><span>Batas Aman ' + escapeHtml(crop.name) + '</span><strong>Maks. ' + crop.rain7dMax + " mm</strong></div>" +
        '<div class="bridge-metric"><span>Saran Mulai Tanam</span><strong>' + escapeHtml(shortDate(recDateIso)) + "</strong></div>");

      /* Integrasi Cuaca × Pasar */
      var priceRows = (summaryData && summaryData.siskaperbapo_table) || [];
      var marketRow = priceRows.filter(function (r) { return Number(r.commodity_id) === Number(activeCropId); })[0] || priceRows[0];
      if (marketRow) {
        var wkChange = Number(marketRow.weekly_change_pct) || 0;
        var supplySignal = (rain7d >= 35 || isFungalRisk)
          ? "Karena sering hujan & lembap di sekitar " + locName + ", panen petani lain bisa berkurang sehingga harga " + marketRow.commodity_name + " berpeluang bertahan tinggi."
          : "Cuaca terang memudahkan panen raya di wilayah " + regParam + ". Cek harga di pasar induk luar kota kalau pasokan lokal mulai penuh.";
        setText("bridge-market-title", marketRow.commodity_name + " · " + rupiah(marketRow.daily_price) + "/kg");
        setText("bridge-market-desc", supplySignal);
        var mktBadge = document.getElementById("bridge-market-badge");
        if (mktBadge) {
          mktBadge.className = "badge " + (wkChange >= 0 ? "badge--safe" : "badge--warn");
          mktBadge.textContent = pct(wkChange) + " minggu ini";
        }
        setHtml("bridge-market-metrics",
          '<div class="bridge-metric"><span>Harga di ' + escapeHtml(regParam) + '</span><strong>' + rupiah(marketRow.daily_price) + "/kg</strong></div>" +
          '<div class="bridge-metric"><span>Rata-rata Jawa Timur</span><strong>' + rupiah(marketRow.jatim_avg_price) + "/kg</strong></div>" +
          '<div class="bridge-metric"><span>Kondisi Panen &amp; Kirim</span><strong>' + (isFungalRisk ? "Rawan Susut / Busuk" : "Aman & Lancar") + "</strong></div>");
      }

      renderLogbookCorrelation(rainNow, rainNext6h);
    }

    function renderWeatherPayload(data, isFromOfflineCache) {
      latestWeatherData = data;
      var current = data.current || {};
      var locLabel = activeField
        ? (activeField.name + " · " + activeField.regency)
        : activeSubdistrict
          ? (activeSubdistrict.name.split(" (")[0] + " · " + state.regency)
          : (state.regency + " · Jawa Timur");

      var coordLat = activeField ? activeField.latitude : (activeSubdistrict ? activeSubdistrict.lat : data.latitude);
      var coordLon = activeField ? activeField.longitude : (activeSubdistrict ? activeSubdistrict.lon : data.longitude);
      if (coordLat && coordLon) {
        setText("weather-coord-pill", "Titik " + Number(coordLat).toFixed(3) + ", " + Number(coordLon).toFixed(3));
      } else {
        setText("weather-coord-pill", "Cuaca Saat Ini");
      }

      var cleanSource = String(data.source || "Open-Meteo").replace(/\s*\(SQLite Cache\)/i, "").replace(/Tandon Cuaca/i, "BMKG & Open-Meteo");

      setText("weather-location", locLabel);
      setText("weather-temp", num(current.temp_c, 0) + "°");
      setText("weather-cond", current.condition || "-");
      setText("weather-icon", current.icon || "☀️");
      setText("weather-humidity", num(current.humidity_pct, 0) + "%");
      setText("weather-wind", num(current.wind_kmh, 1) + " km/j");
      setText("weather-rain", num(current.rain_mm, 1) + " mm");
      setText("weather-updated", "Data " + cleanSource + " · " + clock(data.fetched_at));

      updateSyncPill(!!isFromOfflineCache || !navigator.onLine || !!data.is_stale, data.cached_at || data.fetched_at, cleanSource);

      var stale = document.getElementById("weather-stale");
      if (stale) {
        var showStale = !!data.is_stale || !!isFromOfflineCache;
        stale.hidden = !showStale;
        stale.textContent = isFromOfflineCache
          ? "Mode Offline Aktif: Menampilkan data tersimpan terakhir (" + formatAgoMinutes(data.cached_at || data.fetched_at) + ")."
          : (data.is_stale ? "Data cache lama. Koneksi ke Open-Meteo sedang terganggu." : "");
      }

      var parts = (data.day_parts || []).slice(0, 4).map(function (part) {
        return '<div class="day-part-card">' +
          '<div class="day-part-top"><span class="day-part-name">' + escapeHtml(part.name + (part.day && part.day !== "Hari ini" ? " (" + part.day + ")" : "")) + '</span>' +
          '<span class="day-part-time">' + escapeHtml(part.time_label) + "</span></div>" +
          '<div class="day-part-main"><span class="day-part-icon" aria-hidden="true">' + escapeHtml(part.icon || "☀️") + "</span>" +
          '<div><div class="day-part-temp">' + num(part.temp_c, 0) + '°C</div>' +
          '<div class="day-part-cond">' + escapeHtml(part.condition || "-") + "</div></div></div>" +
          '<div class="day-part-meta"><span>Hujan ' + num(part.rain_mm, 1) + " mm</span>" +
          "<span>Peluang " + num(part.rain_prob_pct, 0) + "%</span></div></div>";
      }).join("");
      setHtml("day-parts-grid", parts || '<p class="muted">Ringkasan waktu harian belum tersedia.</p>');

      var alert = data.rain_alert || {};
      var alertBox = document.getElementById("rain-alert");
      if (alertBox) {
        var active = alert.status && alert.status !== "kering";
        alertBox.classList.toggle("advice--warn", !!active);
        setText("rain-alert-title", active ? "Peringatan hujan 7 hari" : "Curah hujan 7 hari terkendali");
        setText("rain-alert-text", alert.message || "Prakiraan tujuh hari tidak menunjukkan hujan lebat.");
      }

      var grid = document.getElementById("forecast-grid");
      var dailyList = data.daily || [];
      var days = dailyList.map(function (day, index) {
        return '<button type="button" class="day-card' + (index === 0 ? " day-card--today" : "") + '" data-day-index="' + index + '" aria-pressed="' + (index === 0 ? "true" : "false") + '">' +
          '<span class="day-name">' + escapeHtml(index === 0 ? "Hari ini" : day.weekday) + "</span>" +
          '<span class="day-date">' + escapeHtml(shortDate(day.date)) + "</span>" +
          '<span class="day-icon" aria-hidden="true">' + escapeHtml(day.icon || "☀️") + "</span>" +
          '<span class="day-temps"><strong>' + num(day.temp_max_c, 0) + "°</strong> <span>" + num(day.temp_min_c, 0) + "°</span></span>" +
          '<span class="day-rain">' + num(day.rain_mm, 1) + " mm</span></button>";
      }).join("");
      if (grid) {
        grid.innerHTML = days;
        grid.querySelectorAll("[data-day-index]").forEach(function (cardBtn) {
          cardBtn.addEventListener("click", function () {
            var idx = Number(cardBtn.getAttribute("data-day-index")) || 0;
            var picked = dailyList[idx];
            if (!picked) return;
            grid.querySelectorAll("[data-day-index]").forEach(function (other) {
              var isThis = other === cardBtn;
              other.classList.toggle("day-card--today", isThis);
              other.setAttribute("aria-pressed", String(isThis));
            });
            if (idx === 0) {
              setText("weather-temp", num(current.temp_c, 0) + "°");
              setText("weather-cond", current.condition || "-");
              setText("weather-icon", current.icon || "☀️");
              setText("weather-wind", num(current.wind_kmh, 1) + " km/j");
              setText("weather-rain", num(current.rain_mm, 1) + " mm");
            } else {
              setText("weather-temp", num(picked.temp_max_c, 0) + "° / " + num(picked.temp_min_c, 0) + "°");
              setText("weather-cond", (picked.weekday || "") + ", " + shortDate(picked.date) + " · " + (picked.condition || "-"));
              setText("weather-icon", picked.icon || "☀️");
              setText("weather-wind", num(picked.wind_max_kmh, 1) + " km/j");
              setText("weather-rain", num(picked.rain_mm, 1) + " mm");
            }
          });
        });
      }

      setHtml("hourly-chart", hourlyChart(data.hourly));
      var hourlyWrap = document.getElementById("hourly-chart");
      if (hourlyWrap) {
        try { hourlyWrap.dataset.hours = JSON.stringify(data.hourly || []); } catch (e) {}
      }

      renderAgronomyIntelligence(data, latestSummaryData);
    }

    function loadWeather() {
      var grid = document.getElementById("forecast-grid");
      if (grid) grid.innerHTML = '<p class="loading">Memuat prakiraan…</p>';
      setHtml("day-parts-grid", '<p class="loading">Memuat ringkasan waktu harian…</p>');
      errorState(document.getElementById("weather-error"), "");

      var query = activeField
        ? { lat: activeField.latitude, lon: activeField.longitude, label: activeField.name, regency: activeField.regency }
        : activeSubdistrict
          ? { lat: activeSubdistrict.lat, lon: activeSubdistrict.lon, label: activeSubdistrict.name, regency: state.regency }
          : { regency: state.regency };
      var cacheKey = "mongso.weather.cache." + (
        activeField
          ? ("field_" + activeField.id)
          : activeSubdistrict
            ? ("sub_" + state.regency + "_" + activeSubdistrict.name)
            : state.regency
      );
      var sumCacheKey = "mongso.summary.cache." + (activeField ? activeField.regency : state.regency);

      apiGet("/api/v1/weather/forecast", query).then(function (data) {
        data.cached_at = new Date().toISOString();
        store.set(cacheKey, JSON.stringify(data));
        renderWeatherPayload(data, false);
      }).catch(function (error) {
        var rawCache = store.get(cacheKey);
        if (rawCache) {
          try {
            var cachedData = JSON.parse(rawCache);
            renderWeatherPayload(cachedData, true);
            return;
          } catch (e) {}
        }
        errorState(document.getElementById("weather-error"),
          error.message + ". Pastikan backend berjalan dan halaman dibuka dari alamat server yang sama.",
          retry);
        if (grid) grid.innerHTML = "";
        setHtml("day-parts-grid", "");
      });

      apiGet("/api/v1/dashboard/summary", { regency: activeField ? activeField.regency : state.regency }).then(function (data) {
        latestSummaryData = data;
        store.set(sumCacheKey, JSON.stringify(data));
        if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
      }).catch(function () {
        var rawSum = store.get(sumCacheKey);
        if (rawSum) {
          try {
            latestSummaryData = JSON.parse(rawSum);
            if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
          } catch (e) {}
        }
      });
    }

    /* 3. Logbook Lapangan & Korelasi Cuaca Historis */
    function getLogs() {
      var raw = store.get("mongso.field.logs");
      if (!raw) return [];
      try { return JSON.parse(raw) || []; } catch (e) { return []; }
    }

    function saveLogs(logs) {
      store.set("mongso.field.logs", JSON.stringify(logs.slice(0, 30)));
    }

    function renderLogbookCorrelation(rainNow, rainNext6h) {
      var box = document.getElementById("logbook-correlation");
      if (!box) return;
      var logs = getLogs();
      var recentChem = logs.filter(function (item) {
        return item.type === "Penyemprotan" || item.type === "Pemupukan";
      })[0];
      if (!recentChem) {
        box.hidden = true;
        return;
      }
      var totalRainRisk = (Number(rainNow) || 0) + (Number(rainNext6h) || 0);
      box.hidden = false;
      if (totalRainRisk >= 3.0) {
        box.className = "logbook-correlation is-warn";
        box.innerHTML = "<strong>Cek Ulang Hasil Semprot/Pupuk:</strong> Anda baru mencatat <em>" + escapeHtml(recentChem.type) +
          " (" + escapeHtml(recentChem.note) + ")</em> pada " + escapeHtml(recentChem.time_label) +
          ". Karena ada potensi hujan <strong>" + num(totalRainRisk, 1) +
          " mm</strong> dalam 6 jam ini, periksa daun & bedengan besok pagi kalau-kalau obat/pupuk luntur tercuci hujan.";
      } else {
        box.className = "logbook-correlation is-ok";
        box.innerHTML = "<strong>Obat & Pupuk Aman Meresap:</strong> Catatan terakhir <em>" + escapeHtml(recentChem.type) +
          " (" + escapeHtml(recentChem.note) + ")</em> didukung cuaca terang (hujan 6 jam ke depan hanya " +
          num(totalRainRisk, 1) + " mm). Obat dan pupuk bisa terserap baik oleh tanaman.";
      }
    }

    function renderLogbook() {
      var listEl = document.getElementById("logbook-list");
      var countEl = document.getElementById("logbook-count");
      if (!listEl) return;
      var logs = getLogs();
      if (countEl) countEl.textContent = logs.length + " catatan tersimpan";
      if (!logs.length) {
        listEl.innerHTML = '<p class="muted">Belum ada catatan kegiatan kebun. Catat habis nyemprot atau mupuk di atas supaya tahu apakah aman dari hujan.</p>';
        return;
      }
      listEl.innerHTML = logs.map(function (item) {
        return '<div class="log-item">' +
          '<div class="log-item-main">' +
            '<div class="log-item-top">' +
              '<span class="badge badge--safe">' + escapeHtml(item.type) + "</span>" +
              "<strong>" + escapeHtml(item.location) + " · " + escapeHtml(item.crop_name || "Lahan") + "</strong>" +
              '<span class="mono">' + escapeHtml(item.time_label) + "</span>" +
            "</div>" +
            "<p>" + escapeHtml(item.note) + "</p>" +
          "</div>" +
          '<div class="log-item-meta">' +
            '<span class="mono">Cuaca saat itu: ' + escapeHtml(item.weather_snap || "-") + "</span>" +
            '<button type="button" class="btn btn--ghost btn--sm" data-log-del="' + escapeHtml(String(item.id)) + '">Hapus</button>' +
          "</div>" +
        "</div>";
      }).join("");

      listEl.querySelectorAll("[data-log-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-log-del");
          var next = getLogs().filter(function (x) { return String(x.id) !== String(id); });
          saveLogs(next);
          renderLogbook();
          if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
        });
      });
    }

    var logForm = document.getElementById("logbook-form");
    if (logForm) {
      logForm.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var typeVal = document.getElementById("log-type").value;
        var noteInput = document.getElementById("log-note");
        var noteVal = noteInput ? noteInput.value.trim() : "";
        if (!noteVal) return;

        var cur = (latestWeatherData && latestWeatherData.current) || {};
        var cropObj = COMMODITIES.filter(function (c) { return Number(c.id) === Number(activeCropId); })[0] || COMMODITIES[0];
        var snap = num(cur.temp_c || 28, 0) + "°C · RH " + num(cur.humidity_pct || 72, 0) + "% · Hujan " + num(cur.rain_mm || 0, 1) + " mm";
        var now = new Date();
        var entry = {
          id: Date.now(),
          type: typeVal,
          note: noteVal,
          location: activeField ? (activeField.name + " (" + activeField.regency + ")") : state.regency,
          crop_name: cropObj.name,
          weather_snap: snap,
          time_label: shortDate(now.toISOString().slice(0, 10)) + " · " + clock(now.toISOString())
        };
        var logs = getLogs();
        logs.unshift(entry);
        saveLogs(logs);
        if (noteInput) noteInput.value = "";
        renderLogbook();
        if (latestWeatherData) renderAgronomyIntelligence(latestWeatherData, latestSummaryData);
      });
    }

    /* 1. Sistem Manajemen Lahan Aktif (Profil Komoditas + Tanggal Tanam + HST + Fase) */
    function loadFields() {
      var body = document.getElementById("fields-body");
      if (!body) return;
      if (!state.user) {
        body.innerHTML = '<div class="result-empty"><div><h3>Simpan Daftar Kebun Anda</h3>' +
          "<p>Masuk ke akun Mongso untuk menyimpan hingga 5 petak kebun beserta tanaman, tanggal tanam, dan titik koordinat kebun Anda.</p>" +
          '<button class="btn btn--sm mt-14" type="button" id="fields-login-btn">Masuk ke akun</button></div></div>';
        var btn = document.getElementById("fields-login-btn");
        if (btn) btn.addEventListener("click", openLogin);
        return;
      }

      apiGet("/api/v1/fields").then(function (fields) {
        var metaMap = getFieldMetaMap();
        var list = (fields || []).map(function (f) {
          var m = metaMap[String(f.id)] || metaMap[f.name] || {};
          var cid = Number(f.commodity_id || m.commodity_id || 1);
          var cObj = COMMODITIES.filter(function (c) { return Number(c.id) === cid; })[0] || COMMODITIES[0];
          var planted = m.planted_date || "";
          var hst = computeHst(planted);
          var phase = m.phase || inferPhaseFromHst(hst);
          return {
            id: f.id,
            name: f.name,
            latitude: f.latitude,
            longitude: f.longitude,
            commodity_id: cid,
            commodity_name: cObj.name,
            commodity_icon: cObj.icon,
            regency: m.regency || state.regency,
            planted_date: planted,
            hst: hst,
            phase: phase,
            area_ha: Number(m.area_ha || 1.0)
          };
        });

        var cards = list.map(function (f) {
          var isSelected = activeField && Number(activeField.id) === Number(f.id);
          var hstBadge = f.hst !== null ? ("Umur " + f.hst + " hari") : "Umur tanam belum diisi";
          var calcUrl = "kalkulator.html?commodity=" + encodeURIComponent(f.commodity_id) +
            "&regency=" + encodeURIComponent(f.regency) +
            "&area=" + encodeURIComponent(f.area_ha);
          return '<div class="field-card' + (isSelected ? " is-active" : "") + '">' +
            '<div class="field-card-head">' +
              "<div><strong>" + escapeHtml(f.name) + "</strong>" +
              '<div class="field-card-coords">' + escapeHtml(f.regency) + " · Titik " + Number(f.latitude).toFixed(4) + ", " + Number(f.longitude).toFixed(4) + " · " + num(f.area_ha, 1) + " ha</div></div>" +
              (isSelected ? '<span class="badge badge--safe">Sedang Dipantau</span>' : "") +
            "</div>" +
            '<div class="field-card-profile">' +
              '<span class="badge">' + escapeHtml(f.commodity_icon + " " + f.commodity_name) + "</span>" +
              '<span class="badge badge--neutral">' + escapeHtml(PHASE_LABELS[f.phase] || f.phase) + "</span>" +
              '<span class="mono">' + escapeHtml(hstBadge) + "</span>" +
            "</div>" +
            '<div class="field-card-actions">' +
              '<button class="btn btn--sm" type="button" data-field-use="' + f.id + '">Pantau Cuaca Kebun Ini</button>' +
              '<a class="btn btn--ghost btn--sm" href="' + escapeHtml(calcUrl) + '">Hitung Modal</a>' +
              '<button class="btn btn--ghost btn--sm" type="button" data-field-del="' + f.id + '">Hapus</button>' +
            "</div></div>";
        }).join("");

        var regOpts = REGENCIES.map(function (r) {
          return '<option value="' + escapeHtml(r) + '"' + (r === state.regency ? " selected" : "") + ">" + escapeHtml(r) + "</option>";
        }).join("");
        var cropOpts = COMMODITIES.map(function (c) {
          return '<option value="' + c.id + '">' + c.icon + " " + escapeHtml(c.name) + "</option>";
        }).join("");
        var defaultPlanted = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
        var defaultLat = activeSubdistrict ? activeSubdistrict.lat : -7.8166;
        var defaultLon = activeSubdistrict ? activeSubdistrict.lon : 112.0114;

        var formHtml = list.length < 5
          ? '<form class="field-form-inline field-form-inline--rich" id="field-add-form">' +
            '<div class="field"><label for="field-name">Nama kebun / blok</label><input id="field-name" type="text" placeholder="Contoh: Kebun Kidul Pare" required></div>' +
            '<div class="field"><label for="field-crop">Tanaman</label><select id="field-crop">' + cropOpts + "</select></div>" +
            '<div class="field"><label for="field-planted">Tanggal mulai tanam</label><input id="field-planted" type="date" value="' + defaultPlanted + '" required></div>' +
            '<div class="field"><label for="field-phase">Umur tanaman</label><select id="field-phase">' +
              '<option value="semai">Semai / Bibit (0-15 hari)</option>' +
              '<option value="vegetatif">Tumbuh Daun (16-35 hari)</option>' +
              '<option value="generatif" selected>Berbunga / Berbuah (36-65 hari)</option>' +
              '<option value="panen">Siap Panen (>65 hari)</option>' +
            "</select></div>" +
            '<div class="field"><label for="field-area">Luas (Ha)</label><input id="field-area" type="number" step="0.1" min="0.1" max="100" value="1.0" required></div>' +
            '<div class="field"><label for="field-reg">Kabupaten/kota</label><select id="field-reg">' + regOpts + "</select></div>" +
            '<div class="field"><label for="field-lat">Titik Lintang (Lat)</label><input id="field-lat" type="number" step="0.0001" min="-9.0" max="-6.5" value="' + defaultLat + '" required></div>' +
            '<div class="field"><label for="field-lon">Titik Bujur (Lon)</label><input id="field-lon" type="number" step="0.0001" min="110.8" max="114.7" value="' + defaultLon + '" required></div>' +
            '<button class="btn btn--sm" type="submit">Simpan Kebun</button></form>' +
            '<div class="form-error mt-14" id="field-form-error" hidden></div>'
          : '<p class="muted mt-14">Batas maksimal 5 kebun tersimpan telah penuh.</p>';

        body.innerHTML = (list.length ? '<div class="fields-grid">' + cards + "</div>" : '<p class="muted">Belum ada petak kebun tersimpan. Tambahkan kebun Anda di bawah agar prakiraan cuaca pas di titik lokasi kebun Anda.</p>') + formHtml;

        body.querySelectorAll("[data-field-use]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = Number(btn.getAttribute("data-field-use"));
            var found = list.filter(function (x) { return Number(x.id) === id; })[0];
            if (found) {
              activeField = found;
              activeCropId = Number(found.commodity_id) || 1;
              activePhase = found.phase || "generatif";
              if (cropSelect) cropSelect.value = String(activeCropId);
              if (phaseSelect) phaseSelect.value = activePhase;
              if (resetBtn) resetBtn.hidden = false;
              loadWeather();
              loadFields();
            }
          });
        });

        body.querySelectorAll("[data-field-del]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = Number(btn.getAttribute("data-field-del"));
            apiDelete("/api/v1/fields/" + id).then(function () {
              if (activeField && Number(activeField.id) === id) {
                activeField = null;
                if (resetBtn) resetBtn.hidden = true;
                loadWeather();
              }
              loadFields();
            }).catch(function () {});
          });
        });

        var addForm = document.getElementById("field-add-form");
        if (addForm) {
          var plantedInput = document.getElementById("field-planted");
          var phaseInput = document.getElementById("field-phase");
          if (plantedInput && phaseInput) {
            plantedInput.addEventListener("change", function () {
              var hst = computeHst(plantedInput.value);
              if (hst !== null) phaseInput.value = inferPhaseFromHst(hst);
            });
          }
          addForm.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var errEl = document.getElementById("field-form-error");
            if (errEl) errEl.hidden = true;
            var nameVal = document.getElementById("field-name").value.trim();
            var cropVal = Number(document.getElementById("field-crop").value) || 1;
            var plantedVal = document.getElementById("field-planted").value;
            var phaseVal = document.getElementById("field-phase").value;
            var areaVal = Number(document.getElementById("field-area").value) || 1.0;
            var regVal = document.getElementById("field-reg").value;
            var latVal = Number(document.getElementById("field-lat").value);
            var lonVal = Number(document.getElementById("field-lon").value);

            apiPost("/api/v1/fields", {
              name: nameVal,
              latitude: latVal,
              longitude: lonVal,
              commodity_id: cropVal
            }).then(function (created) {
              var metaObj = {
                commodity_id: cropVal,
                planted_date: plantedVal,
                phase: phaseVal,
                area_ha: areaVal,
                regency: regVal
              };
              if (created && created.id) saveFieldMeta(created.id, metaObj);
              saveFieldMeta(nameVal, metaObj);
              loadFields();
            }).catch(function (err) {
              if (errEl) {
                errEl.textContent = err.message || "Gagal menyimpan lahan.";
                errEl.hidden = false;
              }
            });
          });
        }
      }).catch(function () {
        body.innerHTML = '<p class="muted">Daftar lahan belum bisa dimuat.</p>';
      });
    }

    document.addEventListener("mongso:account", function () {
      loadFields();
    });

    window.mongsoReload = function () {
      activeField = null;
      activeSubdistrict = null;
      populateDistrictSelect();
      if (resetBtn) resetBtn.hidden = true;
      loadWeather();
      loadFields();
    };
    var resizeTimer;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (document.body.getAttribute("data-page") === "weather") {
          var chart = document.getElementById("hourly-chart");
          if (chart && chart.dataset.hours) {
            try { chart.innerHTML = hourlyChart(JSON.parse(chart.dataset.hours)); } catch (e) {}
          }
        }
      }, 150);
    });

    renderLogbook();
    loadWeather();
    loadFields();
  }

  function initMarket() {
    var root = document.getElementById("price-cards") || document.getElementById("market-commodity");
    if (!root) return;

    var retry = function () { loadMarket(); };
    var marketRows = [];
    var marketSummary = null;
    var marketSelect = document.getElementById("market-commodity");

    function renderTrend() {
      if (!marketRows.length) return;
      var selectedId = marketSelect ? marketSelect.value : String((marketRows[0] || {}).commodity_id || "");
      var row = marketRows.filter(function (item) { return String(item.commodity_id) === String(selectedId); })[0] || marketRows[0];
      if (marketSelect && String(marketSelect.value) !== String(row.commodity_id)) {
        marketSelect.value = String(row.commodity_id);
      }

      var trendValues = (row.sparkline || []).length ? row.sparkline : ((marketSummary && marketSummary.price_fluctuation_values) || []);
      var asOf = String((marketSummary && marketSummary.price_as_of) || "").slice(0, 10);
      var trendLabels = trendValues.map(function (_, index) {
        return shortDate(asOf ? shiftDate(asOf, index - trendValues.length + 1) : "");
      });
      setHtml("trend-chart", lineChart(trendValues, trendLabels) || '<p class="panel-pad muted">Tren harga belum tersedia.</p>');
      setText("trend-title", "Tren harga " + (row.commodity_name || "komoditas"));
      setText("trend-price", rupiah(row.daily_price) + " /kg");

      var change = Number(row.weekly_change_pct) || 0;
      var trendChange = document.getElementById("trend-change");
      if (trendChange) {
        trendChange.textContent = pct(change) + " pekan ini";
        trendChange.className = "badge " + (change < 0 ? "badge--danger" : "badge--safe");
      }

      var nums = trendValues.map(Number).filter(function (v) { return !Number.isNaN(v); });
      var lo = nums.length ? Math.min.apply(null, nums) : null;
      var hi = nums.length ? Math.max.apply(null, nums) : null;
      var rangeText = (lo !== null && hi !== null) ? (rupiah(lo) + " – " + rupiah(hi)) : "-";
      setText("trend-range", "Rentang harga " + rangeText);
      setText("trend-week", pct(change));
      setText("trend-range-2", rangeText);
      setText("trend-jatim", rupiah(row.jatim_avg_price));
      setText("trend-meaning-title", change < 0 ? "Harga turun, peluang beli sarana ada." : "Harga naik, baca pasar sebelum jual.");
      setText("trend-meaning-text", (row.commodity_name || "Komoditas") + " berubah " + pct(change) +
        " dalam pekan ini. Bandingkan harga lokal, rata-rata Jatim, dan margin pasar tujuan sebelum mengambil keputusan.");

      document.querySelectorAll("#price-cards .price-card[data-commodity-id]").forEach(function (card) {
        card.classList.toggle("price-card--selected", card.getAttribute("data-commodity-id") === String(row.commodity_id));
      });
    }

    function renderCompare() {
      var compareA = document.getElementById("compare-a");
      var compareB = document.getElementById("compare-b");
      var body = document.getElementById("compare-body");
      var chart = document.getElementById("compare-chart");
      if (!compareA || !compareB || !body) return;
      if (!marketRows.length) {
        body.innerHTML = '<tr><td colspan="5">Belum ada data perbandingan.</td></tr>';
        if (chart) chart.innerHTML = "";
        return;
      }

      var a = marketRows.filter(function (r) { return String(r.commodity_id) === String(compareA.value); })[0] || marketRows[0];
      var b = marketRows.filter(function (r) { return String(r.commodity_id) === String(compareB.value); })[0] || marketRows[1] || marketRows[0];
      if (a && String(compareA.value) !== String(a.commodity_id)) compareA.value = String(a.commodity_id);
      if (b && String(compareB.value) !== String(b.commodity_id)) compareB.value = String(b.commodity_id);

      var pick = [a, b].filter(Boolean).filter(function (row, idx, arr) {
        return arr.map(function (x) { return x.commodity_id; }).indexOf(row.commodity_id) === idx;
      });
      if (pick.length === 1 && marketRows.length > 1) {
        b = marketRows.filter(function (r) { return String(r.commodity_id) !== String(a.commodity_id); })[0];
        compareB.value = String(b.commodity_id);
        pick = [a, b];
      }

      body.innerHTML = pick.map(function (row) {
        var up = Number(row.weekly_change_pct) >= 0;
        return "<tr>" +
          '<td><div class="crop-cell"><span class="crop-icon" aria-hidden="true">' + escapeHtml(row.icon || "🌱") + "</span>" +
          "<div><strong>" + escapeHtml(row.commodity_name) + "</strong><span>per kilogram</span></div></div></td>" +
          '<td class="num price">' + rupiah(row.daily_price) + "</td>" +
          '<td class="num">' + rupiah(row.jatim_avg_price) + "</td>" +
          '<td class="num ' + (up ? "pos" : "neg") + '">' + pct(row.weekly_change_pct) + "</td>" +
          '<td class="num">' + sparkline(row.sparkline) + "</td></tr>";
      }).join("");

      if (chart) {
        var charts = pick.map(function (row) {
          var values = (row.sparkline || []).map(Number).filter(function (v) { return !Number.isNaN(v); });
          var asOf = String((marketSummary && marketSummary.price_as_of) || "").slice(0, 10);
          var labels = values.map(function (_, index) {
            return shortDate(asOf ? shiftDate(asOf, index - values.length + 1) : "");
          });
          return '<div class="compare-chart-item"><p class="mono">' + escapeHtml(row.commodity_name) + " · " + rupiah(row.daily_price) + '/kg</p>' +
            (lineChart(values, labels) || '<p class="panel-pad muted">Grafik belum tersedia.</p>') + "</div>";
        }).join("");
        chart.innerHTML = '<div class="compare-charts">' + charts + "</div>";
      }
    }

    if (marketSelect) {
      marketSelect.addEventListener("change", renderTrend);
    }

    ["compare-a", "compare-b"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", renderCompare);
    });

    function loadMarket() {
      var cards = document.getElementById("price-cards");
      if (cards) cards.innerHTML = '<p class="loading">Memuat harga pasar…</p>';
      setHtml("trend-chart", '<p class="loading">Memuat tren…</p>');
      errorState(document.getElementById("market-error"), "");

      apiGet("/api/v1/dashboard/summary", { regency: state.regency }).then(function (data) {
        marketSummary = data;
        marketRows = data.siskaperbapo_table || [];

        setText("market-regency", state.regency);
        setText("market-updated", "Harga per " + shortDate(data.price_as_of));
        setText("market-count", marketRows.length + " komoditas");
        setText("market-rain", num(data.weekly_rainfall_mm, 1) + " mm");
        setText("market-risk", num(data.risk_score, 0) + "%");

        if (marketSelect) {
          var previous = marketSelect.value;
          marketSelect.innerHTML = marketRows.map(function (row) {
            return '<option value="' + escapeHtml(String(row.commodity_id)) + '">' +
              escapeHtml((row.icon ? row.icon + " " : "") + row.commodity_name) + "</option>";
          }).join("");
          var keep = marketRows.filter(function (row) { return String(row.commodity_id) === String(previous); })[0];
          marketSelect.value = String((keep || marketRows[0] || {}).commodity_id || "");
        }

        ["compare-a", "compare-b"].forEach(function (id, index) {
          var select = document.getElementById(id);
          if (!select) return;
          var prev = select.value;
          select.innerHTML = marketRows.map(function (row) {
            return '<option value="' + escapeHtml(String(row.commodity_id)) + '">' +
              escapeHtml((row.icon ? row.icon + " " : "") + row.commodity_name) + "</option>";
          }).join("");
          var kept = marketRows.filter(function (row) { return String(row.commodity_id) === String(prev); })[0];
          var fallback = marketRows[index] || marketRows[0] || {};
          select.value = String((kept || fallback).commodity_id || "");
        });

        if (cards) {
          cards.innerHTML = marketRows.slice(0, 3).map(function (row, index) {
            var up = Number(row.weekly_change_pct) >= 0;
            return '<button type="button" class="panel price-card' + (index === 0 ? " price-card--selected" : "") + '" data-commodity-id="' + escapeHtml(String(row.commodity_id)) + '">' +
              '<div class="price-top"><div class="price-name"><span class="crop-icon" aria-hidden="true">' +
              escapeHtml(row.icon || "🌱") + "</span><div><h3>" + escapeHtml(row.commodity_name) +
              "</h3><span>per kilogram</span></div></div>" +
              (index === 0 ? '<span class="badge badge--safe">Harga acuan</span>' : '<span class="badge badge--neutral">SISKAPERBAPO</span>') +
              "</div>" +
              '<div class="price-value">' + rupiah(row.daily_price) + " <small>/kg</small></div>" +
              '<div class="price-foot"><span class="price-delta' + (up ? "" : " is-down") + '">' +
              pct(row.weekly_change_pct) + " pekan ini</span>" + sparkline(row.sparkline, { color: up ? "#23533e" : "#b5382a" }) +
              "</div></button>";
          }).join("");

          cards.querySelectorAll("[data-commodity-id]").forEach(function (button) {
            button.addEventListener("click", function () {
              if (marketSelect) {
                marketSelect.value = button.getAttribute("data-commodity-id");
                renderTrend();
              }
              cards.querySelectorAll(".price-card").forEach(function (card) {
                card.classList.toggle("price-card--selected", card === button);
              });
            });
          });
        }

        renderTrend();
        renderCompare();

        var radar = data.market_radar_alternatives || {};
        var markets = (radar.markets || []).slice().sort(function (a, b) {
          return Number(b.potential_gain_per_ton) - Number(a.potential_gain_per_ton);
        }).slice(0, 4);

        setHtml("radar-list", markets.map(function (market) {
          var gain = Number(market.potential_gain_per_ton) || 0;
          return '<div class="radar-row">' +
            '<div class="radar-name"><span class="crop-icon" aria-hidden="true">🏬</span>' +
            "<div><strong>" + escapeHtml(market.market_name) + "</strong><span>" + escapeHtml(market.city) + "</span></div></div>" +
            '<div class="radar-num"><strong>' + rupiah(market.destination_price_rp) + "/kg</strong>" +
            "<span>" + escapeHtml(market.recommendation_badge || "") + "</span></div>" +
            '<div class="radar-num"><strong class="' + (gain >= 0 ? "pos" : "neg") + '">' +
            (gain >= 0 ? "+" : "−") + compactRupiah(Math.abs(gain)) + "</strong><span>per ton</span></div></div>";
        }).join("") || '<p class="panel-pad muted">Belum ada radar pasar untuk komoditas ini.</p>');
      }).catch(function (error) {
        errorState(document.getElementById("market-error"),
          error.message + ". Pastikan backend berjalan dan halaman dibuka dari alamat server yang sama.",
          retry);
        if (cards) cards.innerHTML = "";
        setHtml("trend-chart", "");
        setHtml("radar-list", "");
      });
    }

    window.mongsoReload = loadMarket;
    var resizeTimer;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (document.body.getAttribute("data-page") === "market") {
          renderTrend();
          renderCompare();
        }
      }, 150);
    });
    loadMarket();
  }

  function initCalculator() {
    var form = document.getElementById("calc-form");
    if (!form) return;

    var commodity = document.getElementById("calc-commodity");
    var area = document.getElementById("calc-area");
    var date = document.getElementById("calc-date");
    var regency = document.getElementById("calc-regency");
    var result = document.getElementById("calc-result");
    var priceContext = document.getElementById("calc-price-context");

    commodity.innerHTML = COMMODITIES.map(function (item) {
      return '<option value="' + item.id + '">' + item.icon + " " + escapeHtml(item.name) + "</option>";
    }).join("");

    if (regency) {
      regency.innerHTML = REGENCIES.map(function (name) {
        return '<option value="' + escapeHtml(name) + '"' + (name === state.regency ? " selected" : "") + ">" +
          escapeHtml(name) + "</option>";
      }).join("");
      regency.addEventListener("change", function () {
        state.regency = regency.value;
        store.set("mongso-regency", state.regency);
        regencySelects.forEach(function (select) { select.value = state.regency; });
      });
    }

    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date) date.value = tomorrow.toISOString().slice(0, 10);

    function selectedCommodity() {
      return COMMODITIES.filter(function (item) { return String(item.id) === String(commodity.value); })[0] || COMMODITIES[0];
    }

    function updateCalcContext() {
      setText("calc-context-regency", (regency ? regency.value : state.regency) || state.regency);
      var item = selectedCommodity();
      setText("calc-context-commodity", (item ? item.icon + " " + item.name : "Rencana tanam"));
      setText("calc-context-area", num(String(area.value || "1").replace(",", "."), 1) + " ha");
    }

    function friendlyRiskStatus(s) {
      var raw = String(s || "");
      if (raw.indexOf("OVERSUPPLY") !== -1) return "AWAS PANEN BARENGAN (PASOKAN PENUH)";
      if (raw.indexOf("WASPADA") !== -1) return "MULAI BANYAK YANG TANAM (WASPADA)";
      if (raw.indexOf("AMAN") !== -1) return "AMAN DITANAM (PASAR MASIH LONGGAR)";
      return raw || "Aman";
    }

    function friendlyKelayakan(s) {
      var raw = String(s || "");
      if (raw.indexOf("SANGAT LAYAK") !== -1) return "SANGAT MENGUNTUNGKAN";
      if (raw.indexOf("LAYAK") !== -1) return "CUKUP MENGUNTUNGKAN";
      if (raw.indexOf("RAWAN") !== -1 || raw.indexOf("TIPIS") !== -1) return "UNTUNG TIPIS (RAWAN RUGI)";
      return raw;
    }

    function friendlyPestText(s) {
      return String(s || "")
        .replace(/\s*\(Colletotrichum[^)]*\)/gi, "")
        .replace(/\s*\(Fusarium[^)]*\)/gi, "")
        .replace(/\s*\(Alternaria[^)]*\)/gi, "")
        .replace(/\s*\(Spodoptera[^)]*\)/gi, "")
        .replace(/\s*\(Bemisia[^)]*\)/gi, "")
        .replace(/\s*\(Phytophthora[^)]*\)/gi, "")
        .replace(/\s*\(Xanthomonas[^)]*\)/gi, "")
        .replace(/Antraknosa\s*\/\s*Patek/gi, "Penyakit Patek (Busuk Buah)")
        .replace(/Layu Fusarium/gi, "Penyakit Layu / Moler")
        .replace(/spora jamur ganas/gi, "jamur berkembang cepat")
        .replace(/drainase bedengan/gi, "parit bedengan")
        .replace(/fungisida/gi, "obat jamur");
    }

    function loadMyPlans() {
      var body = document.getElementById("my-plans-body");
      if (!body) return;
      if (!state.user) {
        body.innerHTML = '<div class="panel-pad"><p class="muted">Masuk ke akun Mongso untuk melihat riwayat rencana tanam yang sudah Anda simpan.</p></div>';
        return;
      }
      apiGet("/api/v1/planting-plans/my-plans").then(function (data) {
        var plans = (data && data.plans) || [];
        if (!plans.length) {
          body.innerHTML = '<div class="panel-pad"><p class="muted">Belum ada rencana tanam tersimpan di akun Anda.</p></div>';
          return;
        }
        body.innerHTML = '<table class="table table--figma">' +
          '<caption class="sr-only">Rencana tanam tersimpan</caption>' +
          '<thead><tr><th scope="col">Tanaman</th><th scope="col">Lokasi</th><th scope="col" class="num">Luas (Ha)</th><th scope="col">Mulai tanam</th><th scope="col">Perkiraan panen</th><th scope="col">Kondisi pasar</th></tr></thead>' +
          "<tbody>" + plans.map(function (p) {
            var score = Number(p.risk_score) || 0;
            return "<tr>" +
              "<td><strong>" + escapeHtml((p.commodity_icon ? p.commodity_icon + " " : "") + p.commodity_name) + "</strong></td>" +
              "<td>" + escapeHtml(p.regency_name) + "</td>" +
              '<td class="num">' + num(p.area_ha, 1) + " ha</td>" +
              "<td>" + escapeHtml(p.start_date) + "</td>" +
              "<td>" + escapeHtml(p.estimated_harvest_date) + "</td>" +
              '<td><span class="badge ' + (score >= 70 ? "badge--danger" : score >= 40 ? "badge--warn" : "badge--safe") + '">' +
              escapeHtml(num(score, 0) + "% · " + friendlyRiskStatus(p.risk_status)) + "</span></td></tr>";
          }).join("") + "</tbody></table>";
      }).catch(function () {
        body.innerHTML = '<div class="panel-pad"><p class="muted">Riwayat rencana tanam belum bisa dimuat.</p></div>';
      });
    }

    function loadPriceContext() {
      if (!priceContext) return;
      updateCalcContext();
      apiGet("/api/v1/dashboard/summary", { regency: regency ? regency.value : state.regency }).then(function (data) {
        var item = (data.siskaperbapo_table || []).filter(function (row) {
          return String(row.commodity_id) === String(commodity.value);
        })[0];
        if (item) {
          priceContext.textContent = "Harga " + item.commodity_name + " hari ini " + rupiah(item.daily_price) + "/kg (" +
            (item.price_is_estimated ? "perkiraan" : "SISKAPERBAPO") + ").";
        } else {
          priceContext.textContent = "Harga komoditas ini belum tersedia di SISKAPERBAPO.";
        }
      }).catch(function () {
        priceContext.textContent = "Harga pasar belum bisa dimuat.";
      });
    }

    commodity.addEventListener("change", loadPriceContext);
    if (regency) regency.addEventListener("change", loadPriceContext);
    area.addEventListener("input", updateCalcContext);
    loadPriceContext();
    loadMyPlans();

    function renderEmpty() {
      result.innerHTML = '<div class="result-empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' +
        '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/></svg>' +
        "<div><h3>Hasil evaluasi muncul di sini</h3>" +
        "<p>Isi luas lahan dan tanggal tanam, lalu jalankan evaluasi. Data dihitung dari kuota pasar dan cuaca terkini.</p></div></div>";
    }

    function renderLoading() {
      result.innerHTML = '<div class="panel panel-pad"><p class="loading">Menghitung risiko dan kelayakan…</p></div>';
    }

    function renderResult(data) {
      var score = Number(data.risk_score) || 0;
      var pest = data.pest_warning || {};
      var cost = data.cost_profit_feasibility || {};
      var radar = data.market_radar_alternatives || {};
      var markets = (radar.markets || []).slice().sort(function (a, b) {
        return Number(b.potential_gain_per_ton) - Number(a.potential_gain_per_ton);
      }).slice(0, 3);

      var budget = "";
      if (cost.breakdown) {
        var labels = {
          bibit: "Bibit / Benih", pupuk: "Pupuk Dasar & Susulan", sarana_prasarana: "Mulsa, Ajir & Alat",
          tenaga_kerja: "Ongkos Tenaga Kerja", proteksi_tanaman: "Obat Hama & Jamur"
        };
        budget = Object.keys(cost.breakdown).map(function (key) {
          var item = cost.breakdown[key];
          return '<div class="budget-row"><span>' + escapeHtml(labels[key] || key) + "</span><strong>" +
            rupiah(item.biaya_rp) + "</strong></div>";
        }).join("") +
          '<div class="budget-row budget-row--total"><span>Total Modal Kebun</span><strong>' +
          rupiah(cost.total_modal_rp) + "</strong></div>";
      }

      result.innerHTML =
        '<div class="calc-result">' +
          '<div class="result-hero">' +
            '<div class="result-hero-top"><div><p class="eyebrow">Hasil Hitungan Rencana Tanam</p>' +
            "<h2>" + escapeHtml(data.commodity_name) + " · " + num(data.input_area_ha, 1) + " ha · " +
            escapeHtml(data.regency_name) + "</h2>" +
            "<p>Batas aman tanam wilayah: " + num(data.safe_market_quota_ha, 0) + " ha · Total yang sudah ditanam: " +
            num(data.total_window_projected_ha, 1) + " ha</p></div>" +
            '<span class="badge ' + riskClass(score) + '">' + escapeHtml(data.risk_badge || data.risk_status) + "</span></div>" +

            '<div class="result-hero-main"><div class="gauge">' + gauge(score) +
            '<div class="gauge-center"><strong>' + num(score, 0) + '%</strong><span>Risiko</span></div></div>' +
            '<div><p class="result-score-label">Kondisi Pasokan Pasar Saat Panen Nanti</p>' +
            '<strong class="result-status">' + escapeHtml(friendlyRiskStatus(data.risk_status)) + "</strong>" +
            '<p>Perkiraan luas panen barengan: ' + num(data.total_window_projected_ha, 1) + " ha (" +
            num(data.quota_utilization_percent, 1) + "% dari daya serap pasar).</p></div></div>" +

            '<div class="result-facts">' +
            '<div class="result-fact"><span>Perkiraan Tanggal Panen</span><strong>' + escapeHtml(data.estimated_harvest_date) + "</strong></div>" +
            '<div class="result-fact"><span>Masa Panen Raya</span><strong>' + escapeHtml(data.harvest_window.start) + " – " +
            escapeHtml(data.harvest_window.end) + "</strong></div>" +
            '<div class="result-fact"><span>Hujan Mingguan</span><strong>' + num(data.weekly_rainfall_mm, 1) + " mm</strong></div>" +
            '<div class="result-fact"><span>Persentase Untung</span><strong>' + num(cost.roi_percent, 1) + "%</strong></div></div>" +
          "</div>" +

          '<div class="panel calc-result-card"><h3>Hitungan Modal, Harga Impas, dan Untung Bersih</h3>' +
          '<div class="profit-grid">' +
          '<div class="profit-item"><span>Total Modal</span><strong>' + compactRupiah(cost.total_modal_rp) + "</strong></div>" +
          '<div class="profit-item"><span>Harga Balik Modal (/kg)</span><strong>' + rupiah(cost.hpp_per_kg) + "</strong></div>" +
          '<div class="profit-item"><span>Perkiraan Hasil Jual</span><strong>' + compactRupiah(cost.estimasi_omzet_rp) + "</strong></div>" +
          '<div class="profit-item profit-item--dark"><span>Perkiraan Untung Bersih</span><strong>' +
          compactRupiah(cost.potensi_keuntungan_rp) + "</strong></div></div>" +
          '<p class="calc-price-context mt-14">Agar tidak rugi, hasil panen harus laku minimal <strong>' + rupiah(cost.hpp_per_kg) + '/kg</strong>. Status: ' + escapeHtml(friendlyKelayakan(cost.kelayakan_status)) +
          " (Untung " + num(cost.roi_percent, 1) + "% dari modal)</p></div>" +

          '<div class="grid-2">' +
            '<div class="panel calc-result-card"><h3>Rincian Biaya Modal Kebun</h3><div class="budget-list">' + budget + "</div></div>" +
            '<div class="panel calc-result-card"><h3>Penyakit &amp; Hama yang Perlu Dijaga</h3>' +
            '<div class="advice advice--warn">' +
            '<span class="advice-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></span>' +
            "<div><strong>" + escapeHtml(pest.risk_badge || "Aman Terkendali") + "</strong>" +
            "<p>" + escapeHtml(friendlyPestText(pest.primary_threat)) + " · " + escapeHtml(friendlyPestText(pest.critical_phase)) + "</p>" +
            '<p class="mt-14">' + escapeHtml(friendlyPestText(pest.trigger_weather)) + "</p></div></div></div>" +
          "</div>" +

          '<div class="panel calc-result-card"><h3>Pasar Induk Tujuan Paling Untung (Sudah Potong Ongkos Truk)</h3>' +
          (markets.length ? markets.map(function (market) {
            var gain = Number(market.potential_gain_per_ton) || 0;
            return '<div class="budget-row"><span>' + escapeHtml(market.market_name) +
              " · " + escapeHtml(market.city) + '</span><strong class="' + (gain >= 0 ? "pos" : "neg") + '">' +
              (gain >= 0 ? "+" : "−") + compactRupiah(Math.abs(gain)) + "/ton</strong></div>";
          }).join("") : '<p class="muted">Belum ada alternatif pasar.</p>') +
          "</div>" +

          '<div class="calc-result-foot">' +
          '<p>Hitungan ini sebagai patokan awal. Hasil di lapangan mengikuti perawatan kebun dan harga pasar saat panen.</p>' +
          '<button class="btn btn--sm" type="button" id="calc-save">Simpan Rencana Tanam</button></div>' +
        "</div>";

      var save = document.getElementById("calc-save");
      if (save) {
        if (!state.user) save.textContent = "Masuk untuk menyimpan";
        save.addEventListener("click", function () {
          if (!state.user) { openLogin(); return; }
          save.disabled = true;
          save.textContent = "Menyimpan…";
          apiPost("/api/v1/planting-plans/save", {
            commodity_id: Number(commodity.value),
            regency_name: regency ? regency.value : state.regency,
            area_ha: Number(area.value),
            start_date: date.value
          }).then(function () {
            save.textContent = "Rencana tersimpan";
            save.classList.remove("btn");
            save.classList.add("badge", "badge--safe");
            loadMyPlans();
          }).catch(function (error) {
            save.disabled = false;
            save.textContent = "Coba simpan lagi";
            if (error.status === 401) openLogin();
          });
        });
      }
    }

    function evaluate() {
      var areaValue = Number(String(area.value).replace(",", "."));
      if (!areaValue || areaValue <= 0) {
        result.innerHTML = '<div class="error-state"><div><strong>Luas lahan belum benar.</strong>' +
          "Isi luas lahan lebih dari 0 hektare.</div></div>";
        return;
      }
      if (!date.value) {
        result.innerHTML = '<div class="error-state"><div><strong>Tanggal tanam belum diisi.</strong>' +
          "Pilih tanggal mulai tanam.</div></div>";
        return;
      }

      renderLoading();
      apiPost("/api/v1/planting-plans/evaluate", {
        commodity_id: Number(commodity.value),
        regency_name: regency ? regency.value : state.regency,
        area_ha: areaValue,
        start_date: date.value
      }).then(renderResult).catch(function (error) {
        result.innerHTML = '<div class="error-state"><div><strong>Evaluasi gagal.</strong>' +
          escapeHtml(error.message) + '<br><button class="btn btn--ghost btn--sm" type="button" data-retry> Coba lagi</button></div></div>';
        var retry = result.querySelector("[data-retry]");
        if (retry) retry.addEventListener("click", evaluate);
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      evaluate();
    });

    var reset = document.getElementById("calc-reset");
    if (reset) {
      reset.addEventListener("click", function () {
        commodity.value = "1";
        if (regency) regency.value = state.regency;
        area.value = "1";
        var next = new Date();
        next.setDate(next.getDate() + 1);
        date.value = next.toISOString().slice(0, 10);
        renderEmpty();
        loadPriceContext();
      });
    }

    document.addEventListener("mongso:account", function () {
      var save = document.getElementById("calc-save");
      if (save && save.textContent === "Masuk untuk menyimpan" && state.user) {
        save.textContent = "Simpan rencana";
      }
      loadMyPlans();
    });

    window.mongsoReload = function () {
      if (regency) regency.value = state.regency;
      loadPriceContext();
    };

    renderEmpty();

    try {
      var params = new URLSearchParams(window.location.search || "");
      var pCrop = params.get("commodity");
      var pReg = params.get("regency");
      var pArea = params.get("area");
      var pDate = params.get("date");
      var hasParam = false;
      if (pCrop && commodity) {
        commodity.value = String(pCrop);
        hasParam = true;
      }
      if (pReg && REGENCIES.indexOf(pReg) !== -1) {
        state.regency = pReg;
        store.set("mongso-regency", pReg);
        if (regency) regency.value = pReg;
        regencySelects.forEach(function (s) { s.value = pReg; });
        hasParam = true;
      }
      if (pArea && area) {
        area.value = String(pArea);
        hasParam = true;
      }
      if (pDate && date) {
        date.value = String(pDate);
        hasParam = true;
      }
      if (hasParam) {
        loadPriceContext();
        evaluate();
      }
    } catch (e) {}
  }

  function boot() {
    var now = todayLabel();
    document.querySelectorAll("[data-context-date]").forEach(function (node) { node.textContent = now; });
    loadAccount();
    var page = document.body.getAttribute("data-page");
    if (page === "dashboard") initDashboard();
    else if (page === "weather") initWeather();
    else if (page === "market") initMarket();
    else if (page === "calculator") initCalculator();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
