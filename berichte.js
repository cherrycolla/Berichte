(async function () {
  'use strict';
  var A = window.App, sb = A.sb, $ = A.$, el = A.el, pad = A.pad, zahl = A.zahl;
  var ctx = await A.start(['azubi']);
  if (!ctx) return;
  var me = ctx.profile;
  var tools = A.renderHeader(me);

  var exp = el('button', 'btn prim', 'Als PDF laden');
  exp.type = 'button';
  tools.insertBefore(exp, tools.firstChild);

  var state = { reports: {}, sel: null };
  var timers = {}, pending = {}, queue = {}, delTimer = null;

  function newReport() {
    return { art: 'betrieb', betrieb: '', stunden_betrieb: 8, schule: '', stunden_schule: 0, unterweisung: '', status: 'entwurf' };
  }
  function infoOf(k) { return A.info(k, me.beginn); }
  function gesperrt(r) { return r && r.status === 'unterschrieben'; }
  function guard(k) { return pending[k] > 0 || timers[k] != null; }

  function setStand(kind, err) {
    var t = '';
    if (kind === 'dirty') t = 'Änderung …';
    else if (kind === 'saving') t = 'Speichert …';
    else if (kind === 'saved') t = 'Gespeichert ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    else if (kind === 'error') t = 'Speichern fehlgeschlagen';
    $('stand').textContent = t;
    if (kind === 'error' && err) A.note(A.fehlerText(err));
  }

  function persist(k) {
    pending[k] = (pending[k] || 0) + 1;
    setStand('saving');
    var p = (queue[k] || Promise.resolve()).then(async function () {
      var r = state.reports[k];
      if (!r) return;
      var res = await sb.from('tagesberichte').upsert({
        azubi_id: me.id, datum: k, art: r.art, betrieb: r.betrieb, stunden_betrieb: r.stunden_betrieb,
        schule: r.schule, stunden_schule: r.stunden_schule, unterweisung: r.unterweisung, status: r.status
      }, { onConflict: 'azubi_id,datum' });
      if (res.error) throw res.error;
    }).then(function () { setStand('saved'); }, function (e) { setStand('error', e); })
      .then(function () { pending[k]--; });
    queue[k] = p;
  }
  function schedule(k) {
    setStand('dirty');
    clearTimeout(timers[k]);
    timers[k] = setTimeout(function () { delete timers[k]; persist(k); renderList(); }, 700);
  }
  function flush() {
    Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); delete timers[k]; persist(k); });
  }

  function renderList() {
    var box = $('liste');
    box.textContent = '';
    var keys = Object.keys(state.reports).sort().reverse();
    $('anzahl').textContent = keys.length ? String(keys.length) : '';
    if (!keys.length) {
      box.appendChild(el('p', 'leer-liste', 'Noch kein Tag angelegt. Datum wählen und auf „Anlegen“ tippen.'));
      return;
    }
    var wsum = {};
    keys.forEach(function (k) { var i = infoOf(k); wsum[i.wk] = (wsum[i.wk] || 0) + A.stunden(state.reports[k]); });
    var last = null;
    keys.forEach(function (k) {
      var i = infoOf(k), r = state.reports[k];
      if (i.wk !== last) {
        last = i.wk;
        var g = el('h3', 'grp');
        g.appendChild(el('span', null, 'KW ' + pad(i.w) + ' · ' + A.fmt(i.mon) + '–' + A.fmt(i.sun)));
        g.appendChild(el('span', null, zahl(wsum[i.wk]) + ' Std.'));
        box.appendChild(g);
      }
      var b = el('button', 'wk');
      b.type = 'button';
      b.setAttribute('data-k', k);
      if (k === state.sel) b.setAttribute('aria-current', 'true');
      var l = el('span');
      l.appendChild(el('span', 'kw', A.WT_KURZ[i.wd] + ' ' + A.fmt(i.ms)));
      l.appendChild(el('span', 'rng', A.ART[r.art] || A.ART.betrieb));
      b.appendChild(l);
      var s = el('span', 'pill', A.STATUS[r.status] || A.STATUS.entwurf);
      s.setAttribute('data-s', r.status);
      b.appendChild(s);
      var text = r.art === 'schule' && r.schule ? r.schule : r.betrieb;
      var first = (text || '').split('\n').filter(function (x) { return x.trim(); })[0];
      b.appendChild(el('span', 'vor', first || 'Noch nichts eingetragen'));
      box.appendChild(b);
    });
  }

  function grow(t) {
    t.style.height = 'auto';
    var min = t.classList.contains('kurz') ? 84 : 168;
    t.style.height = Math.max(min, Math.ceil(t.scrollHeight / 28) * 28) + 'px';
  }
  function fillFields(r) {
    $('f-betrieb').value = r.betrieb || '';
    $('f-schule').value = r.schule || '';
    $('f-unterweisung').value = r.unterweisung || '';
    $('f-sb').value = r.stunden_betrieb == null ? '' : r.stunden_betrieb;
    $('f-ss').value = r.stunden_schule == null ? '' : r.stunden_schule;
    ['f-betrieb', 'f-schule', 'f-unterweisung'].forEach(function (id) { grow($(id)); });
  }
  function syncEditor(force) {
    var k = state.sel, r = k && state.reports[k];
    $('leer').hidden = !!r;
    $('bogen').hidden = !r;
    if (!r) return;
    var i = infoOf(k);
    $('m-kw').textContent = A.WT_LANG[i.wd] + ', ' + A.fmt(i.ms, true);
    $('m-bereich').textContent = 'KW ' + pad(i.w);
    $('m-aw').textContent = i.aw >= 1 ? 'Ausbildungswoche ' + i.aw + ' · ' + i.aj + '. Jahr' : '';
    if (force || !$('bogen').contains(document.activeElement)) fillFields(r);
    var lock = gesperrt(r);
    Array.prototype.forEach.call($('bogen').querySelectorAll('[data-f]'), function (x) { x.disabled = lock; });
    Array.prototype.forEach.call($('bogen').querySelectorAll('button[data-a]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-a') === r.art));
      b.disabled = lock;
    });
    Array.prototype.forEach.call($('bogen').querySelectorAll('button[data-s]'), function (b) {
      var s = b.getAttribute('data-s');
      b.setAttribute('aria-pressed', String(s === r.status));
      if (s !== 'unterschrieben') b.disabled = lock;
    });
    $('loeschen').disabled = lock;
    var sig = '';
    if (lock) {
      var d = r.unterschrieben_am ? A.fmt(Date.parse(r.unterschrieben_am), true) : '';
      sig = 'Unterschrieben von ' + (r.unterschrieben_name || 'Ausbilder') + (d ? ' am ' + d : '') + '. Der Bericht ist gesperrt.';
    }
    $('signatur').textContent = sig;
  }

  function setSel(k, keepScroll) {
    if (state.sel && state.sel !== k && timers[state.sel]) {
      clearTimeout(timers[state.sel]);
      delete timers[state.sel];
      persist(state.sel);
    }
    state.sel = k;
    try { localStorage.setItem('bh:sel:' + me.id, k); } catch (e) {}
    resetDelete();
    renderList();
    syncEditor(true);
    if (!keepScroll && window.matchMedia('(max-width:760px)').matches) $('editor').scrollIntoView({ block: 'start' });
  }

  function edit(f, v) {
    var k = state.sel;
    if (!k || !state.reports[k] || gesperrt(state.reports[k])) return;
    var r = Object.assign({}, state.reports[k]);
    r[f] = v;
    state.reports[k] = r;
    schedule(k);
  }

  function tagKopf(k) {
    var i = infoOf(k);
    return A.WT_LANG[i.wd] + ', ' + A.fmt(i.ms, true) + ' · KW ' + pad(i.w) + (i.aw >= 1 ? ' · Ausbildungswoche ' + i.aw : '');
  }
  function reportText(k) {
    var r = state.reports[k], out = [tagKopf(k)];
    if (r.art === 'frei') out.push('Tagesart: Frei');
    out.push('', 'Betriebliche Tätigkeiten (' + zahl(+r.stunden_betrieb || 0) + ' Std.)', r.betrieb || '–');
    if (r.art === 'schule' || r.schule || +r.stunden_schule) out.push('', 'Berufsschule (' + zahl(+r.stunden_schule || 0) + ' Std.)', r.schule || '–');
    if (r.unterweisung) out.push('', 'Unterweisungen und Schulungen', r.unterweisung);
    if (gesperrt(r)) out.push('', 'Unterschrieben von ' + (r.unterschrieben_name || 'Ausbilder') + (r.unterschrieben_am ? ' am ' + A.fmt(Date.parse(r.unterschrieben_am), true) : ''));
    return out.join('\n');
  }
  function pdfEintraege() {
    var keys = Object.keys(state.reports).sort(), wsum = {}, out = [], last = null;
    keys.forEach(function (k) { var i = infoOf(k); wsum[i.wk] = (wsum[i.wk] || 0) + A.stunden(state.reports[k]); });
    keys.forEach(function (k) {
      var i = infoOf(k), r = state.reports[k];
      if (i.wk !== last) {
        last = i.wk;
        out.push({ woche: 'KW ' + pad(i.w) + '/' + i.y + ' · ' + A.fmt(i.mon) + '-' + A.fmt(i.sun, true) + (i.aw >= 1 ? ' · Ausbildungswoche ' + i.aw : '') + ' · ' + zahl(wsum[i.wk]) + ' Std.' });
      }
      var bl = [];
      if (r.art !== 'schule' || r.betrieb || +r.stunden_betrieb) bl.push(['Betriebliche Tätigkeiten (' + zahl(+r.stunden_betrieb || 0) + ' Std.)', r.betrieb]);
      if (r.art === 'schule' || r.schule || +r.stunden_schule) bl.push(['Berufsschule (' + zahl(+r.stunden_schule || 0) + ' Std.)', r.schule]);
      if (r.unterweisung) bl.push(['Unterweisungen und Schulungen', r.unterweisung]);
      out.push({
        tag: A.WT_LANG[i.wd] + ', ' + A.fmt(i.ms, true),
        stand: A.ART[r.art] + ' · ' + A.STATUS[r.status],
        bloecke: bl,
        signatur: gesperrt(r) ? 'Unterschrieben von ' + (r.unterschrieben_name || 'Ausbilder') + (r.unterschrieben_am ? ' am ' + A.fmt(Date.parse(r.unterschrieben_am), true) : '') : ''
      });
    });
    return out;
  }

  function resetDelete() {
    clearTimeout(delTimer);
    var b = $('loeschen');
    b.textContent = 'Tag löschen';
    b.classList.remove('scharf');
  }

  async function laden() {
    var res = await sb.from('tagesberichte').select('*').eq('azubi_id', me.id).order('datum', { ascending: false });
    if (res.error) { A.note(A.fehlerText(res.error)); return false; }
    var next = {};
    res.data.forEach(function (r) { next[r.datum] = r; });
    Object.keys(state.reports).forEach(function (k) { if (guard(k) && state.reports[k]) next[k] = state.reports[k]; });
    state.reports = next;
    renderList();
    syncEditor(false);
    return true;
  }

  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  $('datum').value = today();

  $('bogen').addEventListener('submit', function (e) { e.preventDefault(); });
  $('bogen').addEventListener('input', function (e) {
    var f = e.target.getAttribute('data-f');
    if (!f || !state.sel) return;
    var v = e.target.value;
    if (f.indexOf('stunden') === 0) v = v === '' ? 0 : Math.max(0, Math.min(24, parseFloat(v) || 0));
    edit(f, v);
    if (e.target.tagName === 'TEXTAREA') grow(e.target);
  });
  Array.prototype.forEach.call(document.querySelectorAll('button[data-a]'), function (b) {
    b.addEventListener('click', function () { edit('art', b.getAttribute('data-a')); syncEditor(false); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('button[data-s]'), function (b) {
    b.addEventListener('click', function () {
      var s = b.getAttribute('data-s');
      if (s === 'unterschrieben') return;
      edit('status', s);
      syncEditor(false);
    });
  });
  $('liste').addEventListener('click', function (e) {
    var b = e.target.closest('.wk');
    if (b) setSel(b.getAttribute('data-k'));
  });
  $('anlegen').addEventListener('click', function () {
    var k = $('datum').value;
    if (isNaN(A.parseDate(k))) return A.note('Bitte ein Datum wählen.');
    if (!state.reports[k]) { state.reports[k] = newReport(); persist(k); }
    setSel(k);
  });
  $('kopieren').addEventListener('click', function () {
    if (!state.sel || !state.reports[state.sel]) return;
    A.copyText(reportText(state.sel)).then(function () { A.note('Text kopiert.'); }, function () { A.note('Kopieren nicht möglich.'); });
  });
  $('loeschen').addEventListener('click', async function () {
    var b = $('loeschen');
    if (!b.classList.contains('scharf')) {
      b.textContent = 'Wirklich löschen?';
      b.classList.add('scharf');
      delTimer = setTimeout(resetDelete, 4000);
      return;
    }
    var k = state.sel;
    clearTimeout(timers[k]);
    delete timers[k];
    resetDelete();
    var res = await sb.from('tagesberichte').delete().eq('azubi_id', me.id).eq('datum', k);
    if (res.error) return A.note(A.fehlerText(res.error));
    delete state.reports[k];
    state.sel = null;
    renderList();
    syncEditor(true);
    A.note('Tag gelöscht.');
  });
  exp.addEventListener('click', function () {
    if (!Object.keys(state.reports).length) return A.note('Noch keine Berichte zum Exportieren.');
    var kopf = [A.cfg.BERUF, A.cfg.BETRIEB].filter(Boolean).join(' · ');
    A.makePdf('Berichte.pdf', 'Berichte' + (me.name ? ' - ' + me.name : ''), kopf, pdfEintraege());
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
    else laden();
  });
  window.addEventListener('pagehide', flush);

  if (await laden()) {
    var saved = null;
    try { saved = localStorage.getItem('bh:sel:' + me.id); } catch (e) {}
    var keys = Object.keys(state.reports).sort();
    var t = today();
    var k = state.reports[t] ? t : (saved && state.reports[saved]) ? saved : keys[keys.length - 1];
    if (k) setSel(k, true);
  }
})();
