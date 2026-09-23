/* ========== LOCALSTORAGE ========== */
var KEY = 'nordic_crypto_v1';

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch(e){}
}

function load(){
  try {
    var raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(e){ return null; }
}

function clear(){
  try { localStorage.removeItem(KEY); } catch(e){}
}

/* ========== STATE ========== */
var def = {usd:0, btc:0, eth:0, btcP:68000, ethP:3200, eurR:0.92, txs:[]};
var st = load() || JSON.parse(JSON.stringify(def));
var mode = null, tt = null;

function $(i){ return document.getElementById(i); }
function fmt(n){ return '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function eurF(n){ return '≈ €' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* ========== NAVIGATION ========== */
var titles = {dash:'Dashboard',cards:'My Cards',assets:'Crypto Assets',tx:'Transactions',order:'Order New Card'};
var mis = document.querySelectorAll('.mi');
for (var i = 0; i < mis.length; i++){
  mis[i].onclick = function(){
    var p = this.getAttribute('data-p');
    var pgs = document.querySelectorAll('.pg');
    for (var j = 0; j < pgs.length; j++) pgs[j].classList.remove('on');
    $(p).classList.add('on');
    var ms = document.querySelectorAll('.mi');
    for (var k = 0; k < ms.length; k++) ms[k].classList.remove('on');
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
  save();
}

function renderTx(){
  var b = $('txB');
  if (st.txs.length === 0){
    b.innerHTML = '<tr><td colspan="4"><div class="empty"><svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/></svg><div>No transactions yet</div></div></td></tr>';
    return;
  }
  var h = '';
  for (var i = 0; i < st.txs.length; i++){
    var t = st.txs[i];
    var c = t.amt >= 0 ? 'var(--ok)' : 'var(--bad)';
    var s = t.amt >= 0 ? '+' : '';
    h += '<tr><td>' + t.date + '</td><td>' + t.desc + '</td><td style="color:' + c + ';font-weight:600">' + s + fmt(t.amt) + '</td><td><span class="badge">' + t.status + '</span></td></tr>';
  }
  b.innerHTML = h;
}

function addTx(d, a){
  st.txs.unshift({date: new Date().toISOString().slice(0,10), desc: d, amt: a, status: 'Completed'});
  renderTx();
  save();
}

/* ========== MODAL ========== */
function openModal(m){
  mode = m;
  $('mTitle').textContent = m === 'add' ? 'Add Funds' : 'Transfer Funds';
  $('mDesc').textContent = m === 'add' ? 'Enter the amount you wish to deposit.' : 'Enter the amount you wish to send.';
  $('mAmount').value = '';
  $('mask').classList.add('on');
  setTimeout(function(){ $('mAmount').focus(); }, 100);
}

function closeModal(){
  $('mask').classList.remove('on');
  mode = null;
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

/* ========== EVENTS ========== */
document.getElementById('btnAdd').onclick = function(){ openModal('add'); };
document.getElementById('btnTransfer').onclick = function(){ openModal('transfer'); };
document.getElementById('mCancel').onclick = closeModal;

document.getElementById('mOk').onclick = function(){
  var a = Number($('mAmount').value);
  var m = $('mMethod').value;
  if (!a || a <= 0){ toast('Please enter a valid amount', true); return; }
  if (mode === 'add'){
    st.usd += a;
    addTx('Deposit via ' + m, a);
    toast('Added ' + fmt(a));
  } else {
    if (a > st.usd){ toast('Insufficient balance', true); return; }
    st.usd -= a;
    addTx('Transfer via ' + m, -a);
    toast('Sent ' + fmt(a));
  }
  closeModal();
  render();
};

document.getElementById('btnCopy').onclick = function(){
  var n = '4921884210935542';
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(n).then(function(){ toast('Card number copied'); }).catch(function(){ toast('Card number copied'); });
  } else {
    toast('Card number copied');
  }
};

document.getElementById('btnOrder').onclick = function(){
  var n = $('oName').value.trim();
  var c = $('oCity').value.trim();
  var s = $('oStreet').value.trim();
  var z = $('oZip').value.trim();
  var p = $('oPhone').value.trim();
  if (!n || !c || !s || !z || !p){ toast('Please fill in all fields', true); return; }
  toast('Order placed! Card is on the way.');
  $('oCity').value = '';
  $('oStreet').value = '';
  $('oZip').value = '';
  $('oPhone').value = '';
};

document.getElementById('btnReset').onclick = function(){
  if (!confirm('Reset all data? Balance and transactions will be cleared.')) return;
  clear();
  st = JSON.parse(JSON.stringify(def));
  render();
  toast('All data reset');
};

render();
