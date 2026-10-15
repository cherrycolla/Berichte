(function () {
  'use strict';

  var DAY = 86400000;
  var cfg = window.CONFIG || {};
  var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var ROLLEN = { admin: 'Administrator', ausbilder: 'Ausbilder', azubi: 'Azubi' };
  var HOME = { admin: 'admin.html', ausbilder: 'ausbilder.html', azubi: 'berichte.html' };
  var STATUS = { entwurf: 'Entwurf', fertig: 'Fertig', unterschrieben: 'Unterschrieben' };
  var ART = { betrieb: 'Betrieb', schule: 'Berufsschule', frei: 'Frei' };
  var WT_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var WT_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  function $(id) { return document.getElementById(id); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function zahl(n) { return String(Math.round(n * 10) / 10).replace('.', ','); }

  function mondayOf(y, w) {
    var j4 = Date.UTC(y, 0, 4);
    var dow = (new Date(j4).getUTCDay() + 6) % 7;
    return j4 - dow * DAY + (w - 1) * 7 * DAY;
  }
  function isoOf(ms) {
    var dn = (new Date(ms).getUTCDay() + 6) % 7;
    var th = ms - dn * DAY + 3 * DAY;
    var y = new Date(th).getUTCFullYear();
    return { y: y, w: 1 + Math.round((th - mondayOf(y, 1) - 3 * DAY) / (7 * DAY)) };
  }
  function parseDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  }
  function fmt(ms, full) {
    var d = new Date(ms);
    return pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' + (full ? d.getUTCFullYear() : '');
  }
  function keyOf(y, w) { return y + '-W' + pad(w); }

  function info(datum, beginn) {
    var ms = parseDate(datum);
    var o = isoOf(ms);
    var mon = mondayOf(o.y, o.w);
    var aw = 0, aj = 0;
    var b = parseDate(beginn);
    if (!isNaN(b)) {
      var bi = isoOf(b);
      aw = Math.round((mon - mondayOf(bi.y, bi.w)) / (7 * DAY)) + 1;
      if (aw >= 1) {
        var sd = new Date(b);
        var yrs = new Date(ms).getUTCFullYear() - sd.getUTCFullYear();
        if (ms < Date.UTC(sd.getUTCFullYear() + yrs, sd.getUTCMonth(), sd.getUTCDate())) yrs--;
        aj = Math.max(0, yrs) + 1;
      }
    }
    return { ms: ms, wd: new Date(ms).getUTCDay(), y: o.y, w: o.w, wk: keyOf(o.y, o.w), mon: mon, sun: mon + 6 * DAY, aw: aw, aj: aj };
  }
  function stunden(r) { return (+r.stunden_betrieb || 0) + (+r.stunden_schule || 0); }

  var meldungTimer = null;
  function note(t) {
    var m = $('meldung');
    if (!m) return;
    m.textContent = t;
    clearTimeout(meldungTimer);
    meldungTimer = setTimeout(function () { m.textContent = ''; }, 5000);
  }

  function copyText(t) {
    return new Promise(function (res, rej) {
      function fallback() {
        var a = document.createElement('textarea');
        a.value = t;
        a.setAttribute('readonly', '');
        a.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(a);
        a.select();
        a.setSelectionRange(0, t.length);
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        a.remove();
        ok ? res() : rej();
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(res, fallback);
      else fallback();
    });
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function latin(s) {
    return String(s == null ? '' : s)
      .replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'")
      .replace(/[–—]/g, '-').replace(/…/g, '...').replace(/€/g, 'EUR')
      .replace(/\r/g, '').replace(/[^\n\t\x20-\xFF]/g, '?');
  }
  function makePdf(file, titel, kopf, eintraege) {
    if (!window.jspdf) { note('PDF-Baustein nicht geladen. Seite neu laden.'); return; }
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    var L = 20, R = 190, B = 277, W = R - L, y = 20;
    function platz(h) { if (y + h > B) { doc.addPage(); y = 20; } }
    function zeilen(text, size, style, gap, farbe) {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(size);
      doc.setTextColor(farbe || 30);
      var lh = size * 0.45;
      doc.splitTextToSize(latin(text), W).forEach(function (z) {
        platz(lh);
        doc.text(z, L, y);
        y += lh;
      });
      y += gap || 0;
    }
    zeilen(titel, 20, 'bold', 2);
    if (kopf) zeilen(kopf, 10, 'normal', 6, 90);
    doc.setDrawColor(0, 159, 227);
    doc.setLineWidth(0.6);
    doc.line(L, y - 2, R, y - 2);
    y += 5;
    eintraege.forEach(function (e) {
      if (e.woche) {
        platz(48);
        y += 3;
        zeilen(e.woche, 12, 'bold', 3, 0);
        return;
      }
      platz(30);
      zeilen(e.tag, 11, 'bold', 1);
      zeilen(e.stand, 9, 'normal', 3, 100);
      e.bloecke.forEach(function (b) {
        platz(14);
        zeilen(b[0], 9, 'bold', 1, 70);
        zeilen(b[1] || '-', 10, 'normal', 3);
      });
      if (e.signatur) zeilen(e.signatur, 9, 'italic', 2, 0);
      y += 3;
      doc.setDrawColor(210);
      doc.setLineWidth(0.2);
      doc.line(L, y - 2, R, y - 2);
      y += 3;
    });
    var n = doc.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text('Seite ' + p + ' von ' + n, R, 287, { align: 'right' });
    }
    doc.save(file);
  }

  async function profileOf(session) {
    var res = await sb.from('profiles').select('*').eq('id', session.user.id).single();
    return res.error ? null : res.data;
  }

  async function start(allowed) {
    var s = await sb.auth.getSession();
    var session = s.data && s.data.session;
    if (!session) { location.replace('index.html'); return null; }
    var p = await profileOf(session);
    if (!p) {
      await sb.auth.signOut();
      location.replace('index.html');
      return null;
    }
    if (allowed.indexOf(p.role) < 0) { location.replace(HOME[p.role]); return null; }
    return { sb: sb, profile: p };
  }

  function renderHeader(profile) {
    var kopf = $('kopf');
    kopf.textContent = '';
    var text = el('div', 'kopf-text');
    text.appendChild(el('h1', 'salty', 'Berichte'));
    text.appendChild(el('p', 'script', 'Ausbildungsnachweis'));
    var teile = [profile.name || profile.email, ROLLEN[profile.role]];
    text.appendChild(el('p', 'sub', teile.join(' · ')));
    kopf.appendChild(text);
    var tools = el('div', 'tools');
    tools.id = 'tools';
    var out = el('button', 'btn', 'Abmelden');
    out.type = 'button';
    out.addEventListener('click', async function () {
      await sb.auth.signOut();
      location.replace('index.html');
    });
    tools.appendChild(out);
    kopf.appendChild(tools);
    return tools;
  }

  function fehlerText(e) {
    if (!e) return '';
    var m = e.message || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-Mail oder Passwort stimmt nicht.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung zum Server.';
    return m;
  }
  async function funktionsFehler(error) {
    try {
      var j = await error.context.json();
      if (j && j.error) return j.error;
    } catch (e) {}
    return fehlerText(error);
  }

  window.App = {
    sb: sb, cfg: cfg, ROLLEN: ROLLEN, HOME: HOME, STATUS: STATUS, ART: ART, WT_KURZ: WT_KURZ, WT_LANG: WT_LANG,
    $: $, pad: pad, el: el, zahl: zahl, parseDate: parseDate, fmt: fmt, info: info, stunden: stunden,
    note: note, copyText: copyText, download: download, makePdf: makePdf, start: start, renderHeader: renderHeader,
    profileOf: profileOf, fehlerText: fehlerText, funktionsFehler: funktionsFehler
  };
})();
