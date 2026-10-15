(async function () {
  'use strict';
  var A = window.App, sb = A.sb, $ = A.$;

  async function weiter(session) {
    var p = await A.profileOf(session);
    if (!p) {
      await sb.auth.signOut();
      $('fehler').textContent = 'Für dieses Konto gibt es kein Profil. Bitte den Administrator fragen.';
      return;
    }
    location.replace(A.HOME[p.role]);
  }

  if (/DEIN-/.test(A.cfg.SUPABASE_URL || '')) {
    $('fehler').textContent = 'config.js ist noch nicht ausgefüllt.';
    $('senden').disabled = true;
    return;
  }

  var s = await sb.auth.getSession();
  if (s.data && s.data.session) await weiter(s.data.session);

  $('login').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('senden');
    btn.disabled = true;
    $('fehler').textContent = '';
    var r = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('passwort').value });
    if (r.error) {
      $('fehler').textContent = A.fehlerText(r.error);
      btn.disabled = false;
      return;
    }
    await weiter(r.data.session);
    btn.disabled = false;
  });
})();
