/* ========== STORAGE ========== */
var KEY = 'nordic_crypto_v3';
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(st)); }catch(e){} }
function load(){ try{ var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; }catch(e){ return null; } }
function clear(){ try{ localStorage.removeItem(KEY); }catch(e){} }

/* ========== STATE ========== */
var def = {
  usd: 0, btc: 0, eth: 0,
  btcP: 68000, ethP: 3200, eurR: 0.92,
  txs: [],
  order: null
};
var st = load() || JSON.parse(JSON.stringify(def));
var mode = null, tt = null;

function $(i){ return document.getElementById(i); }
function fmt(n){ return '$' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function eurF(n){ return '≈ €' + Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function now(){ return new Date().toISOString().slice(0,10); }

/* ========== NAVIGATION ========== */
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
  save();
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
  renderTx(); save();
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

/* ========== MODAL ========== */
function destHint(method){
  if (method === 'Bank Transfer (SEPA)') return { show:true, label:'Recipient IBAN', ph:'SE35 5000 0000 0549 1000 0003' };
  if (method === 'Credit Card')          return { show:true, label:'Recipient Card Number', ph:'4921 8842 1093 5542' };
  if (method === 'Bitcoin (BTC)')        return { show:true, label:'Recipient BTC Address', ph:'bc1q...' };
  if (method === 'Ethereum (ETH)')       return { show:true, label:'Recipient ETH Address', ph:'0x...' };
  return { show:false };
}

function refreshDest(){
  var hint = destHint($('mMethod').value);
  if (hint.show){
    $('mDestWrap').style.display = 'block';
    $('mDestLabel').textContent = hint.label;
    $('mDest').placeholder = hint.ph;
  } else {
    $('mDestWrap').style.display = 'none';
    $('mDest').value = '';
  }
}

function openModal(m){
  mode = m;
  $('mTitle').textContent = m === 'add' ? 'Add Funds' : 'Transfer Funds';
  $('mDesc').textContent = m === 'add' ? 'Enter the amount you wish to deposit.' : 'Enter the amount and recipient details.';
  $('mAmount').value = '';
  $('mDest').value = '';
  if (m === 'transfer'){
    $('mMethod').value = 'Bank Transfer (SEPA)';
  } else {
    $('mMethod').value = 'Bitcoin (BTC)';
  }
  refreshDest();
  $('mask').classList.add('on');
  setTimeout(function(){ $('mAmount').focus(); }, 100);
}

function closeModal(){ $('mask').classList.remove('on'); mode = null; }
/* ========== TRANSFER LOGIC ========== */
function isCrypto(m){ return m === 'Bitcoin (BTC)' || m === 'Ethereum (ETH)'; }

function confirmModal(){
  var a = Number($('mAmount').value);
  var m = $('mMethod').value;
  var dest = $('mDest').value.trim();

  if (!a || a <= 0){ toast('Please enter a valid amount', true); return; }

  if (mode === 'add'){
    st.usd += a;
    addTx('Deposit via ' + m, a, isCrypto(m) ? 'Processing' : 'Under Review');
    toast('Added ' + fmt(a));
    closeModal();
    render();
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
}

/* ========== COPY ========== */
function copyText(txt, okMsg){
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(function(){ toast(okMsg); }).catch(function(){ toast(okMsg); });
  } else { toast(okMsg); }
}

/* ========== ORDER + TRACKING (Sweden) ========== */
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
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i=0; i<6; i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function stepIndexFor(createdAt){
  var elapsed = Date.now() - createdAt;
  var idx = Math.floor(elapsed / STEP_DURATION);
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
    id: genTrackId(),
    name: name,
    type: type,
    address: street + ', ' + city + ', ' + zip + ', ' + country,
    dest: city + ', ' + country,
    createdAt: Date.now()
  };
  save();
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

  var etaMs = st.order.createdAt + STEPS.length * STEP_DURATION;
  var eta = new Date(etaMs);
  $('trackEta').textContent = eta.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ', ' + eta.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  var logHtml = '';
  for (var j=0; j<=idx; j++){
    var t = new Date(st.order.createdAt + j * STEP_DURATION);
    logHtml += '<div class="log-item"><span class="log-time">' + t.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + '</span><span class="log-msg">' + STEPS[j].name + ' — ' + STEPS[j].loc + '</span></div>';
  }
  $('trackLog').innerHTML = logHtml;
  $('trackLog').scrollTop = $('trackLog').scrollHeight;
}

function newOrder(){
  if (!confirm('Start a new card order? Current tracking will be lost.')) return;
  st.order = null;
  save();
  renderOrder();
}

/* ========== AUTO UPDATE TX STATUS ========== */
function updateTxStatuses(){
  var changed = false;
  for (var i=0; i<st.txs.length; i++){
    var t = st.txs[i];
    if (!t.ts) t.ts = Date.now();
    var age = Date.now() - t.ts;
    if (t.status === 'Under Review' && age > 60 * 1000){
      t.status = 'Processing'; changed = true;
    } else if (t.status === 'Processing' && age > 3 * 60 * 1000){
      t.status = 'Completed'; changed = true;
    }
  }
  if (changed){ renderTx(); save(); }
}

/* ========== EVENTS ========== */
document.getElementById('btnAdd').onclick = function(){ openModal('add'); };
document.getElementById('btnTransfer').onclick = function(){ openModal('transfer'); };
document.getElementById('mCancel').onclick = closeModal;
document.getElementById('mOk').onclick = confirmModal;
document.getElementById('mMethod').onchange = refreshDest;

document.getElementById('btnCopy').onclick = function(){
  copyText('4921884210935542', 'Card number copied');
};
document.getElementById('btnCopyIban').onclick = function(){
  copyText('SE3550000000054910000003', 'IBAN copied');
};
document.getElementById('btnOrder').onclick = placeOrder;
document.getElementById('btnNewOrder').onclick = newOrder;

document.getElementById('btnReset').onclick = function(){
  if (!confirm('Reset all data? Balance, transactions and orders will be cleared.')) return;
  clear();
  st = JSON.parse(JSON.stringify(def));
  render();
  toast('All data reset');
};

/* ========== TIMERS ========== */
setInterval(function(){
  updateTxStatuses();
  renderOrder();
}, 5000);

/* ========== INIT ========== */
render();
