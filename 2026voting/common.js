/* Shared by the voting page and the results page. */
(function () {
  var PIN_KEY = 'tot2026_pin';

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function getItem(kind, key) {
    try { var s = store(kind); return s ? s.getItem(key) : null; } catch (e) { return null; }
  }
  function setItem(kind, key, value) {
    try {
      var s = store(kind);
      if (!s) return;
      if (value == null) s.removeItem(key); else s.setItem(key, value);
    } catch (e) { /* storage blocked: keep going without it */ }
  }

  // POST as text/plain so the browser sends it without a CORS preflight,
  // which Apps Script web apps do not answer.
  function api(action, data, timeoutMs) {
    var url = window.VOTING_API_URL;
    if (!url) return Promise.reject(new Error('Voting is not connected yet.'));
    var body = Object.assign({ action: action }, data || {});
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 30000) : null;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
      cache: 'no-store'
    }).then(function (res) {
      if (!res.ok) throw new Error('The server did not answer. Please try again.');
      return res.json();
    }).catch(function (err) {
      if (err && err.name === 'AbortError') throw new Error('That took too long. Check your signal and try again.');
      if (err && err.message && /fetch|network|load failed/i.test(err.message)) throw new Error('No connection. Check your signal and try again.');
      throw err;
    }).finally(function () { if (timer) clearTimeout(timer); });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, '');
      else node.setAttribute(k, v);
    });
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  var toastTimer;
  function toast(msg, isError) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, isError ? 4500 : 2600);
  }

  /*
    Admin PIN dialog. The server enforces a 2-second pause after a wrong
    PIN; this shows it as a countdown with a shrinking bar and grays out
    the field and button until it ends.
  */
  function pinDialog(opts) {
    var overlay = document.getElementById('pinSheet');
    var form = document.getElementById('pinForm');
    var input = document.getElementById('pinInput');
    var go = document.getElementById('pinGo');
    var wait = document.getElementById('pinWait');
    var msg = document.getElementById('pinMsg');
    var count = document.getElementById('pinCount');
    var bar = document.getElementById('pinBar');
    var err = document.getElementById('pinErr');
    var counting = false;
    var busy = false;

    function open() {
      overlay.hidden = false;
      document.body.classList.add('locked');
      err.textContent = '';
      if (!counting) { input.value = ''; setTimeout(function () { input.focus(); }, 50); }
    }
    function close() {
      overlay.hidden = true;
      document.body.classList.remove('locked');
    }
    function countdown(ms, text) {
      counting = true;
      input.disabled = true;
      go.disabled = true;
      msg.textContent = text;
      wait.hidden = false;
      bar.style.width = '100%';
      var end = Date.now() + ms;
      (function tick() {
        var left = end - Date.now();
        if (left <= 0) {
          counting = false;
          wait.hidden = true;
          input.disabled = false;
          go.disabled = false;
          input.value = '';
          input.focus();
          return;
        }
        count.textContent = String(Math.ceil(left / 1000));
        bar.style.width = (100 * left / ms).toFixed(1) + '%';
        setTimeout(tick, 40);
      })();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (counting || busy) return;
      var pin = input.value.trim();
      if (!pin) { input.focus(); return; }
      busy = true;
      go.disabled = true;
      err.textContent = '';
      opts.check(pin).then(function (r) {
        busy = false;
        go.disabled = false;
        if (r && r.ok) {
          setItem('sessionStorage', PIN_KEY, pin);
          close();
          opts.onSuccess(pin, r);
        } else if (r && r.pinError) {
          countdown(r.waitMs || 2000, r.wrong ? 'Wrong PIN' : 'Please wait');
        } else {
          err.textContent = (r && r.error) || 'Something went wrong. Try again.';
        }
      }).catch(function (e2) {
        busy = false;
        go.disabled = false;
        err.textContent = e2.message;
      });
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay || e.target.hasAttribute('data-close')) close();
    });
    return { open: open, close: close };
  }

  // Prizes, in place order. Shown on the voting page and with the winners.
  var PRIZES = {
    trunk: ['$75 Amazon gift card', '$50 Amazon gift card', '$25 Amazon gift card'],
    costume: ['Golden State Valkyries swag box and 2 Bay FC tickets', '2 Bay FC tickets']
  };

  window.TT = {
    prizes: PRIZES,
    api: api,
    el: el,
    toast: toast,
    pinDialog: pinDialog,
    getPin: function () { return getItem('sessionStorage', PIN_KEY); },
    clearPin: function () { setItem('sessionStorage', PIN_KEY, null); },
    getItem: getItem,
    setItem: setItem
  };
})();
