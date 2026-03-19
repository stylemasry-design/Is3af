/* =====================
   MINYA HEALTH PWA — app.js
   Vanilla JS, No frameworks
======================== */

'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────
const STATE = {
  data: [],
  filtered: [],
  currentFilter: 'all',
  currentCenter: 'all',
  searchQuery: '',
  page: 0,
  perPage: 15,
  mapMode: true,
  favorites: JSON.parse(localStorage.getItem('mh_fav') || '[]'),
  currentItem: null,
  map: null,
  markers: [],
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const CENTER_COORDS = {
  all:          [28.1099, 30.7503],
  minya:        [28.0833, 30.7500],
  samalout:     [28.3167, 30.7167],
  matay:        [28.4167, 30.7833],
  beni_mazar:   [28.5000, 30.8000],
  maghagha:     [28.6333, 30.8333],
  mallawi:      [27.7333, 30.8333],
  deir_mawas:   [27.6333, 30.8167],
  abu_qurqas:   [28.0167, 30.8333],
  abo_kbeer:    [28.2833, 30.7667],
};

const TYPE_EMOJI = {doctor:'🩺', pharmacy:'💊', hospital:'🏥', emergency_point:'🚨'};
const TYPE_LABEL = {doctor:'طبيب', pharmacy:'صيدلية', hospital:'مستشفى', emergency_point:'نقطة طوارئ'};

// ─── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerSW();
  setTimeout(hideSplash, 1500);
  loadData();
  watchOnline();
});

function hideSplash() {
  document.getElementById('splash').classList.add('hide');
  document.getElementById('app').hidden = false;
  initMap();
  handleHash();
}

window.addEventListener('hashchange', handleHash);

function handleHash() {
  const hash = location.hash.replace('#/', '').split('/');
  const page = hash[0] || 'home';
  if (page === 'item' && hash[1]) showItem(hash[1]);
  else route(page);
}

// ─── ROUTING ──────────────────────────────────────────────────────────────
function route(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  const backBtn = document.getElementById('back-btn');
  backBtn.hidden = (page === 'home');
  if (page === 'favorites') renderFavorites();
  if (page !== 'item') location.hash = '#/' + page;
}

function goBack() { route('home'); }

// ─── DATA LOADING ─────────────────────────────────────────────────────────
async function loadData() {
  try {
    // Try cache first via fetch (SW handles it)
    const res = await fetch('data.json');
    STATE.data = await res.json();
  } catch(e) {
    // Fallback: try IndexedDB or sample data
    STATE.data = getSampleData();
    showToast('⚠️ يتم عرض البيانات المخزنة');
  }
  applyFilters();
}

// ─── FILTERS ──────────────────────────────────────────────────────────────
window.setFilter = function(type, btn) {
  STATE.currentFilter = type;
  STATE.page = 0;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  applyFilters();
};

window.setCenter = function(center) {
  STATE.currentCenter = center;
  STATE.page = 0;
  if (STATE.map && CENTER_COORDS[center]) {
    STATE.map.setView(CENTER_COORDS[center], center === 'all' ? 10 : 13);
  }
  applyFilters();
};

window.onSearch = function(q) {
  STATE.searchQuery = q.trim().toLowerCase();
  STATE.page = 0;
  applyFilters();
};

function applyFilters() {
  let d = [...STATE.data];

  // Type filter
  if (STATE.currentFilter !== 'all')
    d = d.filter(x => x.type === STATE.currentFilter);

  // Center filter
  if (STATE.currentCenter !== 'all')
    d = d.filter(x => x.center === STATE.currentCenter);

  // Search
  if (STATE.searchQuery) {
    const q = STATE.searchQuery;
    d = d.filter(x =>
      (x.name && x.name.toLowerCase().includes(q)) ||
      (x.specialty && x.specialty.toLowerCase().includes(q)) ||
      (x.address && x.address.toLowerCase().includes(q)) ||
      (x.tags && x.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  STATE.filtered = d;
  renderList();
  renderMarkers();
}

// ─── MAP ──────────────────────────────────────────────────────────────────
function initMap() {
  STATE.map = L.map('map', {
    center: CENTER_COORDS.minya,
    zoom: 13,
    zoomControl: true,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OSM',
  }).addTo(STATE.map);

  // attribution compact
  L.control.attribution({position:'bottomleft',prefix:''}).addTo(STATE.map);
}

function renderMarkers() {
  // Clear old markers
  STATE.markers.forEach(m => m.remove());
  STATE.markers = [];

  const items = STATE.filtered.slice(0, 100); // max 100 visible markers
  items.forEach(item => {
    if (!item.lat || !item.lng) return;
    const icon = L.divIcon({
      html: `<div class="custom-marker ${item.type}">${TYPE_EMOJI[item.type]||'📍'}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      className: '',
    });
    const m = L.marker([item.lat, item.lng], {icon})
      .addTo(STATE.map)
      .bindPopup(`
        <div style="font-family:Cairo,sans-serif;direction:rtl;min-width:160px">
          <strong>${item.name}</strong><br>
          <small>${item.specialty || TYPE_LABEL[item.type] || ''}</small><br>
          ${item.phone ? `<a href="tel:${item.phone}" style="color:#2D6A4F;font-weight:700">📞 ${item.phone}</a>` : ''}
          <br><button onclick="goToItem('${item.id}')" style="margin-top:6px;background:#2D6A4F;color:#fff;border:none;padding:4px 10px;border-radius:8px;font-family:Cairo,sans-serif;cursor:pointer">عرض التفاصيل</button>
        </div>
      `);
    STATE.markers.push(m);
  });
}

window.toggleMapList = function() {
  STATE.mapMode = !STATE.mapMode;
  const mapWrap = document.getElementById('map-wrap');
  const list = document.getElementById('results-list');
  const btn = document.getElementById('map-toggle');
  if (STATE.mapMode) {
    mapWrap.classList.remove('hidden');
    list.classList.add('hidden');
    btn.textContent = '📋 قائمة';
    STATE.map.invalidateSize();
  } else {
    mapWrap.classList.add('hidden');
    list.classList.remove('hidden');
    btn.style.display = 'none';
    // show a toggle back btn inside list
  }
};

// ─── LIST RENDER ──────────────────────────────────────────────────────────
function renderList() {
  const container = document.getElementById('list-items');
  const start = 0;
  const end = (STATE.page + 1) * STATE.perPage;
  const items = STATE.filtered.slice(start, end);

  if (!STATE.mapMode) {
    container.innerHTML = items.length
      ? items.map(renderCard).join('')
      : '<div class="empty-state"><div>🔍</div><p>لا توجد نتائج</p></div>';
  }

  const loadMoreBtn = document.getElementById('load-more');
  loadMoreBtn.hidden = end >= STATE.filtered.length;
}

window.loadMore = function() {
  STATE.page++;
  renderList();
};

function renderCard(item) {
  const isFav = STATE.favorites.includes(item.id);
  return `
    <div class="result-card" onclick="goToItem('${item.id}')">
      <div class="result-card-accent ${item.type}"></div>
      <div class="result-card-body">
        <div class="result-name">${item.name}</div>
        <div class="result-meta">
          <span>${item.specialty || TYPE_LABEL[item.type] || ''}</span>
          ${item.rating ? `<span class="result-rating">★ ${item.rating}</span>` : ''}
          ${item.hours ? `<span>🕐 ${item.hours}</span>` : ''}
        </div>
        ${item.address ? `<div class="result-meta" style="margin-top:4px">📍 ${item.address}</div>` : ''}
        <div class="result-actions">
          ${item.phone ? `<a class="act-btn call" href="tel:${item.phone}" onclick="event.stopPropagation()">📞 اتصال</a>` : ''}
          ${item.whatsapp ? `<a class="act-btn wa" href="https://wa.me/${item.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent('مرحباً، أحتاج استشارة')}" onclick="event.stopPropagation()">💬 واتساب</a>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ─── ITEM DETAIL ──────────────────────────────────────────────────────────
window.goToItem = function(id) {
  const item = STATE.data.find(x => x.id === id);
  if (!item) return;
  STATE.currentItem = item;
  showItem(id);
};

function showItem(id) {
  const item = STATE.data.find(x => x.id === id) || STATE.currentItem;
  if (!item) { route('home'); return; }
  STATE.currentItem = item;

  const isFav = STATE.favorites.includes(item.id);
  const waMsg = encodeURIComponent(`مرحباً ${item.name}، أحتاج استشارة طبية`);
  const mapsUrl = item.lat && item.lng
    ? `https://maps.google.com/?q=${item.lat},${item.lng}`
    : `https://maps.google.com/?q=${encodeURIComponent(item.address||item.name+' المنيا')}`;

  document.getElementById('item-detail').innerHTML = `
    <div class="detail-hero">
      <div class="detail-avatar">${TYPE_EMOJI[item.type]||'🏥'}</div>
      <div class="detail-name">${item.name}</div>
      <div class="detail-spec">${item.specialty || TYPE_LABEL[item.type] || ''}</div>
      ${item.rating ? `<div class="detail-rating">★ ${item.rating} تقييم</div>` : ''}
    </div>

    <div class="big-actions">
      ${item.phone ? `<a class="big-btn call-big" href="tel:${item.phone}">📞<span>اتصال</span></a>` : ''}
      ${item.whatsapp ? `<a class="big-btn wa-big" href="https://wa.me/${item.whatsapp.replace(/\D/g,'')}?text=${waMsg}">💬<span>واتساب</span></a>` : ''}
      <a class="big-btn dir-big" href="${mapsUrl}" target="_blank">🗺️<span>الاتجاهات</span></a>
    </div>

    <div class="detail-section" style="margin-top:12px">
      <h4>معلومات</h4>
      ${item.address ? `<div class="detail-info-row">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
        ${item.address}
      </div>` : ''}
      ${item.hours ? `<div class="detail-info-row">
        <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        ${item.hours}
      </div>` : ''}
      ${item.notes ? `<div class="detail-info-row">
        <svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2"/></svg>
        ${item.notes}
      </div>` : ''}
    </div>

    ${item.service_list && item.service_list.length ? `
    <div class="detail-section">
      <h4>الخدمات</h4>
      <div class="tags-wrap">${item.service_list.map(s=>`<span class="tag">${s}</span>`).join('')}</div>
    </div>` : ''}

    ${item.tags && item.tags.length ? `
    <div class="detail-section">
      <h4>وسوم</h4>
      <div class="tags-wrap">${item.tags.map(t=>`<span class="tag">#${t}</span>`).join('')}</div>
    </div>` : ''}

    <div class="detail-section">
      <button onclick="toggleFavorite('${item.id}')" class="big-btn ${isFav ? 'call-big' : ''}" style="width:100%;flex-direction:row;justify-content:center;background:${isFav?'var(--gold)':'#f0f0ec'};color:${isFav?'#fff':'#555'}">
        ${isFav ? '⭐ إزالة من المفضلة' : '☆ إضافة للمفضلة'}
      </button>
    </div>
  `;

  route('item');
  location.hash = '#/item/' + item.id;
}

// ─── FAVORITES ────────────────────────────────────────────────────────────
window.toggleFavorite = function(id) {
  const idx = STATE.favorites.indexOf(id);
  if (idx === -1) STATE.favorites.push(id);
  else STATE.favorites.splice(idx, 1);
  localStorage.setItem('mh_fav', JSON.stringify(STATE.favorites));
  if (STATE.currentItem && STATE.currentItem.id === id) showItem(id);
};

function renderFavorites() {
  const list = document.getElementById('fav-list');
  const favItems = STATE.data.filter(x => STATE.favorites.includes(x.id));
  list.innerHTML = favItems.length
    ? favItems.map(renderCard).join('')
    : '<div class="empty-state"><div>⭐</div><p>لا توجد عناصر مفضلة بعد</p></div>';
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────
window.getUserLocation = function() {
  if (!navigator.geolocation) { showToast('الموقع غير مدعوم'); return; }
  showToast('⏳ جارٍ تحديد الموقع...');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      STATE.map.setView([lat, lng], 14);
      L.marker([lat, lng], {
        icon: L.divIcon({
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#2980b9;border:3px solid #fff;box-shadow:0 0 0 4px rgba(41,128,185,.3)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          className: '',
        })
      }).addTo(STATE.map).bindPopup('موقعك الحالي').openPopup();
      showToast('✅ تم تحديد موقعك');
    },
    () => showToast('⚠️ لم يتم السماح بالموقع — اختر المركز يدوياً')
  );
};

// ─── PANIC ────────────────────────────────────────────────────────────────
window.togglePanic = function() {
  document.getElementById('panic-modal').classList.toggle('hidden');
};
window.closePanicIfBg = function(e) {
  if (e.target.id === 'panic-modal') togglePanic();
};

// ─── ONLINE/OFFLINE ───────────────────────────────────────────────────────
function watchOnline() {
  window.addEventListener('offline', () => showToast('⚠️ لا يوجد إنترنت'));
  window.addEventListener('online', () => showToast('✅ تم استعادة الاتصال'));
}

// ─── TOAST ────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('offline-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ─── SERVICE WORKER ───────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  }
}

// ─── SAMPLE DATA (fallback) ───────────────────────────────────────────────
function getSampleData() {
  return [
    {id:'minya-doc-0001',type:'doctor',name:'د. أحمد علي',specialty:'باطنة',phone:'+20862230000',whatsapp:'+20101234567',address:'شارع النصر، مركز المنيا',lat:28.0833,lng:30.7500,hours:'8:00-20:00',service_list:['زيارات منزلية','استشارات سريعة'],tags:['ممتاز','قبول_تأمين'],rating:4.6,notes:'يوجد كشف بالتليفون',center:'minya',verified:false},
    {id:'minya-doc-0002',type:'doctor',name:'د. سمر محمد',specialty:'أطفال',phone:'+20862231111',whatsapp:'',address:'شارع الجمهورية، المنيا',lat:28.0850,lng:30.7520,hours:'9:00-17:00',service_list:['متابعة الأطفال','لقاحات'],tags:['موصى_بها'],rating:4.8,notes:'',center:'minya',verified:true},
    {id:'minya-pharm-0001',type:'pharmacy',name:'صيدلية النيل',specialty:'',phone:'+20862240000',whatsapp:'',address:'كورنيش النيل، المنيا',lat:28.0820,lng:30.7480,hours:'24 ساعة',service_list:['تحضير التركيبات','توصيل'],tags:['مفتوحة_24ساعة'],rating:4.3,notes:'',center:'minya',verified:false},
    {id:'minya-hosp-0001',type:'hospital',name:'مستشفى المنيا العام',specialty:'',phone:'+20862234455',whatsapp:'',address:'شارع محمد فريد، المنيا',lat:28.0900,lng:30.7550,hours:'24 ساعة',service_list:['طوارئ','عمليات','إقامة'],tags:['حكومي','طوارئ'],rating:3.9,notes:'يقبل التأمين الصحي',center:'minya',verified:true},
    {id:'minya-em-0001',type:'emergency_point',name:'مركز إسعاف المنيا',specialty:'طوارئ',phone:'123',whatsapp:'',address:'شارع النصر، المنيا',lat:28.0870,lng:30.7510,hours:'24 ساعة',service_list:['إسعاف سريع'],tags:['طوارئ'],rating:null,notes:'اتصل على 123',center:'minya',verified:true},
    {id:'minya-doc-0003',type:'doctor',name:'د. خالد إبراهيم',specialty:'عظام',phone:'+20862245678',whatsapp:'+20111234567',address:'ميدان النهضة، سمالوط',lat:28.3167,lng:30.7167,hours:'10:00-22:00',service_list:['جراحة عظام','علاج طبيعي'],tags:['خبرة_20سنة'],rating:4.7,notes:'',center:'samalout',verified:true},
    {id:'minya-pharm-0002',type:'pharmacy',name:'صيدلية الشفاء',specialty:'',phone:'+20862256789',whatsapp:'',address:'شارع الجمهورية، سمالوط',lat:28.3150,lng:30.7180,hours:'8:00-24:00',service_list:['أدوية مستوردة'],tags:[],rating:4.1,notes:'',center:'samalout',verified:false},
  ];
}
