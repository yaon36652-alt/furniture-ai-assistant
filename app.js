let products = [];
const legacyProductAliases = { sofa:'sofa-001', table:'table-001', lamp:'lamp-001', chair:'chair-003', rug:'rug-001', side:'storage-002', bed:'bed-001', bedside:'storage-001', vanity:'vanity-001', desk:'desk-001', 'study-desk':'desk-001', bookcase:'storage-003', 'dining-table':'dining-table-001', 'dining-chair':'chair-001', 'budget-lamp':'lamp-002' };
let selectedProductId = null;
let roomBackgroundDataUrl = '';
let previewMode = 'composite';
let previewComparisonPosition = 50;
let previewTransformsByRoom = { living:{}, bedroom:{}, study:{}, dining:{} };
const furnitureCategoryLabels = { sofa:'沙发', table:'桌几', lamp:'灯具', chair:'椅子', storage:'收纳', bed:'床', rug:'地毯', desk:'书桌', vanity:'梳妆台' };
const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"%3E%3Crect width="640" height="480" fill="%23f1f4f0"/%3E%3Cpath d="M205 310h230v35H205zM250 255h140v55H250z" fill="%23c7d4ca"/%3E%3Ctext x="320" y="395" text-anchor="middle" fill="%237b8b80" font-family="Arial" font-size="24"%3E图片加载中%3C/text%3E%3C/svg%3E';
function roomForFurniture(item){
  const declared=item?.room ?? item?.room_type ?? item?.roomType ?? item?.applicable_rooms ?? item?.applicableRooms;
  const declaredRooms=Array.isArray(declared) ? declared : declared ? [declared] : [];
  const normalizedDeclared=declaredRooms.map(normalizeRoomValue).filter(Boolean);
  if(normalizedDeclared.length)return normalizedDeclared[0];
  if (item.id.startsWith('bed-') || item.id.startsWith('vanity-')) return 'bedroom';
  if (item.id.startsWith('desk-')) return 'study';
  if (item.id === 'storage-003') return 'study';
  if (item.id === 'dining-table-001' || item.id === 'chair-001' || item.id === 'chair-002' || item.id === 'storage-004') return 'dining';
  return 'living';
}
function normalizeRoomValue(value){
  const raw=String(value ?? '').trim().toLowerCase();
  const aliases={living:'living','livingroom':'living','living_room':'living','客厅':'living',bedroom:'bedroom','bed_room':'bedroom','卧室':'bedroom',study:'study','studyroom':'study','study_room':'study','书房':'study',dining:'dining','diningroom':'dining','dining_room':'dining','餐厅':'dining'};
  return aliases[raw] || '';
}
function normalizeFurniture(item, index){
  const dimensions = item.dimensions || {};
  const delivery = item.delivery_constraints || {};
  const features = Array.isArray(item.features) ? item.features : [];
  const category = String(item.category || 'storage');
  const explicitRooms=item.applicable_rooms ?? item.applicableRooms ?? item.room_type ?? item.roomType ?? item.room;
  const applicableRooms=(Array.isArray(explicitRooms) ? explicitRooms : explicitRooms ? [explicitRooms] : [roomForFurniture(item)]).map(normalizeRoomValue).filter(Boolean);
  const room=applicableRooms[0] || roomForFurniture(item);
  return {
    ...item,
    room,
    applicableRooms: applicableRooms.length ? [...new Set(applicableRooms)] : [room],
    category: furnitureCategoryLabels[category] || category,
    categoryKey: category,
    detail: `${String(item.material || '').split(' / ')[0] || item.style} · ${features[0] || item.style}`,
    widthCm: Number(dimensions.length) || 0,
    entranceCm: Number(delivery.min_door_width) || 0,
    status: 'pass',
    statusText: '尺寸通过',
    match: `${Math.max(82, 96 - (index % 6) * 2)}%`,
    size: `${dimensions.length || 0} × ${dimensions.width || 0} × ${dimensions.height || 0} cm`,
    dimensions,
    delivery_constraints: delivery,
    features
  };
}
async function loadFurnitureCatalog(){
  try {
    const response = await fetch('/furniture_db.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const source = await response.json();
    if (!Array.isArray(source) || !source.length) throw new Error('家具数据库为空');
    products = source.map(normalizeFurniture);
    console.info(`[Furniture catalog] loaded ${products.length} items from furniture_db.json`);
  } catch (error) {
    console.error('[Furniture catalog] load failed:', error);
    // Do not manufacture or substitute product records: every card must come
    // from furniture_db.json. Rendering functions show an empty-state message
    // while the source file is unavailable and can be retried by refreshing.
    products = [];
    console.warn('[Furniture catalog] no local mock fallback is used; cards remain bound to furniture_db.json');
  }
}
function resolveProductId(id){ return legacyProductAliases[id] || id; }
function getFurnitureForCurrentRoom(){
  const currentRoom=normalizeRoomValue(activeRoom) || activeRoom;
  const filteredFurniture=products.filter(item=>{
    const applicable=Array.isArray(item.applicableRooms) && item.applicableRooms.length ? item.applicableRooms : [item.room];
    return applicable.map(normalizeRoomValue).includes(currentRoom);
  });
  const result=filteredFurniture.length >= 3 ? filteredFurniture : products.slice(0,6);
  console.log('当前空间:', currentRoom, '匹配到的家具:', filteredFurniture);
  if(filteredFurniture.length < 3)console.warn(`[Furniture catalog] ${currentRoom} only matched ${filteredFurniture.length} items; using ${result.length} fallback items`);
  return result;
}
const roomMeta = { living:{label:'客厅',title:'为你的客厅挑选。'}, bedroom:{label:'卧室',title:'为你的卧室挑选。'}, study:{label:'书房',title:'为你的书房挑选。'}, dining:{label:'餐厅',title:'为你的餐厅挑选。'} };
const defaultRoom = { length:420, width:280, doorWidth:82, height:275, household:3 };
let activeRoom = 'living';
let roomState = {...defaultRoom};
let shopping = [];
let favorites = [];
let roomStates = { living:{...defaultRoom}, bedroom:{...defaultRoom,length:360,width:270}, study:{...defaultRoom,length:320,width:240}, dining:{...defaultRoom,length:300,width:240} };
let shoppingByRoom = { living:[], bedroom:[], study:[], dining:[] };
let previewByRoom = { living:['sofa','table'], bedroom:['bed','vanity'], study:['desk-001'], dining:['dining-table','dining-chair'] };
let previewSelection = [...previewByRoom.living];
let activeCategory = '全部';
let sortDescending = true;

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
function money(value){ return '¥ ' + value.toLocaleString('zh-CN'); }
function toast(message){ const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }
function defaultPreviewTransform(index=0){ return { x:index===0 ? -16 : Math.min(28,index*22), y:index%2 ? 8 : 0, scale:1 }; }
function previewTransform(id,index=0){ return { ...defaultPreviewTransform(index), ...(previewTransformsByRoom[activeRoom]?.[id] || {}) }; }
function setPreviewTransform(id,patch){ if(!previewTransformsByRoom[activeRoom])previewTransformsByRoom[activeRoom]={}; previewTransformsByRoom[activeRoom][id]={...previewTransform(id),...patch}; }
function setPreviewBackground(dataUrl,label='已上传房间背景'){
  roomBackgroundDataUrl=dataUrl || '';
  const room=$('#preview-room');
  if(!room)return;
  room.classList.toggle('has-room-background',Boolean(roomBackgroundDataUrl));
  room.style.backgroundImage=roomBackgroundDataUrl ? `url("${roomBackgroundDataUrl}")` : '';
  room.style.backgroundSize=roomBackgroundDataUrl ? 'cover' : '';
  room.style.backgroundPosition=roomBackgroundDataUrl ? 'center' : '';
  const labelNode=$('#preview-background-label');
  if(labelNode)labelNode.textContent=roomBackgroundDataUrl ? label : '默认示意背景';
  syncPreviewComparisonBackground();
}
function resetPreviewBackground(){ setPreviewBackground(''); const input=$('#preview-background-input'); if(input)input.value=''; }
function readPreviewBackground(file){
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请上传 JPG、PNG 或 WebP 图片');return;}
  if(file.size>10*1024*1024){toast('图片不能超过 10MB');return;}
  const reader=new FileReader(); reader.onload=()=>setPreviewBackground(String(reader.result),`已上传：${file.name}`); reader.readAsDataURL(file);
}
function product(id){
  const resolved = resolveProductId(id);
  return products.find(item=>item.id===resolved);
}
function imageFallback(image){
  if(!image || image.dataset.fallbackApplied === 'true') return;
  image.dataset.fallbackApplied = 'true';
  const source = image.dataset.imageUrl || '';
  console.log('图片加载失败:', source);
  console.warn(`[Furniture image] failed to load: ${source}`);
  image.src = placeholderImage;
}
window.handleFurnitureImageError = imageFallback;
function furnitureImage(item, className='furniture-image'){
  const configuredSource = typeof item?.image_url === 'string' ? item.image_url.trim() : '';
  const source = configuredSource || placeholderImage;
  return `<img class="${className}" src="${source}" data-image-url="${configuredSource}" alt="${item.name}" loading="lazy" onerror="handleFurnitureImageError(this)">`;
}
function syncPreviewComparisonBackground(){
  const room=$('#preview-room');
  const before=$('#preview-comparison-before');
  if(!room || !before)return;
  const hasBackground=Boolean(roomBackgroundDataUrl);
  before.classList.toggle('has-room-background',hasBackground);
  before.classList.remove('room-living','room-bedroom','room-study','room-dining');
  before.classList.add(`room-${activeRoom}`);
  before.style.backgroundImage=hasBackground ? `url("${roomBackgroundDataUrl}")` : '';
  before.style.backgroundSize=hasBackground ? 'cover' : '';
  before.style.backgroundPosition=hasBackground ? 'center' : '';
}
function setPreviewComparisonPosition(value){
  previewComparisonPosition=Math.max(0,Math.min(100,Number(value)||0));
  const before=$('#preview-comparison-before');
  const divider=$('#preview-comparison-divider');
  const handle=$('#preview-comparison-handle');
  if(before)before.style.clipPath=`inset(0 0 0 ${previewComparisonPosition}%)`;
  if(divider)divider.style.setProperty('--comparison-position',`${previewComparisonPosition}%`);
  if(handle){handle.setAttribute('aria-valuenow',String(Math.round(previewComparisonPosition)));handle.style.setProperty('--comparison-position',`${previewComparisonPosition}%`);}
}
function startPreviewComparisonDrag(event,sourceHandle=event.currentTarget){
  if(event.pointerType==='mouse' && event.button!==0)return;
  const handle=sourceHandle;
  const comparison=$('#preview-comparison');
  if(!handle || !comparison)return;
  event.preventDefault();
  handle.setPointerCapture?.(event.pointerId);
  const move=moveEvent=>{const rect=comparison.getBoundingClientRect();if(!rect.width)return;setPreviewComparisonPosition((moveEvent.clientX-rect.left)/rect.width*100);};
  const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};
  handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  move(event);
}
function setPreviewMode(mode){
  const next=['composite','original','before-after'].includes(mode) ? mode : 'composite';
  previewMode=next;
  const room=$('#preview-room');
  if(!room)return;
  room.classList.toggle('original-mode',next==='original');
  room.classList.toggle('before-after-mode',next==='before-after');
  room.classList.toggle('composite-mode',next==='composite');
  $$('.control-btn').forEach(button=>button.classList.toggle('active',button.dataset.previewMode===next));
  const caption=$('#preview-room .preview-caption strong');
  if(caption)caption.textContent=next==='original' ? `${roomMeta[activeRoom].label} · 原始房间照片` : next==='before-after' ? 'Before / After 对比' : previewSelection.map(id=>product(id)?.name).filter(Boolean).join(' + ') || `${roomMeta[activeRoom].label} · 尚未选择家具`;
  syncPreviewComparisonBackground();
  setPreviewComparisonPosition(previewComparisonPosition);
}
function riskFor(item){
  const state = itemState(item);
  return { ...state, label: state.statusText, className: state.status };
}
function itemState(item){
  if(!item) return { status:'unknown', statusText:'信息不足' };
  if(item.widthCm > roomState.width || item.entranceCm > roomState.doorWidth + 6) return { status:'fail', statusText:item.widthCm > roomState.width ? '空间偏紧' : '无法入户' };
  if(item.entranceCm > roomState.doorWidth) return { status:'warn', statusText:'需确认入户' };
  return { status:item.status, statusText:item.statusText };
}
function currentItem(item){ return { ...item, ...itemState(item) }; }
function furnitureDimensions(item){
  const dimensions=item?.dimensions || {};
  return `${dimensions.length || 0} × ${dimensions.width || 0} × ${dimensions.height || 0} cm`;
}
function renderOverviewFeatured(){
  const host=$('#overview-featured');
  if(!host)return;
  const roomProducts=getFurnitureForCurrentRoom();
  const featured=roomProducts[0];
  const side=roomProducts.slice(1,3);
  if(!featured){ host.innerHTML='<div class="empty-list">当前空间暂无家具候选</div>'; return; }
  const featuredItem=currentItem(featured);
  host.innerHTML=`<article class="hero-product furniture-card ${selectedProductId===featuredItem.id?'is-selected':''}" data-select-furniture="${featuredItem.id}">
    <div class="hero-image furniture-image-wrap"><span class="ai-badge">✦ AI 精选</span><button class="heart hero-heart ${favorites.includes(featuredItem.id)?'is-favorite':''}" data-favorite="${featuredItem.id}" aria-label="收藏 ${featuredItem.name}">${favorites.includes(featuredItem.id)?'♥':'♡'}</button>${furnitureImage(featuredItem,'furniture-image hero-furniture-image')}<div class="hero-image-copy"><span>${featuredItem.category} · ${featuredItem.statusText}</span><strong>${featuredItem.name}</strong></div></div>
    <div class="hero-product-info"><div><h3>${featuredItem.name}</h3><p>${featuredItem.detail}</p></div><div class="hero-product-price"><strong>${money(featuredItem.price)}</strong><button class="add-btn hero-add-btn ${shopping.some(x=>x.id===featuredItem.id)?'is-added':''}" data-product="${featuredItem.id}" aria-label="${shopping.some(x=>x.id===featuredItem.id)?'从清单移除':'加入清单'} ${featuredItem.name}">${shopping.some(x=>x.id===featuredItem.id)?'✓':'+'}</button></div></div>
    <div class="hero-tags"><span class="tag green">✓ ${featuredItem.statusText}</span><span class="tag">${featuredItem.style}</span><span class="tag">${featuredItem.features[0] || '适合当前空间'}</span></div></article>
    <div class="side-products">${side.map(raw=>{const item=currentItem(raw);const isAdded=shopping.some(x=>x.id===item.id);return `<article class="mini-product furniture-card ${selectedProductId===item.id?'is-selected':''}" data-select-furniture="${item.id}"><div class="product-image furniture-image-wrap">${furnitureImage(item,'furniture-image mini-furniture-image')}<button class="heart" data-favorite="${item.id}" aria-label="收藏${item.name}">${favorites.includes(item.id)?'♥':'♡'}</button><span class="corner-label">${item.match} 匹配</span></div><div class="mini-info"><div><h3>${item.name}</h3><p>${money(item.price)} · ${item.style}</p></div><button class="add-btn ${isAdded?'is-added':''}" data-product="${item.id}" aria-label="${isAdded?'从清单移除':'加入'}${item.name}">${isAdded?'✓':'+'}</button></div></article>`;}).join('')}</div>`;
  host.querySelectorAll('[data-select-furniture]').forEach(card=>card.addEventListener('click',event=>{ if(event.target.closest('[data-favorite],[data-product]'))return; selectFurniture(card.dataset.selectFurniture); }));
  host.querySelectorAll('[data-product]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();toggleShopping(button.dataset.product);}));
  host.querySelectorAll('[data-favorite]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();toggleFavorite(button.dataset.favorite,button);}));
}
function renderSelectedProductPanel(){
  const panel=$('#selected-product-panel');
  if(!panel)return;
  const item=selectedProductId ? product(selectedProductId) : null;
  if(!item){ panel.hidden=true; panel.innerHTML=''; return; }
  const current=currentItem(item);
  panel.hidden=false;
  panel.innerHTML=`<div class="selected-product-media">${furnitureImage(current,'furniture-image selected-detail-image')}</div><div class="selected-product-copy"><span class="eyebrow">当前选中家具</span><h3>${current.name}</h3><p class="selected-product-meta">${current.category} · ${current.style} · ${money(current.price)}</p><div class="selected-product-specs"><span>尺寸<strong>${furnitureDimensions(current)}</strong></span><span>材质<strong>${current.material}</strong></span><span>入户<strong>${current.delivery_constraints?.min_door_width || 0} cm · ${current.delivery_constraints?.is_disassemblable?'可拆分':'不可拆分'}</strong></span></div><span class="status ${current.status}">${current.statusText}</span><button class="primary-btn" data-selected-preview="${current.id}">加入预览组合</button></div>`;
  panel.querySelector('[data-selected-preview]')?.addEventListener('click',()=>{if(!previewSelection.includes(current.id))previewSelection.push(current.id);saveState();renderPreviewSelection();updatePreviewScene();toast(`已将「${current.name}」加入预览`);});
}
function renderPreviewFurnitureLayer(){
  const layer=$('#preview-furniture-layer');
  if(!layer)return;
  const items=previewSelection.map(id=>product(id)).filter(Boolean);
  layer.innerHTML=items.map((item,index)=>{const transform=previewTransform(item.id,index);return `<button class="preview-furniture-item ${selectedProductId===item.id?'is-selected':''}" data-select-furniture="${item.id}" data-preview-furniture="${item.id}" style="--x:${transform.x}%;--y:${transform.y}%;--scale:${transform.scale};" aria-label="选中${item.name}">${furnitureImage(item,'furniture-image preview-furniture-image')}<span>${item.name}</span></button>`;}).join('');
  layer.querySelectorAll('[data-select-furniture]').forEach(button=>{
    button.addEventListener('click',()=>selectFurniture(button.dataset.selectFurniture,{keepView:true}));
    button.addEventListener('pointerdown',event=>startPreviewDrag(event,button,layer));
  });
  layer.onclick=event=>{
    if(event.target.closest('[data-preview-furniture]'))return;
    clearPreviewFurnitureSelection();
  };
}
function clearPreviewFurnitureSelection(){
  if(!selectedProductId)return;
  selectedProductId=null;
  renderSelectedProductPanel();
  renderPreviewSelection();
  renderPreviewFurnitureLayer();
  syncPreviewScaleControl();
}
function startPreviewDrag(event,button,layer){
  if(event.button !== 0)return;
  event.preventDefault();
  const id=button.dataset.previewFurniture;
  selectedProductId=id;
  renderSelectedProductPanel();
  syncPreviewScaleControl();
  const startX=event.clientX; const startY=event.clientY; const start=previewTransform(id);
  button.setPointerCapture?.(event.pointerId);
  const move=moveEvent=>{
    const rect=layer.getBoundingClientRect();
    const x=Math.max(-45,Math.min(45,start.x + (moveEvent.clientX-startX)/rect.width*100));
    const y=Math.max(-42,Math.min(42,start.y + (moveEvent.clientY-startY)/rect.height*100));
    setPreviewTransform(id,{x,y});
    button.style.setProperty('--x',`${x}%`); button.style.setProperty('--y',`${y}%`);
  };
  const end=()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',end);saveState();};
  button.addEventListener('pointermove',move); button.addEventListener('pointerup',end); button.addEventListener('pointercancel',end);
}
function updatePreviewScale(value){
  if(!selectedProductId)return;
  const scale=Math.max(.5,Math.min(1.6,Number(value)/100));
  setPreviewTransform(selectedProductId,{scale});
  const item=previewSelection.map(id=>product(id)).find(item=>item?.id===selectedProductId);
  if(item){
    const button=$(`#preview-furniture-layer [data-preview-furniture="${item.id}"]`);
    button?.style.setProperty('--scale',String(scale));
  }
  const output=$('#preview-scale-value'); if(output)output.value=`${Math.round(scale*100)}%`,output.textContent=`${Math.round(scale*100)}%`;
  saveState();
}
function syncPreviewScaleControl(){
  const input=$('#preview-scale'); const output=$('#preview-scale-value');
  const transform=selectedProductId ? previewTransform(selectedProductId) : {scale:1};
  if(input){input.disabled=!selectedProductId;input.value=Math.round(transform.scale*100);}
  if(output){output.value=`${Math.round(transform.scale*100)}%`;output.textContent=`${Math.round(transform.scale*100)}%`;}
}
function selectFurniture(id,{keepView=false}={}){
  const item=product(id);
  if(!item)return;
  selectedProductId=item.id;
  if(!previewSelection.includes(item.id))previewSelection.push(item.id);
  saveState();
  renderOverviewFeatured();
  renderSelectedProductPanel();
  renderPreviewFurnitureLayer();
  syncPreviewScaleControl();
  updatePreviewScene();
  if(!keepView && !$('#view-overview')?.classList.contains('active-view'))showView('overview');
  document.querySelectorAll('[data-furniture-id],[data-select-furniture]').forEach(node=>{const nodeId=node.dataset.furnitureId || node.dataset.selectFurniture;node.classList.toggle('is-selected',nodeId===item.id);});
}
function saveState(){
  roomStates[activeRoom]={...roomState};
  shoppingByRoom[activeRoom]=shopping.map(item=>item.id);
  previewByRoom[activeRoom]=[...previewSelection];
  localStorage.setItem('furniguide-rooms', JSON.stringify(roomStates));
  localStorage.setItem('furniguide-active-room', activeRoom);
  localStorage.setItem('furniguide-shopping-by-room', JSON.stringify(shoppingByRoom));
  localStorage.setItem('furniguide-preview-by-room', JSON.stringify(previewByRoom));
  localStorage.setItem('furniguide-preview-transforms', JSON.stringify(previewTransformsByRoom));
  // Keep the old key for backwards compatibility with an earlier MVP build.
  localStorage.setItem('furniguide-shopping', JSON.stringify(shopping.map(item=>item.id)));
  localStorage.setItem('furniguide-favorites',JSON.stringify(favorites));
}
function loadState(){
  try {
    const storedRooms=JSON.parse(localStorage.getItem('furniguide-rooms')||'null');
    const storedActive=localStorage.getItem('furniguide-active-room');
    const storedShopping=JSON.parse(localStorage.getItem('furniguide-shopping')||'[]');
    const storedShoppingByRoom=JSON.parse(localStorage.getItem('furniguide-shopping-by-room')||'null');
    const storedPreviewByRoom=JSON.parse(localStorage.getItem('furniguide-preview-by-room')||'null');
    const storedPreviewTransforms=JSON.parse(localStorage.getItem('furniguide-preview-transforms')||'null');
    const storedFavorites=JSON.parse(localStorage.getItem('furniguide-favorites')||'[]');
    if(storedRooms) roomStates={...roomStates,...storedRooms};
    if(storedShoppingByRoom) shoppingByRoom={...shoppingByRoom,...storedShoppingByRoom};
    else if(Array.isArray(storedShopping)) shoppingByRoom.living=storedShopping;
    if(storedPreviewByRoom) previewByRoom={...previewByRoom,...storedPreviewByRoom};
    if(storedPreviewTransforms) previewTransformsByRoom={...previewTransformsByRoom,...storedPreviewTransforms};
    // Migrate saved legacy room assignments when a furniture item's catalog room changes.
    const migratedShopping={ living:[], bedroom:[], study:[], dining:[] };
    for(const [room, ids] of Object.entries(shoppingByRoom)) for(const id of Array.isArray(ids) ? ids : []){
      const item=product(id); const target=item?.room || room;
      if(item && !migratedShopping[target])migratedShopping[target]=[];
      if(item && !migratedShopping[target].includes(item.id))migratedShopping[target].push(item.id);
    }
    shoppingByRoom=migratedShopping;
    const migratedPreview={ living:[], bedroom:[], study:[], dining:[] };
    for(const [room, ids] of Object.entries(previewByRoom)) for(const id of Array.isArray(ids) ? ids : []){
      const item=product(id); const target=item?.room || room;
      if(item && !migratedPreview[target])migratedPreview[target]=[];
      if(item && !migratedPreview[target].includes(item.id))migratedPreview[target].push(item.id);
    }
    previewByRoom=migratedPreview;
    if(storedActive && roomMeta[storedActive]) activeRoom=storedActive;
    roomState={...defaultRoom,...roomStates[activeRoom]};
    shopping=(shoppingByRoom[activeRoom]||[]).map(id=>product(id)).filter(Boolean);
    previewSelection=(previewByRoom[activeRoom]||[]).map(id=>product(id)).filter(Boolean).map(item=>item.id);
    if(Array.isArray(storedFavorites)) favorites=storedFavorites;
  } catch { activeRoom='living'; roomState={...defaultRoom}; shopping=[]; previewSelection=['sofa','table']; favorites=[]; }
}

function renderRecommendations(){
  const roomProducts=getFurnitureForCurrentRoom();
  const categories=[...new Set(roomProducts.map(item=>item.category))];
  if(activeCategory!=='全部' && !categories.includes(activeCategory)) activeCategory='全部';
  $('#category-filters').innerHTML=[`<button class="filter-pill ${activeCategory==='全部'?'active':''}" data-category="全部">全部 <span>${roomProducts.length}</span></button>`,...categories.map(category=>`<button class="filter-pill ${activeCategory===category?'active':''}" data-category="${category}">${category} <span>${roomProducts.filter(item=>item.category===category).length}</span></button>`)].join('');
  $$('.filter-pill').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.category;renderRecommendations();}));
  const visible = roomProducts.filter(item=>activeCategory==='全部'||item.category===activeCategory).sort((a,b)=>sortDescending?parseInt(b.match)-parseInt(a.match):a.price-b.price);
  $('#recommendation-eyebrow').textContent=roomProducts.length ? `推荐清单 · ${roomProducts.length} 件候选` : '推荐清单 · 数据暂不可用';
  $('#recommendation-heading').textContent=roomMeta[activeRoom].title;
  $('#overview-recommendation-sub').textContent=`基于你的${roomMeta[activeRoom].label}空间、尺寸和家庭人数偏好`;
  $('#recommend-grid').innerHTML = visible.length ? visible.map(raw=>{const item=currentItem(raw);return `<article class="recommend-card furniture-card ${selectedProductId===item.id?'is-selected':''}" data-select-furniture="${item.id}" data-furniture-id="${item.id}"><div class="recommend-image furniture-image-wrap">${furnitureImage(item,'furniture-image recommend-furniture-image')}<button class="heart ${favorites.includes(item.id)?'is-favorite':''}" data-favorite="${item.id}" aria-label="收藏 ${item.name}">${favorites.includes(item.id)?'♥':'♡'}</button><span class="corner-label">${item.match} 匹配</span></div><div class="recommend-info"><h3>${item.name}</h3><p>${item.detail} · ${furnitureDimensions(item)}</p><div class="recommend-footer"><div><strong class="recommend-price">${money(item.price)}</strong><span class="status ${item.status}">${item.statusText}</span></div><div class="card-actions"><button class="preview-card" data-preview-product="${item.id}">预览</button><button class="add-card" data-product="${item.id}">${shopping.some(x=>x.id===item.id)?'已在清单':'加入清单 +'}</button></div></div></div></article>`;}).join('') : '<div class="empty-list">家具数据库暂时无法加载<br><small>请检查 /furniture_db.json 后刷新页面</small></div>';
  $$('#recommend-grid [data-select-furniture]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('button'))return;selectFurniture(card.dataset.selectFurniture);}));
  $$('.add-card').forEach(btn=>btn.addEventListener('click',()=>toggleShopping(btn.dataset.product)));
  $$('.preview-card').forEach(btn=>btn.addEventListener('click',()=>{if(!previewSelection.includes(btn.dataset.previewProduct))previewSelection.push(btn.dataset.previewProduct);renderPreviewSelection();showView('preview');}));
  $$('#recommend-grid [data-favorite]').forEach(btn=>btn.addEventListener('click',()=>toggleFavorite(btn.dataset.favorite,btn)));
}
function updateBudget(){
  const total=shopping.reduce((sum,item)=>sum+item.price,0); const remaining=12000-total; const count=shopping.length;
  $('#budget-total').textContent=money(total); $('#budget-subtotal').textContent=money(total); $('#budget-remaining').textContent=money(Math.max(0,remaining)); $('#budget-progress-bar').style.width=Math.min(100,total/12000*100)+'%'; $('#list-count').textContent=`${count} 件家具`; $('#nav-count').textContent=count; $('#metric-budget').textContent=money(total||8460); $('#metric-risk').innerHTML=`${shopping.filter(item=>item.status!=='pass').length||1} <em>/ ${Math.max(6,count)} 件</em>`; $('#shopping-room-title').textContent=`${roomMeta[activeRoom].label}方案 A`;
  const checkout=$('#checkout-plan');
  if(checkout){checkout.disabled=count===0;checkout.setAttribute('aria-disabled',String(count===0));}
}
function checkoutPlan(){
  if(!shopping.length){toast('请先添加家具到清单');return;}
  const payload={items:shopping.map(item=>({sku:item.id,name:item.name,price:item.price})),total:shopping.reduce((sum,item)=>sum+item.price,0)};
  console.info('[FurniGuide checkout] 软装采购清单已生成',payload);
  toast('已生成软装采购清单！一键下单与第三方电商渠道对接功能开发中...');
}
function renderShopping(){
  const container=$('#shopping-items');
  if(!shopping.length){ container.innerHTML='<div class="empty-list">还没有加入家具<br><button class="text-btn" data-view-jump="recommendations">去推荐清单看看 →</button></div>'; }
  else { container.innerHTML=shopping.map(raw=>{const item=currentItem(raw);return `<div class="shopping-item furniture-card ${selectedProductId===item.id?'is-selected':''}" data-furniture-id="${item.id}" data-select-furniture="${item.id}">${furnitureImage(item,'furniture-image shopping-furniture-image')}<div class="shopping-item-info"><strong>${item.name}</strong><small>${item.detail} · <span class="status ${item.status}">${item.statusText}</span></small><small>${furnitureDimensions(item)} · ${money(item.price)}</small></div><button class="remove" data-remove="${item.id}" aria-label="移除${item.name}">×</button></div>`}).join(''); $$('.remove').forEach(btn=>btn.addEventListener('click',event=>{event.stopPropagation();toggleShopping(btn.dataset.remove)})); $$('#shopping-items [data-select-furniture]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('[data-remove]'))return;selectFurniture(card.dataset.selectFurniture);}));
  }
  $$('[data-view-jump]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.viewJump)));
  updateBudget();
}
function toggleShopping(id){ const item=product(id); if(!item)return; const exists=shopping.some(x=>x.id===item.id); shopping=exists?shopping.filter(x=>x.id!==item.id):[...shopping,item]; if(exists && selectedProductId===item.id)selectedProductId=null; else if(!exists)selectFurniture(item.id,{keepView:true}); saveState(); renderRecommendations(); renderShopping(); renderOverviewFeatured(); renderSelectedProductPanel(); toast(exists?`已从清单移除「${item.name}」`:`已加入「${item.name}」`); }
function toggleFavorite(id,button){favorites=favorites.includes(id)?favorites.filter(item=>item!==id):[...favorites,id];saveState();const active=favorites.includes(id);if(button){button.textContent=active?'♥':'♡';button.classList.toggle('is-favorite',active);}toast(active?'已加入收藏':'已取消收藏');}
function renderPreviewSelection(){
  const items=previewSelection.map(id=>product(id)).filter(Boolean);
  $('#selected-items').innerHTML=items.length ? items.map(item=>`<div class="selected-item furniture-card ${selectedProductId===item.id?'is-selected':''}" data-furniture-id="${item.id}" data-select-furniture="${item.id}">${furnitureImage(item,'furniture-image selected-furniture-image')}<div><strong>${item.name}</strong><small>${item.detail} · ${money(item.price)}</small></div><button class="remove" data-preview-remove="${item.id}">×</button></div>`).join('') : '<div class="empty-list compact-empty">先从推荐清单选择家具</div>';
  $$('#selected-items [data-select-furniture]').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('[data-preview-remove]'))return;selectFurniture(card.dataset.selectFurniture,{keepView:true});}));
  $$('#selected-items [data-preview-remove]').forEach(btn=>btn.addEventListener('click',()=>{previewSelection=previewSelection.filter(id=>id!==btn.dataset.previewRemove);if(selectedProductId===btn.dataset.previewRemove)selectedProductId=null;saveState();renderPreviewSelection();updatePreviewScene();renderSelectedProductPanel();}));
  syncPreviewScaleControl();
  updatePreviewScene();
}
function updatePreviewScene(){
  const room=$('#preview-room');
  if(!room)return;
  room.classList.remove('room-living','room-bedroom','room-study','room-dining');
  room.classList.add(`room-${activeRoom}`);
  const items=previewSelection.map(id=>product(id)).filter(Boolean);
  room.classList.toggle('has-furniture-overlays',items.length>0);
  const names=items.map(item=>item.name);
  const caption=room.querySelector('.preview-caption strong');
  if(caption) caption.textContent=names.length ? names.join(' + ') : `${roomMeta[activeRoom].label} · 尚未选择家具`;
  renderPreviewFurnitureLayer();
  syncPreviewScaleControl();
  syncPreviewComparisonBackground();
  setPreviewMode(previewMode);
}
function showView(name){ $$('.view').forEach(view=>view.classList.remove('active-view')); const target=$(`#view-${name}`); if(target) target.classList.add('active-view'); $$('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===name)); window.scrollTo({top:0,behavior:'smooth'}); if(name==='shopping')renderShopping(); if(name==='preview')renderPreviewSelection(); }
function chatRecommendationItems(answer=''){
  const query=String(answer).replace(/\s/g,'');
  if(query.includes('奶油风') && query.includes('床')){
    const creamBeds=products.filter(item=>item.style==='奶油风' && item.categoryKey==='bed');
    if(creamBeds.length)return creamBeds.slice(0,3);
  }
  const mentioned=products.filter(item=>answer.includes(item.name));
  return (mentioned.length ? mentioned : getFurnitureForCurrentRoom()).slice(0,3);
}
function renderChatRecommendations(content,answer,query=''){
  const items=chatRecommendationItems(`${query}\n${answer}`);
  if(!items.length)return;
  const wrap=document.createElement('div');
  wrap.className='chat-recommendations';
  wrap.innerHTML=items.map(item=>`<div class="chat-furniture-card"><button class="chat-furniture-select" type="button" data-select-furniture="${item.id}" aria-label="查看${item.name}详情">${furnitureImage(item,'furniture-image chat-furniture-image')}<span><strong>${item.name}</strong><small>${money(item.price)} · ${furnitureDimensions(item)}</small></span></button><button class="chat-furniture-add ${shopping.some(entry=>entry.id===item.id)?'is-added':''}" type="button" data-product="${item.id}" aria-label="${shopping.some(entry=>entry.id===item.id)?'从清单移除':'加入清单'} ${item.name}">${shopping.some(entry=>entry.id===item.id)?'✓':'+'}</button></div>`).join('');
  wrap.querySelectorAll('[data-select-furniture]').forEach(button=>button.addEventListener('click',()=>selectFurniture(button.dataset.selectFurniture)));
  wrap.querySelectorAll('[data-product]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();toggleShopping(button.dataset.product);}));
  content.appendChild(wrap);
}
function escapeChatHtml(value){ return String(value).replace(/[&<>\"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&#92;','"':'&quot;'}[character])); }
function renderAssistantMarkdown(value){
  const escaped=escapeChatHtml(value).replace(/\r\n?/g,'\n').trim();
  const lines=escaped.split('\n');
  const output=[]; let list=[];
  const flushList=()=>{ if(list.length){ output.push(`<ul>${list.map(item=>`<li>${item}</li>`).join('')}</ul>`); list=[]; } };
  lines.forEach(line=>{
    const trimmed=line.trim();
    if(!trimmed){ flushList(); return; }
    const bullet=trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if(bullet){ list.push(bullet[1]); return; }
    flushList();
    const formatted=trimmed.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/__(.+?)__/g,'<strong>$1</strong>');
    output.push(`<p>${formatted}</p>`);
  });
  flushList();
  return output.join('');
}
 function scrollChatToBottom(behavior='smooth'){
   const box=$('#chat-messages');
   if(!box)return;
   requestAnimationFrame(()=>box.scrollTo({top:box.scrollHeight,behavior}));
 }
function addChatMessage(text, isUser=false, pending=false, recommendationQuery='', withRecommendations=true){ const box=$('#chat-messages'); const message=document.createElement('div'); message.className=`message ${isUser?'user':'ai'}${pending?' pending':''}${!withRecommendations&&!isUser?' error-message':''}`; if(isUser){const bubble=document.createElement('div');bubble.className='user-bubble';bubble.textContent=text;message.appendChild(bubble);}else{const avatar=document.createElement('span');avatar.className='bot-avatar';avatar.textContent='✦';const content=document.createElement('div');content.className='assistant-content';content.setAttribute('aria-live','polite');content.innerHTML=renderAssistantMarkdown(text);if(!pending&&withRecommendations)renderChatRecommendations(content,text,recommendationQuery);message.append(avatar,content);} box.appendChild(message); scrollChatToBottom(); return message; }
function replaceWithBudgetLamp(){
  const budgetLamp=product('lamp-002');
  if(!budgetLamp)return;
  const lampIndex=shopping.findIndex(item=>item.id==='lamp-001');
  if(lampIndex>=0) shopping.splice(lampIndex,1,budgetLamp);
  else if(!shopping.some(item=>item.id===budgetLamp.id)) shopping.push(budgetLamp);
  saveState(); renderRecommendations(); renderShopping();
}

function roomContext(){
  return {
    roomType:activeRoom,
    roomName:roomMeta[activeRoom].label,
    dimensions:roomState,
    household:roomState.household,
    budget:{limit:12000,spent:shopping.reduce((sum,item)=>sum+item.price,0),remaining:Math.max(0,12000-shopping.reduce((sum,item)=>sum+item.price,0))},
    shopping:shopping.map(item=>({id:item.id,name:item.name,price:item.price,category:item.category,categoryKey:item.categoryKey,style:item.style,features:item.features,size:item.size,status:item.statusText})),
    recommendations:getFurnitureForCurrentRoom().map(item=>({id:item.id,name:item.name,price:item.price,category:item.category,categoryKey:item.categoryKey,style:item.style,features:item.features,size:item.size,status:item.statusText}))
  };
}
async function askAssistant(text){
  let response;
  try { response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,context:roomContext()}),signal:AbortSignal.timeout(65000)}); }
  catch(error){throw new Error(error.name==='TimeoutError'?'导购服务响应超时，请稍后重试。':'无法连接导购后端。请运行 npm run dev，并通过该服务地址打开页面。');}
  const result=await response.json().catch(()=>{throw new Error('当前网页服务没有提供聊天接口，请通过 Node 服务地址打开页面。');});
  if(!response.ok) throw new Error([result.message, result.detail].filter(Boolean).join(' ' )||`导购服务请求失败（HTTP ${response.status}）`);
  if(typeof result.answer!=='string'||!result.answer.trim())throw new Error('导购服务未返回有效回答，请稍后重试。');
  return result;
}
function setRoom(roomId){
  if(!roomMeta[roomId]||roomId===activeRoom)return;
  roomStates[activeRoom]={...roomState}; shoppingByRoom[activeRoom]=shopping.map(item=>item.id); previewByRoom[activeRoom]=[...previewSelection];
  activeRoom=roomId; roomState={...defaultRoom,...roomStates[activeRoom]};
  shopping=(shoppingByRoom[activeRoom]||[]).map(id=>product(id)).filter(Boolean);
  previewSelection=(previewByRoom[activeRoom]||[]).map(id=>product(id)).filter(Boolean).map(item=>item.id);
  activeCategory='全部';
  selectedProductId=null;
  $('#room-select').value=activeRoom; $('#room-summary-title').textContent=`林野公寓 · ${roomMeta[activeRoom].label}`; $('#chat-room-context').textContent=`正在参考：林野公寓 · ${roomMeta[activeRoom].label}`; $('#room-length').value=roomState.length; $('#room-width').value=roomState.width; $('#room-door').value=roomState.doorWidth; $('#room-height').value=roomState.height; $('#household-size').value=roomState.household; $('#room-household-summary').textContent=`${roomState.household} 口人`; renderRecommendations(); renderShopping(); renderOverviewFeatured(); renderSelectedProductPanel(); renderPreviewSelection(); saveState(); toast(`已切换到${roomMeta[activeRoom].label}`);
}

async function initializeApp(){
  if (initializeApp.started) return;
  initializeApp.started = true;
  await loadFurnitureCatalog();
  renderRecommendations(); renderShopping(); renderPreviewSelection(); renderOverviewFeatured();
  $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{showView(btn.dataset.view); $('.sidebar')?.classList.remove('open');}));
  $$('[data-view-jump]').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.viewJump)));
  $('#mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
  $('#chat-fab').addEventListener('click',()=>{ $('#chat-panel').style.display='flex'; scrollChatToBottom('auto'); }); $('#close-chat').addEventListener('click',()=>$('#chat-panel').style.display='none');
  loadState();
  selectedProductId=null;
  renderRecommendations(); renderShopping(); renderOverviewFeatured(); renderSelectedProductPanel(); renderPreviewSelection();
  $('#room-select').value=activeRoom; $('#room-summary-title').textContent=`林野公寓 · ${roomMeta[activeRoom].label}`; $('#chat-room-context').textContent=`正在参考：林野公寓 · ${roomMeta[activeRoom].label}`; $('#room-length').value=roomState.length; $('#room-width').value=roomState.width; $('#room-door').value=roomState.doorWidth; $('#room-height').value=roomState.height; $('#household-size').value=roomState.household; $('#room-select').addEventListener('change',event=>setRoom(event.target.value));
  // Overview cards are rendered from furniture_db.json and bind their own actions.
  const sendAssistantMessage=async text=>{addChatMessage(text,true);const pending=addChatMessage('正在结合房间和选购清单为你整理建议…',false,true);try{const result=await askAssistant(text);pending.remove();scrollChatToBottom();if(result.action?.type==='replace_budget_lamp')replaceWithBudgetLamp();addChatMessage(result.answer,false,false,text);if(result.mode==='fallback')toast('当前未配置大模型，已使用本地上下文回复');}catch(error){pending.remove();scrollChatToBottom();addChatMessage(error.message||'暂时无法连接导购服务。请确认本地服务已启动，稍后重试。',false,false,'',false);}};
  $('#chat-form').addEventListener('submit',e=>{e.preventDefault();const input=$('#chat-input');if(!input.value.trim())return;const text=input.value.trim();input.value='';sendAssistantMessage(text);});
  const quickPromptTexts=[
    '推荐几款适合小户型的奶油风床',
    '客厅预算还剩 5000 元，有推荐的原木风组合吗？',
    '有适合养猫/耐磨防刮且方便清洁的款式吗？'
  ];
  $$('.quick-prompts button').forEach((btn,index)=>{if(quickPromptTexts[index])btn.textContent=quickPromptTexts[index];btn.addEventListener('click',()=>sendAssistantMessage(btn.textContent));});
  $('#generate-preview').addEventListener('click',async()=>{
    const button=$('#generate-preview');
    if(!previewSelection.length){toast('请先选择至少一件家具');showView('recommendations');return;}
    button.disabled=true;button.textContent='生成中…';
    try {
      const response=await fetch('/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:roomContext(),selection:previewSelection})});
      if(!response.ok) throw new Error('preview_failed');
      const result=await response.json();
      updatePreviewScene();
      toast(result.message||'实景预览已更新');
    } catch { toast('预览服务暂时不可用，请稍后重试'); }
    finally { button.disabled=false;button.innerHTML='✦ 生成新的实景预览'; }
  });
  $('#clear-preview').addEventListener('click',()=>{previewSelection=[];selectedProductId=null;saveState();renderPreviewSelection();renderSelectedProductPanel();updatePreviewScene();toast('已清空预览组合');});
  $('#checkout-plan')?.addEventListener('click',checkoutPlan);
  $('#save-room').addEventListener('click',()=>{roomState={...roomState,length:Number($('#room-length').value)||defaultRoom.length,width:Number($('#room-width').value)||defaultRoom.width,doorWidth:Number($('#room-door').value)||defaultRoom.doorWidth,height:Number($('#room-height').value)||defaultRoom.height,household:Math.min(20,Math.max(1,Number($('#household-size').value)||defaultRoom.household))};$('#household-size').value=roomState.household;saveState();renderRecommendations();renderShopping();renderOverviewFeatured();renderSelectedProductPanel();$('#room-household-summary').textContent=`${roomState.household} 口人`;toast('空间信息已保存，推荐会同步更新');});
  $('#room-length').value=roomState.length; $('#room-width').value=roomState.width;
  $('#refresh-recs').addEventListener('click',e=>{e.currentTarget.textContent='生成中…';setTimeout(()=>{e.currentTarget.textContent='✦ 重新生成';toast('已根据最新偏好更新推荐');},900);});
  $$('.choice').forEach(btn=>btn.addEventListener('click',()=>{btn.parentElement.querySelectorAll('.choice').forEach(x=>x.classList.remove('active'));btn.classList.add('active');}));
  $$('.filter-pill').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.category;$$('.filter-pill').forEach(x=>x.classList.toggle('active',x===btn));renderRecommendations();}));
  $('#sort-recs').addEventListener('click',()=>{sortDescending=!sortDescending;$('#sort-recs').textContent=sortDescending?'匹配度最高⌄':'价格从低到高⌄';renderRecommendations();});
  $('#upload-zone').addEventListener('click',()=>$('#room-photo').click());
  $('#room-photo').addEventListener('click',event=>event.stopPropagation());
  const showRoomPhoto=file=>{if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('请上传 JPG、PNG 或 WebP 图片');return;}if(file.size>10*1024*1024){toast('图片不能超过 10MB');return;}const reader=new FileReader();reader.onload=()=>{$('#upload-zone').style.backgroundImage=`linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.35)),url('${reader.result}')`;$('#upload-zone').style.backgroundSize='cover';$('#upload-zone').style.backgroundPosition='center';$('#upload-zone').querySelector('strong').textContent=file.name;$('#upload-zone').querySelector('small').textContent='照片仅在本机预览，刷新后需重新选择';setPreviewBackground(String(reader.result),`已上传：${file.name}`);toast('房间照片已载入预览');};reader.readAsDataURL(file);};
  $('#room-photo').addEventListener('change',event=>showRoomPhoto(event.target.files?.[0]));
  const uploadZone=$('#upload-zone');uploadZone.addEventListener('dragover',event=>{event.preventDefault();uploadZone.classList.add('drag-over');});uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('drag-over'));uploadZone.addEventListener('drop',event=>{event.preventDefault();uploadZone.classList.remove('drag-over');showRoomPhoto(event.dataTransfer.files?.[0]);});
  $('#choose-preview-background').addEventListener('click',()=>$('#preview-background-input').click());
  $('#preview-background-input').addEventListener('change',event=>readPreviewBackground(event.target.files?.[0]));
  $('#reset-preview-background').addEventListener('click',()=>{resetPreviewBackground();toast('已恢复默认示意背景');});
  $('#preview-scale').addEventListener('input',event=>updatePreviewScale(event.target.value));
  $$('.control-btn').forEach(btn=>btn.addEventListener('click',()=>setPreviewMode(btn.dataset.previewMode)));
  $('#preview-comparison-handle')?.addEventListener('pointerdown',event=>startPreviewComparisonDrag(event));
  $('#preview-comparison')?.addEventListener('pointerdown',event=>{if(event.target.closest('#preview-comparison-handle'))return;startPreviewComparisonDrag(event,$('#preview-comparison-handle'));});
  $('#preview-room')?.addEventListener('click',event=>{
    if(event.target.closest('[data-preview-furniture],#preview-comparison'))return;
    clearPreviewFurnitureSelection();
  });
  setPreviewMode(previewMode);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
else initializeApp();
