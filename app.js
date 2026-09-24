/* ========== WORKER API ========== */
var WORKER_URL = 'https://nordic-deposit-checker.otis-790.workers.dev';
var def = { usd:0, btc:0, eth:0, btcP:68000, ethP:3200, eurR:0.92, sekR:10.45, currency:'USD', txs:[], order:null, card:null, notifications:[] };
var st = JSON.parse(JSON.stringify(def));
var mode = null, tt = null;
var autoCheckTimer = null;
var autoCheckKnown = {};
var cvvVisible = false;
var cvvTimer = null;

function $(i){ return document.getElementById(i); }
function fmt(n){ return '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function eurF(n){ return '≈ €' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function now(){ return new Date().toISOString().slice(0,10); }

function loadFromServer(cb){
  fetch(WORKER_URL + '?action=getState')
    .then(function(r){ return r.json(); })
    .then(function(data){
      st = data || JSON.parse(JSON.stringify(def));
      if (!st.txs) st.txs = [];
      if (!st.card || typeof st.card !== 'object') st.card = null;
      render();
      setTimeout(function(){ checkOnboarding(); }, 50);
      if (cb) cb();
    })
    .catch(function(e){
      console.error('Load failed:', e);
      render();
      checkOnboarding();
    });
}

function saveToServer(){
  fetch(WORKER_URL + '?action=setState', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(st)
  }).catch(function(e){ console.error('Save failed:', e); });
}
/* ========== LIVE PRICES ========== */
function loadPrices(){
  fetch(WORKER_URL + '?action=prices')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.btc && d.eth){
        st.btcP = d.btc;
        st.ethP = d.eth;
        var btcPriceEl = document.getElementById('btcPrice');
        if (btcPriceEl) btcPriceEl.textContent = fmt(d.btc);
        var ethPriceEl = document.getElementById('ethPrice');
        if (ethPriceEl) ethPriceEl.textContent = fmt(d.eth);
        render();
      }
    })
    .catch(function(e){ console.error('Prices load failed:', e); });
}

/* ========== CURRENCY SWITCHER ========== */
function fmtCurrency(usdAmount){
  var cur = st.currency || 'USD';
  var amount = usdAmount;
  var symbol = '$';
  if (cur === 'EUR'){
    amount = usdAmount * st.eurR;
    symbol = '€';
  } else if (cur === 'SEK'){
    amount = usdAmount * st.sekR;
    symbol = 'kr ';
  }
  var formatted = Number(amount).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
  return symbol + formatted;
}

function loadExchangeRates(){
  fetch('https://api.coinbase.com/v2/exchange-rates?currency=USD')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.data && d.data.rates){
        var r = d.data.rates;
        if (r.EUR) st.eurR = Number(r.EUR);
        if (r.SEK) st.sekR = Number(r.SEK);
        var rateEl = document.getElementById('rateEUR');
        if (rateEl) rateEl.textContent = '1$ = ' + st.eurR.toFixed(2) + '€';
        var rateEl2 = document.getElementById('rateSEK');
        if (rateEl2) rateEl2.textContent = '1$ = ' + st.sekR.toFixed(2) + 'kr';
        render();
      }
    })
    .catch(function(e){ console.error('Rates load failed:', e); });
}

function setCurrency(cur){
  st.currency = cur;
  saveToServer();
  var codeEl = document.getElementById('currCode');
  if (codeEl) codeEl.textContent = cur;
  var opts = document.querySelectorAll('.curr-opt');
  for (var i = 0; i < opts.length; i++){
    opts[i].classList.toggle('on', opts[i].getAttribute('data-cur') === cur);
  }
  var menu = document.getElementById('currMenu');
  if (menu) menu.classList.remove('on');
  render();
  toast('Currency: ' + cur);
}

function initCurrencySwitcher(){
  var btn = document.getElementById('currBtnTop');
  var menu = document.getElementById('currMenu');
  if (btn && menu){
    btn.onclick = function(e){
      e.stopPropagation();
      menu.classList.toggle('on');
    };
    document.addEventListener('click', function(){
      if (menu) menu.classList.remove('on');
    });
  }
  var opts = document.querySelectorAll('.curr-opt');
  for (var i = 0; i < opts.length; i++){
    opts[i].onclick = function(e){
      e.stopPropagation();
      var cur = this.getAttribute('data-cur');
      setCurrency(cur);
    };
  }
  var codeEl = document.getElementById('currCode');
  if (codeEl) codeEl.textContent = st.currency || 'USD';
}
/* ========== ENABLE SOUND BUTTON ========== */
function initSoundButton(){
  var btn = document.getElementById('soundBtn');
  if (!btn) return;

  if (localStorage.getItem('audioUnlocked') === '1'){
    btn.classList.add('hidden');
  }

  btn.onclick = function(){
    var ctx = getAudioCtx();
    if (ctx){
      ctx.resume().then(function(){
        localStorage.setItem('audioUnlocked', '1');
        btn.classList.add('hidden');
        // Тестовый звук
        setTimeout(function(){
          playTone(880, 0.15, 'sine', 0.4);
          setTimeout(function(){ playTone(1320, 0.2, 'sine', 0.35); }, 120);
        }, 100);
      });
    }
  };
}

/* ========== NOTIFICATIONS ========== */
function playNotificationSound(){
  playTone(880, 0.12, 'sine', 0.35);
  setTimeout(function(){
    playTone(1320, 0.18, 'sine', 0.28);
  }, 100);
}
function addNotification(text, icon){
  if (!st.notifications) st.notifications = [];
  st.notifications.unshift({
    id: Date.now() + Math.random(),
    text: text,
    icon: icon || '🔔',
    ts: Date.now(),
    read: false
  });
  if (st.notifications.length > 50) st.notifications.length = 50;
  saveToServer();
  renderNotifications();
  var bell = document.getElementById('notifBell');
  if (bell){
    bell.classList.add('has-unread');
    setTimeout(function(){ bell.classList.remove('has-unread'); }, 700);
  }
  playNotificationSound();
}

function timeAgo(ts){
  var s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 604800) return Math.floor(s / 86400) + ' d ago';
  return new Date(ts).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}

function renderNotifications(){
  var listEl = document.getElementById('notifList');
  var badge = document.getElementById('notifBadge');
  var sub = document.getElementById('notifSub');
  if (!listEl) return;

  var notifs = st.notifications || [];
  var unread = 0;
  for (var i = 0; i < notifs.length; i++) if (!notifs[i].read) unread++;

  if (badge){
    if (unread > 0){
      badge.style.display = 'flex';
      badge.textContent = unread > 9 ? '9+' : unread;
    } else {
      badge.style.display = 'none';
    }
  }
  if (sub) sub.textContent = unread > 0 ? (unread + ' unread') : 'All read';

  if (notifs.length === 0){
    listEl.innerHTML = '<div class="notif-empty"><div style="font-size:2.5rem;opacity:.4;margin-bottom:8px">🔔</div><div>No notifications yet</div></div>';
    return;
  }

  var html = '';
  for (var j = 0; j < notifs.length; j++){
    var n = notifs[j];
    html += '<div class="notif-item' + (n.read ? '' : ' unread') + '" data-id="' + n.id + '">' +
      '<div class="notif-icon">' + (n.icon || '🔔') + '</div>' +
      '<div class="notif-body">' +
        '<div class="notif-text">' + n.text + '</div>' +
        '<div class="notif-time">' + timeAgo(n.ts) + '</div>' +
      '</div>' +
    '</div>';
  }
  listEl.innerHTML = html;

  var items = listEl.querySelectorAll('.notif-item');
  for (var k = 0; k < items.length; k++){
    items[k].onclick = function(){
      var id = Number(this.getAttribute('data-id'));
      markRead(id);
    };
  }
}

function markRead(id){
  if (!st.notifications) return;
  for (var i = 0; i < st.notifications.length; i++){
    if (st.notifications[i].id === id){
      st.notifications[i].read = true;
      break;
    }
  }
  saveToServer();
  renderNotifications();
}

function markAllRead(){
  if (!st.notifications) return;
  for (var i = 0; i < st.notifications.length; i++) st.notifications[i].read = true;
  saveToServer();
  renderNotifications();
}

function initNotifications(){
  var bell = document.getElementById('notifBell');
  var panel = document.getElementById('notifPanel');
  var overlay = document.getElementById('notifOverlay');
  var closeBtn = document.getElementById('notifClose');

  if (bell) bell.onclick = function(){
    if (panel) panel.classList.add('on');
    if (overlay) overlay.classList.add('on');
    setTimeout(markAllRead, 1500);
  };

  function closePanel(){
    if (panel) panel.classList.remove('on');
    if (overlay) overlay.classList.remove('on');
  }

  if (overlay) overlay.onclick = closePanel;
  if (closeBtn) closeBtn.onclick = closePanel;
}
/* ========== PRICE CHARTS + RECENT TX ========== */
function loadCharts(){
  // CoinGecko — история цен за 7 дней
  fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.prices && d.prices.length){
        var prices = d.prices.map(function(p){ return p[1]; });
        drawChart('btcChart', prices, '#f7931a');
        var change = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
        updateChange('btcChange', change);
      }
    })
    .catch(function(e){ console.error('BTC chart:', e); });

  fetch('https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=7')
    .then(function(r){ return r.json(); })
    .then(function(d){
      if (d && d.prices && d.prices.length){
        var prices = d.prices.map(function(p){ return p[1]; });
        drawChart('ethChart', prices, '#627eea');
        var change = ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
        updateChange('ethChange', change);
      }
    })
    .catch(function(e){ console.error('ETH chart:', e); });
}

function drawChart(elId, prices, color){
  var el = document.getElementById(elId);
  if (!el || !prices || prices.length < 2) return;

  var w = 200;
  var h = 42;
  var pad = 4;

  var min = Math.min.apply(null, prices);
  var max = Math.max.apply(null, prices);
  var range = max - min || 1;

  var points = [];
  for (var i = 0; i < prices.length; i++){
    var x = pad + (i / (prices.length - 1)) * (w - pad * 2);
    var y = pad + (1 - (prices[i] - min) / range) * (h - pad * 2);
    points.push(x.toFixed(1) + ',' + y.toFixed(1));
  }

  var linePath = 'M' + points.join(' L');
  var fillPath = linePath + ' L' + (w - pad) + ',' + (h - pad) + ' L' + pad + ',' + (h - pad) + ' Z';

  var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
    '<defs>' +
      '<linearGradient id="grad_' + elId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.35"/>' +
        '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<path d="' + fillPath + '" fill="url(#grad_' + elId + ')"/>' +
    '<path d="' + linePath + '" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

  el.innerHTML = svg;
}

function updateChange(elId, change){
  var el = document.getElementById(elId);
  if (!el) return;
  var sign = change >= 0 ? '▲ +' : '▼ ';
  el.textContent = sign + change.toFixed(2) + '%';
  el.classList.remove('up', 'down');
  el.classList.add(change >= 0 ? 'up' : 'down');
}

function renderRecentTx(){
  var listEl = document.getElementById('recentTxList');
  if (!listEl) return;

  var txs = (st.txs || []).slice(0, 5);
  if (txs.length === 0){
    listEl.innerHTML = '<div class="recent-tx-empty"><div style="font-size:2rem;opacity:.4;margin-bottom:8px">📭</div><div>No transactions yet</div></div>';
    return;
  }

  var html = '';
  for (var i = 0; i < txs.length; i++){
    var t = txs[i];
    var icon = '💳';
    var iconClass = 'card';
    if (t.desc && t.desc.toLowerCase().indexOf('deposit') !== -1){
      icon = '💰'; iconClass = 'deposit';
    } else if (t.desc && t.desc.toLowerCase().indexOf('transfer') !== -1){
      icon = '💸'; iconClass = 'transfer';
    } else if (t.desc && t.desc.toLowerCase().indexOf('card') !== -1){
      icon = '💳'; iconClass = 'card';
    }

    var amtClass = 'neutral';
    var amtText = '—';
    if (t.amt > 0){ amtClass = 'plus'; amtText = '+' + fmtCurrency(t.amt); }
    else if (t.amt < 0){ amtClass = 'minus'; amtText = fmtCurrency(t.amt); }

    var badge = '';
    if (t.status === 'Completed') badge = '<div class="recent-tx-badge ok">✓ Completed</div>';
    else if (t.status === 'Processing') badge = '<div class="recent-tx-badge proc">⏳ Processing</div>';
    else if (t.status === 'Under Review') badge = '<div class="recent-tx-badge pend">⏱ Under review</div>';

    var timeStr = t.ts ? timeAgo(t.ts) : (t.date || '');

    html += '<div class="recent-tx-item">' +
      '<div class="recent-tx-icon ' + iconClass + '">' + icon + '</div>' +
      '<div class="recent-tx-info">' +
        '<div class="recent-tx-desc">' + (t.desc || 'Transaction') + '</div>' +
        '<div class="recent-tx-time">' + timeStr + '</div>' +
        badge +
      '</div>' +
      '<div class="recent-tx-amount ' + amtClass + '">' + amtText + '</div>' +
    '</div>';
  }
  listEl.innerHTML = html;
}

function initRecentTx(){
  var viewAll = document.getElementById('viewAllTx');
  if (viewAll) viewAll.onclick = function(e){
    e.preventDefault();
    // Переход на страницу Transactions
    var pgs = document.querySelectorAll('.pg');
    for (var i = 0; i < pgs.length; i++) pgs[i].classList.remove('on');
    var txPg = document.getElementById('tx');
    if (txPg) txPg.classList.add('on');
    var ms = document.querySelectorAll('.mi');
    for (var j = 0; j < ms.length; j++) ms[j].classList.remove('on');
    var txMi = document.querySelector('.mi[data-p="tx"]');
    if (txMi) txMi.classList.add('on');
    var ttl = document.getElementById('ttl');
    if (ttl) ttl.textContent = 'Transactions';
  };
}
/* ========== CARD DESIGN ========== */
function applyCardDesign(){
  var design = (st.card && st.card.design) ? st.card.design : 'cosmic';
  var cards = document.querySelectorAll('.pay');
  for (var i = 0; i < cards.length; i++){
    var c = cards[i];
    c.classList.remove('design-cosmic', 'design-purple', 'design-silver', 'design-black', 'design-gold');
    c.classList.add('design-' + design);
  }
}

function setSelectedDesign(design){
  selectedDesign = design;
  var opts = document.querySelectorAll('.design-opt');
  for (var i = 0; i < opts.length; i++){
    opts[i].classList.toggle('on', opts[i].getAttribute('data-design') === design);
  }
}

function initDesignPicker(){
  var picker = document.getElementById('designPicker');
  if (picker){
    var opts = picker.querySelectorAll('.design-opt');
    for (var i = 0; i < opts.length; i++){
      opts[i].onclick = function(){
        var d = this.getAttribute('data-design');
        setSelectedDesign(d);
        updateOnbPreview();
      };
    }
  }

  var modalPicker = document.getElementById('designPickerModal');
  if (modalPicker){
    var mopts = modalPicker.querySelectorAll('.design-opt');
    for (var j = 0; j < mopts.length; j++){
      mopts[j].onclick = function(){
        var all = modalPicker.querySelectorAll('.design-opt');
        for (var k = 0; k < all.length; k++) all[k].classList.remove('on');
        this.classList.add('on');
      };
    }
  }

  var btnChange = document.getElementById('btnChangeDesign');
  if (btnChange){
    btnChange.onclick = function(){
      if (!st.card) return;
      var current = st.card.design || 'cosmic';
      var all = document.querySelectorAll('#designPickerModal .design-opt');
      for (var k = 0; k < all.length; k++){
        all[k].classList.toggle('on', all[k].getAttribute('data-design') === current);
      }
      document.getElementById('designMask').classList.add('on');
    };
  }

  var btnSave = document.getElementById('designSave');
  if (btnSave){
    btnSave.onclick = function(){
      var active = document.querySelector('#designPickerModal .design-opt.on');
      if (!active){ toast('Please choose a design', true); return; }
      var d = active.getAttribute('data-design');
      if (!st.card) st.card = {};
      st.card.design = d;
      saveToServer();
      applyCardDesign();
      renderCard();
      document.getElementById('designMask').classList.remove('on');
      toast('Card design updated');
      playTone(880, 0.1, 'sine', 0.3);
    };
  }

  var btnCancel = document.getElementById('designCancel');
  if (btnCancel){
    btnCancel.onclick = function(){
      document.getElementById('designMask').classList.remove('on');
    };
  }
}

/* ========== IBAN GENERATION ========== */
var IBAN_DELAY_MS = 5 * 60 * 1000;

function genIban(){
  var s = 'SE';
  for (var i = 0; i < 22; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function startIbanGeneration(){
  if (st.user && st.user.iban){
    renderIban();
    return;
  }

  if (!st.user) st.user = {};
  if (!st.user.ibanStartedAt){
    st.user.ibanStartedAt = Date.now();
    saveToServer();
  }

  var elapsed = Date.now() - st.user.ibanStartedAt;
  var remaining = IBAN_DELAY_MS - elapsed;

  if (remaining <= 0){
    generateIbanNow();
    return;
  }

  renderIban();
  setTimeout(generateIbanNow, remaining);
}

function generateIbanNow(){
  if (!st.user) st.user = {};
  st.user.iban = genIban();
  st.user.swift = 'ESSESESSXXX';
  st.user.bank = 'NordicCrypto Bank AB';
  st.user.ibanCreatedAt = Date.now();
  saveToServer();
  renderIban();
  addNotification('Your IBAN has been created', '🏦');
  toast('Your IBAN is ready!');
}

function renderIban(){
  var pending = document.getElementById('ibanPending');
  var ready = document.getElementById('ibanReady');
  if (!pending || !ready) return;

  if (st.user && st.user.iban){
    pending.style.display = 'none';
    ready.style.display = 'block';
    var ibanEl = document.getElementById('myIban');
    if (ibanEl){
      ibanEl.textContent = st.user.iban.replace(/(.{4})/g, '$1 ').trim();
    }
  } else {
    pending.style.display = 'block';
    ready.style.display = 'none';
  }
}

/* ========== VERIFICATION ========== */
var verifyData = {
  docType: 'Passport',
  docFile: null,
  selfieFile: null,
  address: null,
  startedAt: null
};

function showVerifyScreen(){
  var screen = document.getElementById('verifyScreen');
  if (screen) screen.classList.add('on');
  showVerifyStep(1);
}

function hideVerifyScreen(){
  var screen = document.getElementById('verifyScreen');
  if (screen) screen.classList.remove('on');
}

function showVerifyStep(n){
  var steps = document.querySelectorAll('.verify-step');
  for (var i = 0; i < steps.length; i++) steps[i].classList.remove('on');
  var target = document.getElementById('verifyStep' + n);
  if (target) target.classList.add('on');
}

function fileSizeStr(bytes){
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function initVerification(){
  // Типы документов
  var typeBtns = document.querySelectorAll('.vtype-btn');
  for (var i = 0; i < typeBtns.length; i++){
    typeBtns[i].onclick = function(){
      for (var j = 0; j < typeBtns.length; j++) typeBtns[j].classList.remove('on');
      this.classList.add('on');
      verifyData.docType = this.getAttribute('data-type');
    };
  }

  // Загрузка документа
  var docInput = document.getElementById('docFile');
  if (docInput) docInput.onchange = function(){
    var f = this.files[0];
    if (!f) return;
    verifyData.docFile = f.name;
    document.getElementById('docUpload').style.display = 'none';
    document.getElementById('docUploaded').style.display = 'flex';
    document.getElementById('docFileName').textContent = f.name;
    document.getElementById('docFileSize').textContent = fileSizeStr(f.size);
    document.getElementById('verifyNext1').disabled = false;
  };

  // Загрузка селфи
  var selfieInput = document.getElementById('selfieFile');
  if (selfieInput) selfieInput.onchange = function(){
    var f = this.files[0];
    if (!f) return;
    verifyData.selfieFile = f.name;
    document.getElementById('selfieUpload').style.display = 'none';
    document.getElementById('selfieUploaded').style.display = 'flex';
    document.getElementById('selfieFileName').textContent = f.name;
    document.getElementById('selfieFileSize').textContent = fileSizeStr(f.size);
    document.getElementById('verifyNext2').disabled = false;
  };

  // Кнопка Continue (шаг 1)
  var btn1 = document.getElementById('verifyNext1');
  if (btn1) btn1.onclick = function(){
    playTone(660, 0.08, 'sine', 0.25);
    showVerifyStep(2);
  };

  // Back (шаг 2)
  var back2 = document.getElementById('verifyBack2');
  if (back2) back2.onclick = function(){ showVerifyStep(1); };

  // Continue (шаг 2)
  var btn2 = document.getElementById('verifyNext2');
  if (btn2) btn2.onclick = function(){
    playTone(660, 0.08, 'sine', 0.25);
    showVerifyStep(3);
  };

  // Back (шаг 3)
  var back3 = document.getElementById('verifyBack3');
  if (back3) back3.onclick = function(){ showVerifyStep(2); };

  // Submit (шаг 3) — старт проверки
  var btn3 = document.getElementById('verifyNext3');
  if (btn3) btn3.onclick = function(){
    var street = document.getElementById('vStreet').value.trim();
    var city = document.getElementById('vCity').value.trim();
    var zip = document.getElementById('vZip').value.trim();
    var country = document.getElementById('vCountry').value;

    if (!street || !city || !zip){
      toast('Please fill in all address fields', true);
      return;
    }

    verifyData.address = { street: street, city: city, zip: zip, country: country };
    startVerification();
  };

  // Finish (шаг 5)
  var finish = document.getElementById('verifyFinish');
  if (finish) finish.onclick = function(){
    hideVerifyScreen();
    // После верификации показать Dashboard
    render();
  };
}

function startVerification(){
  showVerifyStep(4);

  // Уведомление о старте
  addNotification('Identity verification started', '🔍');

  var totalSeconds = 10;
  verifyData.startedAt = Date.now();

  var timerEl = document.getElementById('verifyTimer');
  var progressEl = document.getElementById('verifyProgressBar');
  var vstep1 = document.getElementById('vstep1');
  var vstep2 = document.getElementById('vstep2');
  var vstep3 = document.getElementById('vstep3');
  var vstep4 = document.getElementById('vstep4');

  function tick(){
    var elapsed = Math.floor((Date.now() - verifyData.startedAt) / 1000);
    var remaining = Math.max(0, totalSeconds - elapsed);
    var mins = Math.floor(remaining / 60);
    var secs = remaining % 60;
    if (timerEl) timerEl.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

    var pct = Math.min(100, (elapsed / totalSeconds) * 100);
    if (progressEl) progressEl.style.width = pct + '%';

    // Обновляем шаги
    if (elapsed >= 5 && vstep2){
      vstep2.classList.add('active');
    }
    if (elapsed >= 30 && vstep2){
      vstep2.classList.remove('active');
      vstep2.classList.add('done');
      if (vstep3) vstep3.classList.add('active');
    }
    if (elapsed >= 60 && vstep3){
      vstep3.classList.remove('active');
      vstep3.classList.add('done');
      if (vstep4) vstep4.classList.add('active');
    }
    if (elapsed >= 90 && vstep4){
      vstep4.classList.remove('active');
      vstep4.classList.add('done');
    }

    if (remaining <= 0){
      // Проверка завершена
      if (st.user) st.user.verified = true;
      if (!st.user) st.user = { verified: true };
      saveToServer();

      // Уведомление
      addNotification('Identity verified successfully', '✅');

      // Показываем успех
      var nameEl = document.getElementById('verifySuccessName');
      if (nameEl){
        var fn = (st.card && st.card.name) ? st.card.name.split(' ')[0] : 'there';
        nameEl.textContent = 'Congratulations, ' + fn + '!';
      }
      showVerifyStep(5);

      // Звук успеха
      playChime();

      // Конфетти
      spawnConfetti();
      return;
    }

    setTimeout(tick, 1000);
  }

  tick();
}

function checkVerificationNeeded(){
  // Если карта есть, а верификации нет — показать
  if (st.card && (!st.user || !st.user.verified)){
    showVerifyScreen();
    return true;
  }
  return false;
}
/* ========== NAV ========== */
var titles = {dash:'Dashboard',cards:'My Cards',assets:'Crypto Assets',tx:'Transactions',order:'Order New Card'};
var mis = document.querySelectorAll('.mi');
for (var i=0; i<mis.length; i++){
  mis[i].onclick = function(){
    var p = this.getAttribute('data-p');
    var pgs = document.querySelectorAll('.pg');
    for (var j=0; j<pgs.length; j++) pgs[j].classList.remove('on');
    $(p).classList.add('on');
    var ms = document.querySelectorAll('.mi');
    for (var k=0; k<ms.length; k++) ms[k].classList.remove('on');
    this.classList.add('on');
    $('ttl').textContent = titles[p];
  };
}

/* ========== RENDER ========== */
function render(){
  $('bal').textContent = fmtCurrency(st.usd);
  $('balEur').textContent = eurF(st.usd * st.eurR);
  $('btcB').textContent = st.btc.toFixed(8);
  $('ethB').textContent = st.eth.toFixed(8);
  $('aBtc').textContent = st.btc.toFixed(8);
  $('aEth').textContent = st.eth.toFixed(8);
  $('aBtcU').textContent = '≈ ' + fmt(st.btc * st.btcP);
  $('aEthU').textContent = '≈ ' + fmt(st.eth * st.ethP);
  renderTx();
  renderOrder();
  renderCard();
  renderNotifications();
  renderRecentTx();
}
}

function badgeClass(s){
  if (s === 'Completed') return 'badge ok';
  if (s === 'Under Review') return 'badge pend';
  if (s === 'Processing') return 'badge proc';
  if (s === 'Failed') return 'badge fail';
  return 'badge';
}

function renderTx(){
  var b = $('txB');
  if (!st.txs || st.txs.length === 0){
    b.innerHTML = '<tr><td colspan="4"><div class="empty"><svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg><div>No transactions yet</div></div></td></tr>';
    return;
  }
  var h = '';
  for (var i=0; i<st.txs.length; i++){
    var t = st.txs[i];
    var c = t.amt >= 0 ? 'var(--ok)' : 'var(--bad)';
    var s = t.amt >= 0 ? '+' : '';
    h += '<tr><td>' + t.date + '</td><td>' + t.desc + '</td><td style="color:' + c + ';font-weight:600">' + s + fmt(t.amt) + '</td><td><span class="' + badgeClass(t.status) + '">' + t.status + '</span></td></tr>';
  }
  b.innerHTML = h;
}

function addTx(desc, amt, status){
  st.txs.unshift({ date: now(), ts: Date.now(), desc: desc, amt: amt, status: status || 'Completed' });
  renderTx();
  saveToServer();
}

/* ========== TOAST ========== */
function toast(msg, warn){
  var t = $('toast');
  var svg = t.querySelector('svg');
  $('tMsg').textContent = msg;
  if (warn){
    t.style.borderLeftColor = 'var(--warn)';
    svg.style.stroke = 'var(--warn)';
    svg.innerHTML = '<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>';
  } else {
    t.style.borderLeftColor = 'var(--ok)';
    svg.style.stroke = 'var(--ok)';
    svg.innerHTML = '<path d="M20 6L9 17l-5-5"/>';
  }
  t.classList.add('on');
  clearTimeout(tt);
  tt = setTimeout(function(){ t.classList.remove('on'); }, 3200);
}

/* ========== CARD HELPERS ========== */
function genCardNumber(prefix){
  var s = prefix;
  for (var i = 0; i < 12; i++) s += Math.floor(Math.random()*10);
  return s;
}

function fmtCard(num){
  var s = String(num);
  return s.replace(/(.{4})/g, '$1 ').trim();
}

function genCvv(){
  var s = '';
  for (var i = 0; i < 3; i++) s += Math.floor(Math.random()*10);
  return s;
}

function genExpiry(){
  var d = new Date();
  var y = d.getFullYear() + 3;
  var m = d.getMonth() + 1;
  var mm = m < 10 ? '0' + m : '' + m;
  return mm + '/' + String(y).slice(2);
}

function createVirtualCard(name, type, cur){
  var prefix = type === 'Mastercard' ? '5399' : '4921';
  var num = genCardNumber(prefix);
  var expiry = genExpiry();
  var cvv = genCvv();
  st.card = {
    num: num,
    cvv: cvv,
    expiry: expiry,
    name: name.toUpperCase(),
    type: type,
    cur: cur,
    status: 'Active',
    design: selectedDesign,
    createdAt: Date.now()
  };
  saveToServer();
}

function checkOnboarding(){
  if (!st.card){
    $('onboard').classList.add('on');
    return true;
  } else {
    $('onboard').classList.remove('on');
    return false;
  }
}

function renderCard(){
  if (!st.card){
    $('cardDash').classList.add('frozen');
    $('cardNumDash').textContent = '— — — —   — — — —   — — — —   — — — —';
    $('cardNameDash').textContent = '—';
    $('cardExpDash').textContent = '—/—';
    $('cardTypeDash').textContent = 'NO CARD';
    $('cardNumFull').textContent = '— — — —   — — — —   — — — —   — — — —';
    $('cardNameFull').textContent = '—';
    $('cardExpFull').textContent = '—/—';
    $('cardTypeFull').textContent = 'NO CARD';
    $('detNum').textContent = '—';
    $('detCvv').textContent = '●●●';
    $('detExp').textContent = '—';
    $('detName').textContent = '—';
    $('detType').textContent = '—';
    $('detCur').textContent = '—';
    $('detStatus').textContent = 'No Card';
    return;
  }

  var c = st.card;
  var frozen = (c.status === 'Frozen');
  var numFormatted = fmtCard(c.num);

  // Dash
  $('cardDash').classList.toggle('frozen', frozen);
  $('cardNumDash').textContent = numFormatted;
  $('cardNameDash').textContent = c.name;
  $('cardExpDash').textContent = c.expiry;
  $('cardTypeDash').textContent = (c.type + ' ' + c.cur).toUpperCase();

  // Full
  $('cardFull').classList.toggle('frozen', frozen);
  $('cardNumFull').textContent = numFormatted;
  $('cardNameFull').textContent = c.name;
  $('cardExpFull').textContent = c.expiry;
  $('cardTypeFull').textContent = (c.type + ' ' + c.cur).toUpperCase();

  // Details
  $('detNum').textContent = numFormatted;
  $('detCvv').textContent = cvvVisible ? c.cvv : '●●●';
  $('detExp').textContent = c.expiry;
  $('detName').textContent = c.name;
  $('detType').textContent = c.type;
  $('detCur').textContent = c.cur;
  $('detStatus').textContent = c.status;
  $('detStatus').style.color = frozen ? 'var(--warn)' : 'var(--ok)';

  // Buttons state
  $('btnShowCvv').textContent = cvvVisible ? '🙈 Hide CVV' : '👁 Show CVV';
  $('btnFreeze').textContent = frozen ? '🔥 Unfreeze Card' : '❄ Freeze Card';
  applyCardDesign();
}

/* ========== MODAL ========== */
function destHint(method){
  if (method === 'Bank Transfer (SEPA)') return { show:true, label:'Recipient IBAN', ph:'SE35 5000 0000 0549 1000 0003' };
  if (method === 'Credit Card')          return { show:true, label:'Recipient Card Number', ph:'4921 8842 1093 5542' };
  if (method === 'Bitcoin (BTC)')        return { show:true, label:'Recipient BTC Address', ph:'bc1q...' };
  if (method === 'Ethereum (ETH)')       return { show:true, label:'Recipient ETH Address', ph:'0x...' };
  return { show:false };
}

function refreshDest(){
  var m = $('mMethod').value;
  var hint = destHint(m);
  var isAdd = (mode === 'add');

  if (hint.show){
    $('mDestWrap').style.display = 'block';
    $('mDest').value = '';
    $('mDest').readOnly = false;

    if (isAdd && m === 'Bitcoin (BTC)'){
      $('mDestLabel').textContent = 'Send BTC to this address';
      $('mDest').value = '19YWxuHf1TbdZzZdV9FSzYfops6M2GLhe7';
      $('mDest').readOnly = true;
    } else if (isAdd && m === 'Ethereum (ETH)'){
      $('mDestLabel').textContent = 'Send ETH to this address';
      $('mDest').value = '0xFB7A7956Af77061D3B5f3B357ef9c0a22CD60e97';
      $('mDest').readOnly = true;
    } else if (isAdd){
      $('mDestLabel').textContent = 'Your reference (optional)';
      $('mDest').placeholder = 'Enter reference';
    } else {
      $('mDestLabel').textContent = hint.label;
      $('mDest').placeholder = hint.ph;
    }
  } else {
    $('mDestWrap').style.display = 'none';
    $('mDest').value = '';
  }
}

function openModal(m){
  mode = m;
  $('mTitle').textContent = m === 'add' ? 'Add Funds' : 'Transfer Funds';
  $('mDesc').textContent = m === 'add'
    ? 'Send crypto to the address below. We will detect your deposit automatically.'
    : 'Enter amount and recipient details.';
  $('mAmount').value = '';
  $('mDest').value = '';

  if (m === 'transfer'){ $('mMethod').value = 'Bank Transfer (SEPA)'; }
  else { $('mMethod').value = 'Bitcoin (BTC)'; }
  refreshDest();
  $('mask').classList.add('on');
  setTimeout(function(){ $('mAmount').focus(); }, 100);

  if (m === 'add'){ startAutoCheck(); }
}

function closeModal(){
  $('mask').classList.remove('on');
  mode = null;
  stopAutoCheck();
}

/* ========== CONFIRM (Add / Transfer) ========== */
function isCrypto(m){ return m === 'Bitcoin (BTC)' || m === 'Ethereum (ETH)'; }

function confirmModal(){
  var a = Number($('mAmount').value);
  var m = $('mMethod').value;
  var dest = $('mDest').value.trim();

  if (!a || a <= 0){ toast('Please enter a valid amount', true); return; }

  if (mode === 'add'){
    if (isCrypto(m)){
      toast('Send crypto to the address. We are watching the blockchain...', false);
      doAutoCheck();
      return;
    }
    st.usd += a;
    addTx('Deposit via ' + m, a, 'Under Review');
    addNotification('Deposit submitted via ' + m + ': ' + fmtCurrency(a), '💰');
    toast('Added ' + fmt(a));
    closeModal();
    render();
    saveToServer();
    return;
  }

  if (a > st.usd){ toast('Insufficient balance', true); return; }
  if (!dest){ toast('Please enter recipient details', true); return; }

  st.usd -= a;
  var desc;
  if (isCrypto(m)){
    desc = 'Crypto transfer to ' + dest.slice(0, 12) + '… via ' + m;
    addTx(desc, -a, 'Processing');
    addNotification('Crypto transfer sent: ' + fmtCurrency(a) + ' via ' + m, '💸');
    toast('Crypto sent — arrives in 10-30 min');
  } else {
    desc = (m === 'Credit Card' ? 'Card transfer to ' : 'Bank transfer to IBAN ') + dest.slice(0, 18) + '…';
    addTx(desc, -a, 'Under Review');
    addNotification('Transfer sent: ' + fmtCurrency(a) + ' via ' + m, '💸');
    toast('Transfer submitted — under review');
  }
  closeModal();
  render();
  saveToServer();
}

/* ========== COPY ========== */
function copyText(txt, okMsg){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast(okMsg); }).catch(function(){ toast(okMsg); });
  } else { toast(okMsg); }
}

/* ========== ORDER + TRACKING ========== */
var STEPS = [
  { name:'Order Received',   loc:'NordicCrypto HQ, Stockholm, Sweden' },
  { name:'Card Minted',      loc:'Production Facility, Stockholm' },
  { name:'Packed',           loc:'Logistics Center, Stockholm' },
  { name:'In Transit',       loc:'International Hub, Copenhagen' },
  { name:'Out for Delivery', loc:'Local Courier' },
  { name:'Delivered',        loc:'Destination' }
];
// Delivery steps: indices in days
var STEP_DELAYS = [
  0,          // Order Received — now
  3,          // Card Minted — 3 days
  5,          // Packed — 5 days
  14,         // In Transit — 2 weeks
  35,         // Out for Delivery — 35 days
  50          // Delivered — 50 days (~1.5 months)
];
var STEP_DURATION = 24 * 60 * 60 * 1000; // 1 day in ms

function genTrackId(){
  var s = 'NC-' + new Date().getFullYear() + '-';
  var ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i=0; i<6; i++) s += ch[Math.floor(Math.random()*ch.length)];
  return s;
}

function stepIndexFor(createdAt){
  var idx = Math.floor((Date.now() - createdAt) / STEP_DURATION);
  if (idx > STEPS.length - 1) idx = STEPS.length - 1;
  return idx;
}

function placeOrder(){
  var name = $('oName').value.trim();
  var city = $('oCity').value.trim();
  var street = $('oStreet').value.trim();
  var zip = $('oZip').value.trim();
  var phone = $('oPhone').value.trim();
  var country = $('oCountry').value;
  var type = $('oType').value;
  if (!name || !city || !street || !zip || !phone){ toast('Please fill in all fields', true); return; }

  st.order = {
    id: genTrackId(), name: name, type: type,
    address: street + ', ' + city + ', ' + zip + ', ' + country,
    dest: city + ', ' + country,
    createdAt: Date.now()
  };
  saveToServer();
  renderOrder();
  addNotification('Physical card order placed. Tracking: ' + st.order.id, '📦');
  toast('Order placed! Tracking ID: ' + st.order.id);
}

function renderOrder(){
  if (!st.order){
    $('orderForm').classList.remove('hidden');
    $('orderTrack').classList.add('hidden');
    return;
  }
  $('orderForm').classList.add('hidden');
  $('orderTrack').classList.remove('hidden');

  var idx = stepIndexFor(st.order.createdAt);
  var steps = document.querySelectorAll('#stepsWrap .step');
  for (var i=0; i<steps.length; i++){
    steps[i].classList.remove('done','active');
    if (i < idx) steps[i].classList.add('done');
    if (i === idx) steps[i].classList.add('active');
  }

  var pct = Math.round(((idx + 1) / STEPS.length) * 100);
  $('trackBar').style.width = pct + '%';
  $('trackPct').textContent = pct + '%';
  $('trackStatus').textContent = STEPS[idx].name;
  $('trackId').textContent = st.order.id;
  $('trackName').textContent = st.order.name;
  $('trackDest').textContent = st.order.dest;
  $('trackLoc').textContent = STEPS[idx].loc;

  var eta = new Date(st.order.createdAt + STEPS.length * STEP_DURATION);
  $('trackEta').textContent = eta.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) + ', ' + eta.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

  var logHtml = '';
  for (var j=0; j<=idx; j++){
    var t = new Date(st.order.createdAt + j * STEP_DURATION);
    logHtml += '<div class="log-item"><span class="log-time">' + t.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + '</span><span class="log-msg">' + STEPS[j].name + ' — ' + STEPS[j].loc + '</span></div>';
  }
  $('trackLog').innerHTML = logHtml;
}

function newOrder(){
  if (!confirm('Start a new card order? Current tracking will be lost.')) return;
  st.order = null;
  saveToServer();
  renderOrder();
}

/* ========== AUTO CHECK DEPOSITS ========== */
function startAutoCheck(){
  stopAutoCheck();
  autoCheckKnown = {};
  doAutoCheck();
  autoCheckTimer = setInterval(doAutoCheck, 15000);
}

function stopAutoCheck(){
  if (autoCheckTimer){ clearInterval(autoCheckTimer); autoCheckTimer = null; }
}

function doAutoCheck(){
  var method = $('mMethod').value;
  var isBtc = (method === 'Bitcoin (BTC)');
  var isEth = (method === 'Ethereum (ETH)');
  if (!isBtc && !isEth) return;

  fetch(WORKER_URL + '?action=check')
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (!data || !data.result) return;
      var list = isBtc ? data.result.btc : data.result.eth;
      if (!list || list.length === 0) return;

      for (var i = 0; i < list.length; i++){
        var tx = list[i];
        var id = tx.hash;
        if (autoCheckKnown[id]) continue;

        var already = false;
        for (var j = 0; j < st.txs.length; j++){
          if (st.txs[j].hash === id){ already = true; break; }
        }
        if (already){ autoCheckKnown[id] = true; continue; }

        autoCheckKnown[id] = true;
        var cryptoAmt = isBtc ? tx.amount : tx.value;
        var symbol = isBtc ? 'BTC' : 'ETH';
        var credit = isBtc ? (tx.amount * st.btcP) : (tx.value * st.ethP);
        if (!credit || credit <= 0) continue;

        st.usd += credit;
        if (isBtc) st.btc += tx.amount;
        else st.eth += tx.value;

        st.txs.unshift({
          date: now(), ts: Date.now(),
          desc: 'Crypto deposit — ' + cryptoAmt.toFixed(8) + ' ' + symbol + ' (' + tx.hash.slice(0, 10) + '…)',
          amt: credit, status: 'Processing', hash: tx.hash,
          crypto: cryptoAmt, symbol: symbol
        });

        saveToServer();
        render();
        addNotification('Deposit received: ' + cryptoAmt.toFixed(8) + ' ' + symbol + ' (' + fmtCurrency(credit) + ')', '💰');
        toast('Deposit received! Credited ' + fmt(credit));
        closeModal();
        return;
      }
    })
    .catch(function(err){ console.error('Auto-check error:', err); });
}

/* ========== AUTO UPDATE STATUSES ========== */
function updateTxStatuses(){
  var changed = false;
  for (var i=0; i<st.txs.length; i++){
    var t = st.txs[i];
    if (!t.ts) t.ts = Date.now();
    var age = Date.now() - t.ts;
    if (t.status === 'Under Review' && age > 60*1000){ t.status = 'Processing'; changed = true; }
    else if (t.status === 'Processing' && age > 3*60*1000){ t.status = 'Completed'; changed = true; }
  }
  if (changed){ renderTx(); saveToServer(); }
}

/* ========== ONBOARDING (Create Virtual Card) ========== */
var selectedDesign = 'cosmic';
var onbType = 'Visa';
var onbCur = 'USD';

function updateOnbPreview(){
  var typeEl = $('prevType');
  var nameEl = $('prevName');
  var curEl = $('prevCur');

  if (typeEl) typeEl.textContent = 'VIRTUAL ' + onbType.toUpperCase();
  if (nameEl){
    var full = getFullName();
    nameEl.textContent = (full || 'YOUR NAME').toUpperCase();
  }
  if (curEl) curEl.textContent = onbCur;

  // Превью дизайна
  var previewCards = document.querySelectorAll('.onb-preview .pay');
  for (var i = 0; i < previewCards.length; i++){
    var c = previewCards[i];
    c.classList.remove('design-cosmic', 'design-purple', 'design-silver', 'design-black', 'design-gold');
    c.classList.add('design-' + selectedDesign);
  }
}

var typeBtns = document.querySelectorAll('.type-btn');
for (var t = 0; t < typeBtns.length; t++){
  typeBtns[t].onclick = function(){
    for (var k = 0; k < typeBtns.length; k++) typeBtns[k].classList.remove('on');
    this.classList.add('on');
    onbType = this.getAttribute('data-type');
    updateOnbPreview();
  };
}

var curBtns = document.querySelectorAll('.cur-btn');
for (var c = 0; c < curBtns.length; c++){
  curBtns[c].onclick = function(){
    for (var k = 0; k < curBtns.length; k++) curBtns[k].classList.remove('on');
    this.classList.add('on');
    onbCur = this.getAttribute('data-cur');
    updateOnbPreview();
  };
}

updateOnbPreview();
/* Step 1 — Get started */
var step1Btn = document.getElementById('onbNext1');
if (step1Btn) step1Btn.onclick = function(){
  playTone(660, 0.06, 'sine', 0.05);
  goToOnbStep(2);
  setTimeout(function(){
    if ($('onbFirst')) $('onbFirst').focus();
  }, 200);
};

/* Step 2 — Back */
var step2Back = document.getElementById('onbBack2');
if (step2Back) step2Back.onclick = function(){
  goToOnbStep(1);
};

/* Step 2 — Continue */
var step2Next = document.getElementById('onbNext2');
if (step2Next) step2Next.onclick = function(){
  var first = $('onbFirst').value.trim();
  var last = $('onbLast').value.trim();
  if (!first){ toast('Please enter your first name', true); $('onbFirst').focus(); return; }
  if (!last){ toast('Please enter your last name', true); $('onbLast').focus(); return; }
  playTone(880, 0.08, 'sine', 0.06);
  updateStep3Title();
  updateOnbPreview();
  goToOnbStep(3);
};

/* Live preview на шаге 2 */
['onbFirst', 'onbMiddle', 'onbLast'].forEach(function(id){
  var el = document.getElementById(id);
  if (el) el.oninput = function(){
    updateOnbPreview();
    updateStep3Title();
  };
});
document.getElementById('btnCreateCard').onclick = function(){
  var name = getFullName();
  if (!name || name.length < 2){ toast('Please enter your name', true); return; }

  // 1. Создать карту в state
  createVirtualCard(name, onbType, onbCur);

  // 2. Подготовить данные для анимации
  var cardData = {
    num: st.card.num,
    name: st.card.name,
    expiry: st.card.expiry,
    type: st.card.type
  };

  // 3. Скрыть форму создания (плавно)
  var onboardEl = $('onboard');
  onboardEl.classList.add('exiting');

  // 4. Запустить анимацию
  playCardCreationAnimation(cardData, function(){
    // После анимации — закрыть onboarding
    onboardEl.classList.remove('on');
    onboardEl.classList.remove('exiting');

    // 5. Перейти на Dashboard
    var pgs = document.querySelectorAll('.pg');
    for (var j = 0; j < pgs.length; j++) pgs[j].classList.remove('on');
    $('dash').classList.add('on');
    var ms = document.querySelectorAll('.mi');
    for (var k = 0; k < ms.length; k++) ms[k].classList.remove('on');
    document.querySelector('.mi[data-p="dash"]').classList.add('on');
    $('ttl').textContent = 'Dashboard';

    // 6. Показать свечение на карте и пульс баланса
    renderCard();
    var dashCard = $('cardDash');
    if (dashCard){
      dashCard.classList.add('fresh-card');
      setTimeout(function(){ dashCard.classList.remove('fresh-card'); }, 2600);
    }
    var balEl = $('bal');
    if (balEl){
      balEl.classList.add('balance-pulse');
      setTimeout(function(){ balEl.classList.remove('balance-pulse'); }, 1600);
    }

        // 7. Запустить верификацию
    setTimeout(function(){
      showVerifyScreen();
    }, 500);

    addNotification('Virtual card issued: ' + (st.card.type || 'Visa') + ' ' + (st.card.cur || 'USD'), '💳');
    toast('Virtual card created!');
  });
};

/* ========== CARD ACTIONS ========== */
document.getElementById('btnShowCvv').onclick = function(){
  if (!st.card) return;
  cvvVisible = !cvvVisible;
  renderCard();
  if (cvvVisible){
    clearTimeout(cvvTimer);
    cvvTimer = setTimeout(function(){
      cvvVisible = false;
      renderCard();
    }, 5000);
  }
};

document.getElementById('btnFreeze').onclick = function(){
  if (!st.card) return;
  st.card.status = st.card.status === 'Frozen' ? 'Active' : 'Frozen';
  saveToServer();
  renderCard();
  addNotification(st.card.status === 'Frozen' ? 'Card frozen' : 'Card unfrozen', st.card.status === 'Frozen' ? '❄' : '🔥');
toast(st.card.status === 'Frozen' ? 'Card frozen' : 'Card unfrozen');
};

document.getElementById('btnDeleteCard').onclick = function(){
  if (!st.card) return;
  if (!confirm('Delete your card? Balance and transactions will stay.')) return;
  st.card = null;
  saveToServer();
  renderCard();
  checkOnboarding();
  addNotification('Card deleted', '🗑');
  toast('Card deleted');
};

document.getElementById('btnGoOrder').onclick = function(){
  var pgs = document.querySelectorAll('.pg');
  for (var j = 0; j < pgs.length; j++) pgs[j].classList.remove('on');
  $('order').classList.add('on');
  var ms = document.querySelectorAll('.mi');
  for (var k = 0; k < ms.length; k++) ms[k].classList.remove('on');
  document.querySelector('.mi[data-p="order"]').classList.add('on');
  $('ttl').textContent = 'Order New Card';
};

/* ========== EVENTS ========== */
document.getElementById('btnAdd').onclick = function(){ openModal('add'); };
document.getElementById('btnTransfer').onclick = function(){ openModal('transfer'); };
document.getElementById('mCancel').onclick = closeModal;
document.getElementById('mOk').onclick = confirmModal;
document.getElementById('mMethod').onchange = refreshDest;

document.getElementById('btnCopy').onclick = function(){
  if (!st.card){ toast('No card yet', true); return; }
  copyText(st.card.num, 'Card number copied');
};
document.getElementById('btnCopyIban').onclick = function(){
  if (st.user && st.user.iban){
    copyText(st.user.iban, 'IBAN copied');
  } else {
    toast('IBAN is not ready yet', true);
  }
};
document.getElementById('btnOrder').onclick = placeOrder;
var btnNO = document.getElementById('btnNewOrder');
if (btnNO) btnNO.onclick = newOrder;

document.getElementById('btnReset').onclick = function(){
  if (!confirm('Reset ALL data? Balance, transactions, card and orders will be cleared.')) return;
  st = JSON.parse(JSON.stringify(def));
  saveToServer();
  render();
  checkOnboarding();
  toast('All data reset');
};

/* ========== TIMERS ========== */
setInterval(function(){ updateTxStatuses(); renderOrder(); }, 5000);

/* ========== ONBOARDING STEP NAVIGATION ========== */
function goToOnbStep(n){
  var steps = document.querySelectorAll('.onb-step');
  for (var i = 0; i < steps.length; i++) steps[i].classList.remove('on');
  var target = document.getElementById('onbStep' + n);
  if (target) target.classList.add('on');
}

function getFullName(){
  var first = ($('onbFirst') ? $('onbFirst').value.trim() : '');
  var middle = ($('onbMiddle') ? $('onbMiddle').value.trim() : '');
  var last = ($('onbLast') ? $('onbLast').value.trim() : '');
  var parts = [];
  if (first) parts.push(first);
  if (middle) parts.push(middle);
  if (last) parts.push(last);
  return parts.join(' ');
}

function getFirstName(){
  var first = ($('onbFirst') ? $('onbFirst').value.trim() : '');
  return first || 'there';
}

function updateStep3Title(){
  var fn = getFirstName();
  var el = $('onbStep3Title');
  if (el) el.textContent = 'Almost done, ' + fn + '!';
}
/* ========== CARD CREATION ANIMATION ========== */
function playCardCreationAnimation(cardData, onComplete){
  var stage = document.getElementById('animStage');
  var card = document.getElementById('animCard');
  var numLine = document.getElementById('animNum');
  var nameEl = document.getElementById('animName');
  var expEl = document.getElementById('animExp');
  var brandEl = document.getElementById('animBrand');
  var typeEl = document.getElementById('animType');
  var readyText = document.getElementById('readyText');

  if (!stage || !card){
    if (onComplete) onComplete();
    return;
  }

  stage.classList.add('on');
  card.classList.remove('visible', 'glow', 'flash', 'exit');
  card.classList.add('visible');
  readyText.classList.remove('show');
  numLine.textContent = '';
  numLine.classList.remove('typing');
  nameEl.classList.remove('show');
  expEl.classList.remove('show');
  nameEl.textContent = '—';
  expEl.textContent = '—/—';
  brandEl.textContent = 'NORDIC CRYPTO';
  typeEl.textContent = 'VIRTUAL ' + (cardData.type || 'VISA').toUpperCase();

  setTimeout(function(){ playTone(880, 0.08, 'sine', 0.06); }, 50);

  setTimeout(function(){
    card.classList.add('glow');
  }, 800);

  var numStr = cardData.num.replace(/(.{4})/g, '$1 ').trim();
  setTimeout(function(){
    numLine.classList.add('typing');
    var i = 0;
    var typeTimer = setInterval(function(){
      if (i >= numStr.length){
        clearInterval(typeTimer);
        numLine.classList.remove('typing');
        return;
      }
      numLine.textContent += numStr[i];
      i++;
      playTone(1200 + Math.random() * 200, 0.02, 'square', 0.02);
    }, 55);
  }, 1200);

  setTimeout(function(){
    nameEl.textContent = cardData.name || 'CARD HOLDER';
    expEl.textContent = cardData.expiry || '09/28';
    nameEl.classList.add('show');
    expEl.classList.add('show');
  }, 2200);

  setTimeout(function(){
    card.classList.add('flash');
    playChime();
    spawnConfetti();
  }, 2600);

  setTimeout(function(){
    readyText.classList.add('show');
  }, 3000);

  setTimeout(function(){
    card.classList.add('exit');
  }, 3600);

  setTimeout(function(){
    stage.classList.remove('on');
    card.classList.remove('visible', 'glow', 'flash', 'exit');
    readyText.classList.remove('show');
    if (onComplete) onComplete();
  }, 4300);
}

/* ========== SOUND (Web Audio API) ========== */
var audioCtx = null;
function getAudioCtx(){
  if (!audioCtx){
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e){ return null; }
  }
  return audioCtx;
}

/* ========== AUDIO UNLOCK ========== */
document.addEventListener('click', function unlockAudio(){
  var ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended'){
    ctx.resume().then(function(){
      console.log('AudioContext resumed');
    });
  }
}, { once: false });

function playTone(freq, duration, type, volume){
  var ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended'){
    ctx.resume();
    return;
  }
  try {
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var vol = Math.min(volume || 0.3, 1);
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  } catch(e){}
}

function playChime(){
  playTone(880, 0.4, 'sine', 0.08);
  setTimeout(function(){ playTone(1108, 0.4, 'sine', 0.07); }, 80);
  setTimeout(function(){ playTone(1318, 0.5, 'sine', 0.06); }, 160);
}

/* ========== CONFETTI ========== */
function spawnConfetti(){
  var wrap = document.getElementById('confettiWrap');
  if (!wrap) return;
  wrap.innerHTML = '';

  var total = 30;
  var types = ['coin', 'spark', 'crystal', 'star'];
  var symbols = ['₿', 'Ξ', '', ''];

  for (var i = 0; i < total; i++){
    var p = document.createElement('div');
    var t = types[Math.floor(Math.random() * types.length)];
    p.className = 'confetti-piece ' + t;

    if (t === 'coin'){
      p.textContent = symbols[Math.floor(Math.random() * 2)];
    }

    var size = 10 + Math.random() * 12;
    p.style.width = size + 'px';
    p.style.height = size + 'px';

    var angle = Math.random() * Math.PI * 2;
    var distance = 200 + Math.random() * 400;
    var tx = Math.cos(angle) * distance;
    var ty = Math.sin(angle) * distance - 100;

    p.style.setProperty('--tx', tx + 'px');
    p.style.setProperty('--ty', ty + 'px');
    p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');

    p.style.animation = 'confettiFly ' + (1.2 + Math.random() * 0.8) + 's cubic-bezier(.2,.8,.4,1) forwards';
    p.style.animationDelay = (Math.random() * 0.3) + 's';

    wrap.appendChild(p);
  }

  setTimeout(function(){ wrap.innerHTML = ''; }, 2500);
}
/* ========== INIT ========== */
loadFromServer(function(){
  loadPrices();
  loadExchangeRates();
  initCurrencySwitcher();
  initNotifications();
  renderNotifications();
  initSoundButton();
  initVerification();
  initVerification();
  initDesignPicker();
  startIbanGeneration();
  initRecentTx();
  loadCharts();
  setInterval(loadPrices, 5 * 60 * 1000);
  setInterval(loadExchangeRates, 10 * 60 * 1000);
  setInterval(loadCharts, 15 * 60 * 1000);
});
setTimeout(function(){
  if (!checkOnboarding()){
    checkVerificationNeeded();
  }
}, 1000);

/* ========== AUDIO KEEP-ALIVE ========== */
// Будим AudioContext сразу при загрузке
setTimeout(function(){
  var ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}, 500);

// Каждые 20 секунд — тихая "проверка", чтобы контекст не засыпал
setInterval(function(){
  var ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}, 20000);

/* ========== AUDIO UNLOCK ON EVERY CLICK ========== */
document.addEventListener('click', function(){
  var ctx = getAudioCtx();
  if (ctx && ctx.state !== 'running') {
    ctx.resume();
  }
}, { passive: true });

document.addEventListener('touchstart', function(){
  var ctx = getAudioCtx();
  if (ctx && ctx.state !== 'running') {
    ctx.resume();
  }
}, { passive: true });
