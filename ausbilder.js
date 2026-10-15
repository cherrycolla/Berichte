(async function () {
  'use strict';
  var A = window.App, sb = A.sb, $ = A.$, el = A.el, pad = A.pad, zahl = A.zahl;
  var ctx = await A.start(['ausbilder']);
  if (!ctx) return;
  A.renderHeader(ctx.profile);

  var state = { azubis: [], azubi: null, reports: {}, sel: null, nurOffen: false };
  var busy = false;

  function infoOf(k) { return A.info(k, state.azubi && state.azubi.beginn); }

  function renderList() {
    var box = $('liste');
    box.textContent = '';
    var keys = Object.keys(state.reports).sort().reverse();
    var offen = keys.filter(function (k) { return state.reports[k].status === 'fertig'; });
    $('anzahl').textContent = offen.length ? offen.length + ' offen' : '';
    if (state.nurOffen) keys = offen;
    if (!state.azubi) {
      box.appendChild(el('p', 'leer-liste', 'Dir ist noch kein Azubi zugeordnet. Der Administrator kann das einstellen.'));
      return;
    }
    if (!keys.length) {
      box.appendChild(el('p', 'leer-liste', state.nurOffen ? 'Nichts zu unterschreiben.' : 'Noch keine Berichte.'));
      return;
    }
    var wsum = {}, wfertig = {};
    Object.keys(state.reports).forEach(function (k) {
      var i = infoOf(k), r = state.reports[k];
      wsum[i.wk] = (wsum[i.wk] || 0) + A.stunden(r);
      if (r.status === 'fertig') (wfertig[i.wk] = wfertig[i.wk] || []).push(r.id);
    });
    var last = null;
    keys.forEach(function (k) {
      var i = infoOf(k), r = state.reports[k];
      if (i.wk !== last) {
        last = i.wk;
        var g = el('h3', 'grp');
        g.appendChild(el('span', null, 'KW ' + pad(i.w) + ' · ' + A.fmt(i.mon) + '–' + A.fmt(i.sun)));
        var rechts = el('span', 'grp-rechts');
        rechts.appendChild(el('span', null, zahl(wsum[i.wk]) + ' Std.'));
        if (wfertig[i.wk]) {
          var m = el('button', 'mini', 'Woche unterschreiben');
          m.type = 'button';
          m.setAttribute('data-woche', i.wk);
          rechts.appendChild(m);
        }
        g.appendChild(rechts);
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
      var s = el('span', 'pill', A.STATUS[r.status]);
      s.setAttribute('data-s', r.status);
      b.appendChild(s);
      var text = r.art === 'schule' && r.schule ? r.schule : r.betrieb;
      var first = (text || '').split('\n').filter(function (x) { return x.trim(); })[0];
      b.appendChild(el('span', 'vor', first || 'Noch nichts eingetragen'));
      box.appendChild(b);
    });
  }

  function renderEditor() {
    var k = state.sel, r = k && state.reports[k];
    $('leer').hidden = !!r;
    $('bogen').hidden = !r;
    if (!r) return;
    var i = infoOf(k);
    $('m-kw').textContent = A.WT_LANG[i.wd] + ', ' + A.fmt(i.ms, true);
    $('m-bereich').textContent = 'KW ' + pad(i.w);
    $('m-aw').textContent = i.aw >= 1 ? 'Ausbildungswoche ' + i.aw + ' · ' + i.aj + '. Jahr' : '';
    $('m-art').textContent = A.ART[r.art];
    $('h-betrieb').textContent = zahl(+r.stunden_betrieb || 0) + ' Std.';
    $('t-betrieb').textContent = r.betrieb || '–';
    var zeigeSchule = r.art === 'schule' || !!r.schule || !!+r.stunden_schule;
    $('b-schule').hidden = !zeigeSchule;
    $('h-schule').textContent = zahl(+r.stunden_schule || 0) + ' Std.';
    $('t-schule').textContent = r.schule || '–';
    $('b-unterweisung').hidden = !r.unterweisung;
    $('t-unterweisung').textContent = r.unterweisung || '';
    var p = $('p-status');
    p.textContent = A.STATUS[r.status];
    p.setAttribute('data-s', r.status);
    var sig = '';
    if (r.status === 'unterschrieben') {
      sig = 'Unterschrieben von ' + (r.unterschrieben_name || 'Ausbilder') + (r.unterschrieben_am ? ' am ' + A.fmt(Date.parse(r.unterschrieben_am), true) : '') + '.';
    } else if (r.status === 'entwurf') {
      sig = 'Der Azubi hat den Bericht noch nicht als fertig markiert.';
    }
    $('signatur').textContent = sig;
    $('unterschreiben').hidden = r.status !== 'fertig';
    $('zurueck').hidden = r.status !== 'unterschrieben';
  }

  async function ladeBerichte() {
    state.reports = {};
    if (!state.azubi) { renderList(); renderEditor(); return; }
    var res = await sb.from('tagesberichte').select('*').eq('azubi_id', state.azubi.id).order('datum', { ascending: false });
    if (res.error) { A.note(A.fehlerText(res.error)); return; }
    res.data.forEach(function (r) { state.reports[r.datum] = r; });
    if (state.sel && !state.reports[state.sel]) state.sel = null;
    renderList();
    renderEditor();
  }

  async function ladeAzubis() {
    var res = await sb.from('profiles').select('id,name,email,beginn').eq('role', 'azubi').order('name');
    if (res.error) { A.note(A.fehlerText(res.error)); return; }
    state.azubis = res.data;
    var sel = $('azubi');
    sel.textContent = '';
    state.azubis.forEach(function (a) {
      var o = el('option', null, a.name || a.email);
      o.value = a.id;
      sel.appendChild(o);
    });
    if (!state.azubis.length) {
      var leer = el('option', null, 'Kein Azubi zugeordnet');
      leer.value = '';
      sel.appendChild(leer);
    }
    var saved = null;
    try { saved = localStorage.getItem('bh:azubi'); } catch (e) {}
    var wahl = state.azubis.filter(function (a) { return a.id === saved; })[0] || state.azubis[0] || null;
    state.azubi = wahl;
    if (wahl) sel.value = wahl.id;
    await ladeBerichte();
  }

  async function status(ids, neu) {
    if (busy || !ids.length) return;
    busy = true;
    var res = await sb.from('tagesberichte').update({ status: neu }).in('id', ids).select();
    busy = false;
    if (res.error) return A.note(A.fehlerText(res.error));
    res.data.forEach(function (r) { state.reports[r.datum] = r; });
    renderList();
    renderEditor();
    A.note(neu === 'unterschrieben' ? (res.data.length > 1 ? res.data.length + ' Berichte unterschrieben.' : 'Unterschrieben.') : 'Unterschrift zurückgezogen.');
  }

  function reportText(k) {
    var r = state.reports[k], i = infoOf(k), out = [];
    out.push(A.WT_LANG[i.wd] + ', ' + A.fmt(i.ms, true) + ' · KW ' + pad(i.w) + (i.aw >= 1 ? ' · Ausbildungswoche ' + i.aw : ''));
    out.push('', 'Betriebliche Tätigkeiten (' + zahl(+r.stunden_betrieb || 0) + ' Std.)', r.betrieb || '–');
    if (r.art === 'schule' || r.schule || +r.stunden_schule) out.push('', 'Berufsschule (' + zahl(+r.stunden_schule || 0) + ' Std.)', r.schule || '–');
    if (r.unterweisung) out.push('', 'Unterweisungen und Schulungen', r.unterweisung);
    return out.join('\n');
  }

  $('azubi').addEventListener('change', function () {
    var id = $('azubi').value;
    state.azubi = state.azubis.filter(function (a) { return a.id === id; })[0] || null;
    state.sel = null;
    try { localStorage.setItem('bh:azubi', id); } catch (e) {}
    ladeBerichte();
  });
  $('filter').addEventListener('click', function () {
    state.nurOffen = !state.nurOffen;
    $('filter').setAttribute('aria-pressed', String(state.nurOffen));
    renderList();
  });
  $('liste').addEventListener('click', function (e) {
    var w = e.target.closest('[data-woche]');
    if (w) {
      var wk = w.getAttribute('data-woche');
      var ids = Object.keys(state.reports).filter(function (k) {
        return infoOf(k).wk === wk && state.reports[k].status === 'fertig';
      }).map(function (k) { return state.reports[k].id; });
      return status(ids, 'unterschrieben');
    }
    var b = e.target.closest('.wk');
    if (!b) return;
    state.sel = b.getAttribute('data-k');
    renderList();
    renderEditor();
    if (window.matchMedia('(max-width:760px)').matches) $('editor').scrollIntoView({ block: 'start' });
  });
  $('unterschreiben').addEventListener('click', function () {
    var r = state.reports[state.sel];
    if (r) status([r.id], 'unterschrieben');
  });
  $('zurueck').addEventListener('click', function () {
    var r = state.reports[state.sel];
    if (r) status([r.id], 'fertig');
  });
  $('kopieren').addEventListener('click', function () {
    if (!state.sel || !state.reports[state.sel]) return;
    A.copyText(reportText(state.sel)).then(function () { A.note('Text kopiert.'); }, function () { A.note('Kopieren nicht möglich.'); });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') ladeBerichte();
  });

  await ladeAzubis();
})();
