(async function () {
  'use strict';
  var A = window.App, sb = A.sb, $ = A.$, el = A.el;
  var ctx = await A.start(['admin']);
  if (!ctx) return;
  var me = ctx.profile;
  A.renderHeader(me);

  var users = [];
  var delTimers = {};

  function ausbilderOptionen(sel, wert) {
    sel.textContent = '';
    var keiner = el('option', null, 'Nicht zugeordnet');
    keiner.value = '';
    sel.appendChild(keiner);
    users.filter(function (u) { return u.role === 'ausbilder'; }).forEach(function (u) {
      var o = el('option', null, u.name || u.email);
      o.value = u.id;
      sel.appendChild(o);
    });
    sel.value = wert || '';
  }

  function formSichtbar() {
    var azubi = $('n-rolle').value === 'azubi';
    $('n-ausbilder-box').hidden = !azubi;
    $('n-beginn-box').hidden = !azubi;
  }

  async function speichern(id, felder) {
    var res = await sb.from('profiles').update(felder).eq('id', id);
    if (res.error) { A.note(A.fehlerText(res.error)); return false; }
    var u = users.filter(function (x) { return x.id === id; })[0];
    if (u) Object.assign(u, felder);
    A.note('Gespeichert.');
    return true;
  }

  async function funktion(body) {
    var res = await sb.functions.invoke('admin-users', { body: body });
    if (res.error) throw new Error(await A.funktionsFehler(res.error));
    return res.data;
  }

  function karte(u) {
    var self = u.id === me.id;
    var k = el('div', 'nutzer');

    var kopf = el('div', 'nutzer-kopf');
    var name = el('input', 'line-in');
    name.value = u.name || '';
    name.placeholder = 'Name';
    name.setAttribute('aria-label', 'Name');
    name.addEventListener('change', function () { speichern(u.id, { name: name.value.trim() }); });
    kopf.appendChild(name);
    kopf.appendChild(el('span', 'email', u.email));
    k.appendChild(kopf);

    var felder = el('div', 'formraster');

    var rb = el('label', 'block');
    rb.appendChild(el('span', 'label', 'Rolle'));
    var rolle = el('select', 'line-in');
    Object.keys(A.ROLLEN).forEach(function (r) {
      var o = el('option', null, A.ROLLEN[r]);
      o.value = r;
      rolle.appendChild(o);
    });
    rolle.value = u.role;
    rolle.disabled = self;
    rolle.addEventListener('change', async function () {
      var ok = await speichern(u.id, { role: rolle.value, ausbilder_id: rolle.value === 'azubi' ? u.ausbilder_id : null });
      if (ok) render();
      else rolle.value = u.role;
    });
    rb.appendChild(rolle);
    felder.appendChild(rb);

    if (u.role === 'azubi') {
      var ab = el('label', 'block');
      ab.appendChild(el('span', 'label', 'Ausbilder'));
      var as = el('select', 'line-in');
      ausbilderOptionen(as, u.ausbilder_id);
      as.addEventListener('change', function () { speichern(u.id, { ausbilder_id: as.value || null }); });
      ab.appendChild(as);
      felder.appendChild(ab);

      var bb = el('label', 'block');
      bb.appendChild(el('span', 'label', 'Ausbildungsbeginn'));
      var bg = el('input', 'line-in');
      bg.type = 'date';
      bg.value = u.beginn || '';
      bg.addEventListener('change', function () { speichern(u.id, { beginn: bg.value || null }); });
      bb.appendChild(bg);
      felder.appendChild(bb);
    }
    k.appendChild(felder);

    var aktionen = el('div', 'aktionen');
    var links = el('div');
    var pw = el('button', 'btn', 'Neues Passwort');
    pw.type = 'button';
    var pwBox = el('div', 'pwbox');
    pwBox.hidden = true;
    var pwIn = el('input', 'line-in');
    pwIn.type = 'text';
    pwIn.placeholder = 'Mind. 8 Zeichen';
    pwIn.autocapitalize = 'none';
    pwIn.setAttribute('aria-label', 'Neues Passwort');
    var pwOk = el('button', 'btn prim', 'Setzen');
    pwOk.type = 'button';
    pwBox.appendChild(pwIn);
    pwBox.appendChild(pwOk);
    pw.addEventListener('click', function () { pwBox.hidden = !pwBox.hidden; if (!pwBox.hidden) pwIn.focus(); });
    pwOk.addEventListener('click', async function () {
      pwOk.disabled = true;
      try {
        await funktion({ action: 'password', id: u.id, password: pwIn.value });
        pwIn.value = '';
        pwBox.hidden = true;
        A.note('Passwort geändert.');
      } catch (e) { A.note(e.message); }
      pwOk.disabled = false;
    });
    links.appendChild(pw);
    aktionen.appendChild(links);

    var rechts = el('div');
    if (!self) {
      var del = el('button', 'btn gefahr', 'Löschen');
      del.type = 'button';
      del.addEventListener('click', async function () {
        if (!del.classList.contains('scharf')) {
          del.textContent = 'Wirklich löschen?';
          del.classList.add('scharf');
          clearTimeout(delTimers[u.id]);
          delTimers[u.id] = setTimeout(function () { del.textContent = 'Löschen'; del.classList.remove('scharf'); }, 4000);
          return;
        }
        del.disabled = true;
        try {
          await funktion({ action: 'delete', id: u.id });
          A.note('Zugang gelöscht.');
          await laden();
        } catch (e) { A.note(e.message); del.disabled = false; }
      });
      rechts.appendChild(del);
    }
    aktionen.appendChild(rechts);
    k.appendChild(aktionen);
    k.appendChild(pwBox);
    return k;
  }

  function render() {
    var box = $('nutzer');
    box.textContent = '';
    if (!users.length) { box.appendChild(el('p', 'leer-liste', 'Noch keine Benutzer.')); return; }
    var order = { admin: 0, ausbilder: 1, azubi: 2 };
    users.slice().sort(function (a, b) {
      return order[a.role] - order[b.role] || (a.name || a.email).localeCompare(b.name || b.email, 'de');
    }).forEach(function (u) { box.appendChild(karte(u)); });
    ausbilderOptionen($('n-ausbilder'), $('n-ausbilder').value);
  }

  async function laden() {
    var res = await sb.from('profiles').select('*');
    if (res.error) { A.note(A.fehlerText(res.error)); return; }
    users = res.data;
    render();
  }

  $('n-rolle').addEventListener('change', formSichtbar);
  $('neu').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('n-senden');
    btn.disabled = true;
    var rolle = $('n-rolle').value;
    try {
      await funktion({
        action: 'create',
        name: $('n-name').value.trim(),
        email: $('n-email').value.trim(),
        password: $('n-pass').value,
        role: rolle,
        ausbilder_id: rolle === 'azubi' ? $('n-ausbilder').value : '',
        beginn: rolle === 'azubi' ? $('n-beginn').value : ''
      });
      $('neu').reset();
      formSichtbar();
      A.note('Zugang angelegt.');
      await laden();
    } catch (err) { A.note(err.message); }
    btn.disabled = false;
  });

  formSichtbar();
  await laden();
})();
