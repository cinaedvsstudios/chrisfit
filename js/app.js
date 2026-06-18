const CONFIG = {
  version: 'v3.6',
  apiBaseUrl: 'https://script.google.com/macros/s/AKfycbwiM61R-bfvWbbkciZBDYorbx9F3hgOXU85f5lyuC78kB1zJe1B4MmmHLw6eVk-XDeS/exec',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1gJpbr_PZXUoU3smlli7DsJPWUJurqCOZxWb8Ui15YqA/edit',
  repoUrl: 'https://github.com/cinaedvsstudios/actarium',
  liveUrl: 'https://cinaedvsstudios.github.io/actarium/',
  chrisFitUrl: 'https://cinaedvsstudios.github.io/chrisfit/',
  viaticumUrl: 'https://cinaedvsstudios.github.io/Viaticum/',
  themeKey: 'actarium.theme.v1'
};

const state = {
  view: 'today',
  selectedDate: iso(new Date()),
  filter: 'all',
  selected: new Set(),
  theme: localStorage.getItem(CONFIG.themeKey) || 'dark',
  appsOpen: false,
  modal: null,
  connection: 'Loading…',
  data: { tasks: [], reminders: [], apps: [], appFeed: [], viaticumEvents: [], schedule: [] }
};

document.documentElement.dataset.theme = state.theme;
const root = document.getElementById('app');
init();

async function init() {
  render();
  try {
    state.data = normalise(await loadBootstrap());
    state.connection = 'Live Sheet connection';
  } catch (error) {
    console.warn('Actarium backend unavailable:', error);
    state.data = demo();
    state.connection = 'Demo / local view';
  }
  render();
}

async function loadBootstrap() {
  const url = new URL(CONFIG.apiBaseUrl);
  url.searchParams.set('action', 'bootstrap');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.success === false) throw new Error(payload.error || 'Backend rejected request');
  return payload;
}

async function post(action, body) {
  const response = await fetch(CONFIG.apiBaseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
  });
  if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
  return response.json();
}

function normalise(payload) {
  const routine = (payload.routine || []).flatMap(row => ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
    .map((day, index) => row[day] ? ({ title: row[day], emoji: row.emoji || (index < 5 ? '💼' : '🌙'), days: day.slice(0,3) }) : null)
    .filter(Boolean));
  return {
    tasks: (payload.tasks || []).map(task),
    reminders: (payload.reminders || []).map(task),
    apps: (payload.apps || []).map(app).filter(item => /^active$/i.test(item.status)).sort((a, b) => a.sortOrder - b.sortOrder),
    appFeed: (payload.appFeed || payload.app_feed || []).map(row => ({ sourceApp: val(row, 'sourceApp', 'source_app', 'source'), payload: val(row, 'payload', 'payload_json') })),
    viaticumEvents: (payload.viaticumEvents || payload.viaticum_events || []).map(viaticum),
    schedule: routine.concat((payload.schedule || []).map(row => ({ title: val(row, 'title') || 'Scheduled item', emoji: val(row, 'emoji') || '🗓️', days: val(row, 'days'), status: val(row, 'status') || 'Active' })))
  };
}

function task(row, index = 0) {
  const due = date(val(row, 'dueDate', 'due_date', 'startDate', 'start_date', 'date') || state.selectedDate);
  const start = date(val(row, 'startDate', 'start_date', 'dueDate', 'due_date', 'date') || due);
  const end = date(val(row, 'endDate', 'end_date', 'dueDate', 'due_date', 'date') || due);
  const combined = `${val(row, 'project', 'area')} ${val(row, 'source')} ${val(row, 'title')} ${val(row, 'notes')}`;
  return {
    id: val(row, 'id') || `TASK-${index + 1}`,
    title: val(row, 'title') || 'Untitled task',
    project: val(row, 'project', 'area') || 'General',
    source: val(row, 'source') || 'Actarium',
    status: val(row, 'status') || 'Not started',
    priority: val(row, 'priority') || 'Normal',
    startDate: start,
    endDate: end,
    dueDate: due,
    recurrence: val(row, 'recurrence') || 'None',
    repeatUntil: date(val(row, 'repeatUntil', 'repeat_until')),
    completedAt: val(row, 'completedAt', 'completed_at'),
    notes: val(row, 'notes'),
    link: val(row, 'link'),
    taskType: val(row, 'taskType', 'task_type') || (/work|zalando|nike|office/i.test(combined) ? 'Work' : 'Personal')
  };
}

function app(row, index = 0) {
  const label = val(row, 'label') || 'Link';
  const metadata = `${label} ${val(row, 'notes')}`.toLowerCase();
  return {
    id: val(row, 'id') || `APP-${index + 1}`,
    label,
    emoji: val(row, 'emoji') || '🔗',
    url: val(row, 'url'),
    githubUrl: val(row, 'githubUrl', 'github_url'),
    notes: val(row, 'notes'),
    status: val(row, 'status') || 'Active',
    sortOrder: Number(val(row, 'sortOrder', 'sort_order') || 999),
    group: val(row, 'group') || (/n26|paypal|drive|gmail|github|netlify/.test(metadata) ? 'Admin links' : /actarium|chrisfit|viaticum|artifex|onda|organon/.test(metadata) ? 'My apps' : 'Creative links')
  };
}

function viaticum(row) {
  return {
    date: date(val(row, 'date', 'RealDate')),
    status: val(row, 'status', 'Status') || 'Unsure',
    statusEmoji: val(row, 'statusEmoji', 'status_emoji') || '🤔',
    location: val(row, 'location', 'Location'),
    locationEmoji: val(row, 'locationEmoji', 'location_emoji') || '📍',
    event: val(row, 'event', 'Event'),
    eventEmoji: val(row, 'eventEmoji', 'event_emoji') || '🎒',
    schedule: val(row, 'schedule', 'Schedule'),
    details: val(row, 'details', 'Details'),
    tripName: val(row, 'tripname', 'tripName')
  };
}

function render() {
  root.innerHTML = '';
  const shell = el('main', 'app-shell');
  shell.append(renderHeader(), renderPage());
  root.append(shell);
  if (state.modal) root.append(renderModal());
}

function renderHeader() {
  const header = el('header', 'top-bar');
  const card = el('section', 'day-card');
  card.innerHTML = `
    <div class="header-top">
      <div class="brand"><img class="logo" src="icon.png" alt="Actarium"><span class="brand-name">ACTARIUM</span><span class="version">${CONFIG.version}</span></div>
      <div class="utility"></div>
    </div>
    <nav class="nav-row"></nav>
    <div class="date-area">
      <p class="eyebrow">${esc(state.view === 'today' ? 'Today' : state.view)}</p>
      <button type="button" class="date-title">${esc(title())}</button>
      <div class="date-line">${esc(display(state.selectedDate))}</div>
    </div>
    <div class="day-footer"><div class="context"></div><div class="footer-actions"></div></div>
  `;
  const utility = card.querySelector('.utility');
  utility.append(iconButton(state.theme === 'dark' ? '☀️' : '🌙', toggleTheme), iconButton('⚙️', () => openModal('settings')));
  [['today','🌅 Today'],['week','🗓️ Week'],['month','🌘 Month'],['tasks','✅ Tasks']].forEach(([view, label]) => {
    const button = labelledButton(label, `nav-btn ${state.view === view ? 'active pulse' : ''}`, () => { state.view = view; state.appsOpen = false; render(); });
    card.querySelector('.nav-row').append(button);
  });
  card.querySelector('.date-title').addEventListener('click', () => openModal('date'));
  const context = contextForDate();
  const contextPill = el('span', 'context-pill');
  contextPill.textContent = `${context.emoji} ${context.title}`;
  card.querySelector('.context').append(contextPill);
  const actions = card.querySelector('.footer-actions');
  actions.append(labelledButton('🧩 Apps', 'compact-action', () => { state.appsOpen = !state.appsOpen; render(); }), labelledButton('🗄️ Archive', 'compact-action', () => openModal('archive')), labelledButton('➕ Add', 'compact-action accent pulse', () => openModal('task')));
  header.append(card);
  if (state.appsOpen) header.append(renderApps());
  return header;
}

function renderApps() {
  const menu = el('section', 'apps-menu open');
  ['My apps','Admin links','Creative links'].forEach(group => {
    const col = el('div', 'apps-column');
    col.innerHTML = `<h3>${esc(group)}</h3>`;
    state.data.apps.filter(app => app.group === group).forEach(item => {
      const row = el('div', 'app-row');
      row.innerHTML = `<a class="app-link" target="_blank" rel="noreferrer" href="${escAttr(item.url)}"><span>${esc(item.emoji)}</span><span><b>${esc(item.label)}</b>${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</span></a>${item.githubUrl ? `<a class="github-link" target="_blank" rel="noreferrer" href="${escAttr(item.githubUrl)}">🐙</a>` : ''}`;
      col.append(row);
    });
    menu.append(col);
  });
  return menu;
}

function renderPage() {
  if (state.view === 'tasks') return renderTasksOnly();
  const page = el('section', 'content-grid');
  const left = el('div', 'column');
  const right = el('div', 'column');
  const apps = el('section', 'apps-grid');
  apps.append(renderChrisFit(), renderViaticum());
  left.append(apps);
  const [start, end] = state.view === 'month' ? monthRange(state.selectedDate) : state.view === 'week' ? weekRange(state.selectedDate) : [state.selectedDate, state.selectedDate];
  const tasks = state.data.tasks.filter(item => overlaps(item, start, end));
  const reminders = state.data.reminders.filter(item => overlaps(item, start, end));
  if (state.view === 'today') {
    const overdue = state.data.tasks.filter(item => !archived(item) && taskStart(item) < state.selectedDate).sort((a, b) => taskStart(a).localeCompare(taskStart(b)));
    if (overdue.length) right.append(renderTaskCard('🚨 Outstanding', overdue, { tone: 'out' }));
  }
  right.append(renderTaskCard(state.view === 'today' ? '✅ Today tasks' : `✅ ${state.view} tasks`, tasks, { filter: state.view === 'today' }), renderTaskCard('🔔 Reminders', reminders, { tone: 'rem', reminder: true }));
  page.append(left, right);
  return page;
}

function renderTasksOnly() {
  const page = el('section', 'tasks-only');
  const active = state.data.tasks.filter(item => !archived(item));
  page.append(renderTaskCard('🏠 Personal tasks', active.filter(item => !work(item))), renderTaskCard('💼 Work tasks', active.filter(work)), renderTaskCard('🔔 Reminders', state.data.reminders.filter(item => !archived(item)), { tone: 'rem', reminder: true }));
  return page;
}

function renderChrisFit() {
  const card = el('article', 'card fit');
  card.append(cardHead('🥦 ChrisFit', CONFIG.chrisFitUrl));
  const summary = fitnessSummary();
  const grid = el('div', 'mini-grid');
  grid.append(mini('Daily Summary', [['🥦 Food',summary.dailyFood],['🔥 Burn',summary.dailyBurn],['📉 Deficit',summary.dailyDeficit]]), mini('Weekly Summary', [['🥦 Food',summary.weeklyFood],['🔥 Burn',summary.weeklyBurn],['📉 Deficit',summary.weeklyDeficit]]));
  const weight = el('div', 'weight-bar');
  weight.innerHTML = `<b>⚖️ Weight</b><strong>${esc(summary.weight)}</strong>${summary.bmi ? `<span>${esc(summary.bmi)}</span>` : ''}`;
  card.append(grid, weight);
  return card;
}

function renderViaticum() {
  const card = el('article', 'card viat');
  card.append(cardHead('🎒 Viaticum', CONFIG.viaticumUrl));
  const events = state.data.viaticumEvents;
  if (state.view === 'week') { card.append(info('Schedule', events.filter(item => inRange(item.date, ...weekRange(state.selectedDate))).map(item => `${item.date.slice(8)} ${item.locationEmoji} ${item.location || ''} · ${item.eventEmoji} ${item.event || ''}`).join('\n') || 'No Viaticum items this week.')); return card; }
  if (state.view === 'month') { card.append(info(monthName(state.selectedDate), events.filter(item => inRange(item.date, ...monthRange(state.selectedDate))).map(item => `${item.date.slice(8)} ${item.eventEmoji} ${item.event || item.location || ''}`).join('\n') || 'No Viaticum month items.')); return card; }
  const today = events.find(item => item.date === state.selectedDate) || {};
  const week = events.filter(item => inRange(item.date, ...weekRange(state.selectedDate)));
  const next = week.find(item => item.date >= state.selectedDate) || {};
  const grid = el('div', 'mini-grid');
  grid.append(mini('Daily Summary', [[today.statusEmoji || '🤔',today.status || 'Unsure'],[today.locationEmoji || '📍',today.location || '—'],[today.eventEmoji || '🎒',today.event || 'Check Viaticum']]), mini('Weekly Summary', [['🗓️ Items',String(week.length)],['📍',locations(week) || '—'],['➡️',next.event || next.location || '—']]));
  card.append(grid, info('Schedule', today.schedule || today.details || 'Open Viaticum and check schedule, maps, paid/unpaid, and codes.'));
  return card;
}

function cardHead(label, url) {
  const head = el('div', 'card-head');
  head.innerHTML = `<h2>${esc(label)}</h2>`;
  const open = document.createElement('a'); open.className = 'open-link'; open.href = url; open.target = '_blank'; open.rel = 'noreferrer'; open.textContent = '🔗 Open';
  head.append(open); return head;
}

function mini(title, rows) {
  const box = el('section', 'mini'); box.innerHTML = `<h3>${esc(title)}</h3>`;
  rows.forEach(([label, value]) => { const row = el('div','sum-row'); row.innerHTML = `<span>${esc(label)}</span><strong>${esc(value)}</strong>`; box.append(row); });
  return box;
}

function info(title, text) { const box = el('div','info'); box.innerHTML = `<b>${esc(title)}</b><p>${esc(text)}</p>`; return box; }

function renderTaskCard(title, items, options = {}) {
  const card = el('article', `card ${options.tone || ''}`);
  const head = el('div', 'task-head'); head.innerHTML = `<h2>${esc(title)}</h2>`;
  const actions = el('div', 'task-actions');
  if (options.filter) actions.append(renderFilter());
  if (!options.reminder) actions.append(labelledButton('✅ Done selected','compact-control', completeSelected), labelledButton('➕ New task','compact-control', () => openModal('task')));
  head.append(actions);
  const list = el('div','list');
  const visible = options.filter ? filtered(items) : items;
  visible.forEach(item => list.append(taskRow(item)));
  if (!visible.length) list.append(empty('No items here.'));
  card.append(head,list); return card;
}

function renderFilter() {
  const control = el('div','task-filter');
  [['all','🌐 All'],['personal','🏠 Personal'],['work','💼 Work']].forEach(([key,label]) => control.append(labelledButton(label, `filter-btn ${state.filter === key ? 'active' : ''}`, () => { state.filter = key; render(); })));
  return control;
}

function taskRow(item) {
  const row = el('article', `task ${done(item) ? 'done' : ''}`);
  const toggle = el('button', `tick ${state.selected.has(String(item.id)) ? 'selected' : ''}`); toggle.type = 'button'; toggle.textContent = done(item) ? '✓' : ''; toggle.onclick = () => { const id = String(item.id); state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); render(); };
  const detail = el('button','task-detail'); detail.type = 'button'; detail.innerHTML = `<h3>${done(item) ? '✅ ' : ''}${work(item) ? '💼' : '🏠'} ${esc(item.title)}</h3><p>${esc(item.project)} · ${esc(item.startDate || item.dueDate)}</p><div class="meta"><span>${esc(done(item) ? '✅ Done' : item.status)}</span><span>${esc(item.priority)}</span></div>`; detail.onclick = () => openModal('task', item);
  const inspect = iconButton('🔎', () => openModal('task', item)); inspect.className = 'inspect';
  row.append(toggle,detail,inspect); return row;
}

function renderModal() {
  const backdrop = el('div','modal-backdrop');
  const modal = el('section','modal'); backdrop.append(modal); backdrop.onclick = event => { if (event.target === backdrop) closeModal(); };
  if (state.modal.type === 'settings') settingsModal(modal);
  else if (state.modal.type === 'archive') archiveModal(modal);
  else if (state.modal.type === 'date') dateModal(modal);
  else taskModal(modal, state.modal.task || {});
  return backdrop;
}

function modalHead(title) { const head = el('div','modal-head'); head.innerHTML = `<h2>${esc(title)}</h2>`; head.append(iconButton('✕', closeModal)); return head; }
function settingsModal(modal) { modal.append(modalHead('⚙️ Settings')); const body = el('div','modal-body settings-grid'); [['📊 Open Actarium Sheet',CONFIG.sheetUrl],['🐙 Open GitHub repo',CONFIG.repoUrl],['🌐 Open live Actarium',CONFIG.liveUrl],['🥦 Open ChrisFit',CONFIG.chrisFitUrl],['🎒 Open Viaticum',CONFIG.viaticumUrl]].forEach(([label,url])=>{const a=document.createElement('a');a.className='settings-link';a.href=url;a.target='_blank';a.rel='noreferrer';a.textContent=label;body.append(a)});const p=el('p','settings-meta');p.textContent=`${CONFIG.version} · ${state.connection}`;body.append(p);modal.append(body); }
function archiveModal(modal) { modal.append(modalHead('🗄️ Archive')); const body=el('div','modal-body');const search=document.createElement('input');search.className='text-input';search.placeholder='Search completed, cancelled, or deleted tasks';const list=el('div','list');const draw=()=>{const query=search.value.toLowerCase();list.innerHTML='';state.data.tasks.filter(archived).filter(item=>`${item.title} ${item.project} ${item.notes}`.toLowerCase().includes(query)).forEach(item=>list.append(taskRow(item)));if(!list.children.length)list.append(empty('No archive items match.'));};search.oninput=draw;body.append(search,list);modal.append(body);draw(); }
function dateModal(modal) { modal.append(modalHead('📅 Pick date'));const body=el('div','modal-body');const input=document.createElement('input');input.className='text-input';input.type='date';input.value=state.selectedDate;const save=labelledButton('💾 Save','save-btn pulse',()=>{state.selectedDate=input.value||state.selectedDate;closeModal();});body.append(input,save);modal.append(body); }
function taskModal(modal, existing) { modal.append(modalHead(existing.id?'✏️ Edit task':'➕ New task')); const body=el('div','modal-body'); const form=el('div','form'); const title=field('Title','title',existing.title||'');const dates=el('div','two');const start=field('Start date','startDate',existing.startDate||state.selectedDate,'date');const end=field('End date','endDate',existing.endDate||state.selectedDate,'date');dates.append(start.wrap,end.wrap);const project=field('Project','project',existing.project||'General');const choices=el('div','two');const type=choice('Task type','taskType',existing.taskType||'Personal',['Personal','Work']);const priority=choice('Priority','priority',existing.priority||'Normal',['Low','Normal','High','Urgent']);const status=choice('Status','status',existing.status||'Not started',['Not started','In progress','Done','Cancelled']);choices.append(type.wrap,priority.wrap,status.wrap);const notes=field('Notes','notes',existing.notes||'','textarea');form.append(title.wrap,dates,project.wrap,choices,notes.wrap);const save=labelledButton('💾 Save','save-btn pulse',()=>saveTask({existing,title,start,end,project,type,priority,status,notes}));body.append(form,save);modal.append(body); }
function field(label,name,value,type='text'){const wrap=el('label','field');wrap.innerHTML=`<span>${esc(label)}</span>`;const input=type==='textarea'?document.createElement('textarea'):document.createElement('input');if(type!=='textarea')input.type=type;input.name=name;input.value=value;input.className='text-input';wrap.append(input);return{wrap,input};}
function choice(label,name,value,options){const wrap=el('div','field');wrap.innerHTML=`<span>${esc(label)}</span>`;const trigger=el('button','choice-trigger');trigger.type='button';trigger.textContent=value;const menu=el('div','choice-menu');const hidden=document.createElement('input');hidden.type='hidden';hidden.name=name;hidden.value=value;options.forEach(option=>{const item=el('button',`choice-option ${option===value?'selected':''}`);item.type='button';item.textContent=option;item.onclick=()=>{hidden.value=option;trigger.textContent=option;menu.classList.remove('open');menu.querySelectorAll('.choice-option').forEach(x=>x.classList.toggle('selected',x.textContent===option));};menu.append(item)});trigger.onclick=()=>menu.classList.toggle('open');wrap.append(trigger,menu,hidden);return{wrap,hidden};}

function openModal(type, task) { state.appsOpen = false; state.modal = { type, task }; render(); }
function closeModal() { state.modal = null; render(); }
function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem(CONFIG.themeKey,state.theme); document.documentElement.dataset.theme=state.theme; render(); }
async function completeSelected(){const ids=[...state.selected];if(!ids.length){alert('Tick one or more tasks first.');return;}const when=new Date().toISOString();state.data.tasks=state.data.tasks.map(item=>ids.includes(String(item.id))?{...item,status:'Done',completedAt:when}:item);state.selected.clear();render();try{await post('markTasksDone',{ids,completedAt:when});state.connection='Saved';}catch(error){console.warn(error);state.connection='Saved locally — backend retry needed';}render();}
async function saveTask(fields){const existing=fields.existing;const item={id:existing.id||`TASK-${Date.now()}`,title:fields.title.input.value.trim()||'Untitled task',startDate:fields.start.input.value||state.selectedDate,endDate:fields.end.input.value||state.selectedDate,dueDate:fields.start.input.value||state.selectedDate,project:fields.project.input.value.trim()||'General',taskType:fields.type.hidden.value,priority:fields.priority.hidden.value,status:fields.status.hidden.value,notes:fields.notes.input.value.trim(),source:existing.source||'Actarium',recurrence:existing.recurrence||'None',repeatUntil:existing.repeatUntil||'',link:existing.link||'',completedAt:fields.status.hidden.value==='Done'?(existing.completedAt||new Date().toISOString()):''};const index=state.data.tasks.findIndex(t=>String(t.id)===String(item.id));index>=0?state.data.tasks.splice(index,1,item):state.data.tasks.unshift(item);closeModal();try{await post('saveTask',{task:item});state.connection='Saved';}catch(error){console.warn(error);state.connection='Saved locally — backend retry needed';}render();}

function contextForDate(){const ev=state.data.viaticumEvents.find(item=>item.date===state.selectedDate);if(ev?.location&&!/^(berlin|home)$/i.test(ev.location))return{emoji:'🎒',title:`Trip in progress · ${ev.location}`};const key=asDate(state.selectedDate).toLocaleDateString('en-GB',{weekday:'short'}).toLowerCase();return state.data.schedule.find(item=>!item.days||item.days.toLowerCase().includes(key))||{emoji:'🧭',title:'Day context'};}
function fitnessSummary(){const feed=state.data.appFeed.find(item=>/chrisfit/i.test(item.sourceApp));let data={};try{data=JSON.parse(feed?.payload||'{}')}catch{}return{dailyFood:data.dailyFood||'0 / 1500',dailyBurn:data.dailyBurn||'0 / 2500',dailyDeficit:data.dailyDeficit||'0 / -500',weeklyFood:data.weeklyFood||'— / 10500',weeklyBurn:data.weeklyBurn||'— / 17500',weeklyDeficit:data.weeklyDeficit||'— / -3500',weight:data.weight||'— kg',bmi:data.bmi||''};}
function title(){return state.view==='today'?asDate(state.selectedDate).toLocaleDateString('en-GB',{weekday:'long'}):state.view==='week'?'Week':state.view==='month'?monthName(state.selectedDate):'Tasks';}
function filtered(items){return state.filter==='work'?items.filter(work):state.filter==='personal'?items.filter(item=>!work(item)):items;}
function taskStart(item){return item.startDate||item.dueDate||''}function overlaps(item,start,end){return taskStart(item)<=end&&start<=(item.endDate||item.dueDate||item.startDate)}function inRange(value,start,end){return value&&value>=start&&value<=end}function archived(item){return done(item)||/cancelled|deleted/i.test(item.status||'')}function done(item){return/^done$/i.test(item.status||'')||Boolean(item.completedAt)}function work(item){return /work/i.test(item.taskType||'')||/work|zalando|nike|office/i.test(`${item.project} ${item.source} ${item.title} ${item.notes}`)}function locations(items){return[...new Set(items.map(item=>item.location).filter(Boolean))].slice(0,2).join(', ')}function weekRange(value){const selected=asDate(value);const monday=new Date(selected);monday.setDate(selected.getDate()-((selected.getDay()+6)%7));const sunday=new Date(monday);sunday.setDate(monday.getDate()+6);return[iso(monday),iso(sunday)]}function monthRange(value){const selected=asDate(value);return[iso(new Date(selected.getFullYear(),selected.getMonth(),1)),iso(new Date(selected.getFullYear(),selected.getMonth()+1,0))]}function monthName(value){return asDate(value).toLocaleDateString('en-GB',{month:'long'})}function display(value){return asDate(value).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}function date(value){return value?iso(value):''}function iso(value){const d=asDate(value);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}function asDate(value){if(value instanceof Date)return value;const raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const[a,b,c]=raw.split('-').map(Number);return new Date(a,b-1,c)}const euro=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);if(euro)return new Date(+euro[3],+euro[2]-1,+euro[1]);const d=new Date(raw);return isNaN(d)?new Date():d}function val(row,...keys){for(const key of keys)if(row?.[key]!==undefined&&row?.[key]!==null&&String(row[key]).trim()!=='')return row[key];return''}function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}function escAttr(value){return esc(value).replace(/`/g,'')}function el(tag,className=''){const node=document.createElement(tag);if(className)node.className=className;return node}function labelledButton(label,className,handler){const button=el('button',className);button.type='button';const m=String(label).match(/^(\S+)\s*(.*)$/);button.innerHTML=`<span class="emoji">${esc(m?.[1]||'')}</span>${m?.[2]?`<span class="label">${esc(m[2])}</span>`:''}`;button.onclick=handler;return button}function iconButton(icon,handler){const button=el('button','icon');button.type='button';button.textContent=icon;button.onclick=handler;return button}function empty(text){const node=el('p','empty');node.textContent=text;return node}
function demo(){return normalise({tasks:[{id:'T1',title:'Connect Actarium to the Sheet backend',project:'Apps',priority:'High',due_date:state.selectedDate,task_type:'Personal'},{id:'T2',title:'Review weekend plans',project:'Travel',status:'Done',due_date:state.selectedDate,completed_at:new Date().toISOString(),task_type:'Personal'},{id:'T3',title:'Review Nike PO confirmations',project:'Zalando',source:'Zalando',priority:'High',due_date:state.selectedDate,task_type:'Work'}],reminders:[{id:'R1',title:'Check Actarium after deployment',project:'Apps',date:state.selectedDate}],apps:[{label:'Actarium',emoji:'📋',url:CONFIG.liveUrl,group:'My apps',sort_order:1},{label:'ChrisFit',emoji:'⚖️',url:CONFIG.chrisFitUrl,group:'My apps',sort_order:2},{label:'Viaticum',emoji:'🎒',url:CONFIG.viaticumUrl,group:'My apps',sort_order:3},{label:'GitHub',emoji:'🐙',url:'https://github.com/',group:'Admin links',sort_order:4},{label:'ChatGPT',emoji:'💬',url:'https://chatgpt.com/',group:'Creative links',sort_order:5}],routine:[{emoji:'💼',monday:'Work day',tuesday:'Work day',wednesday:'Work day',thursday:'Work day',friday:'Work day',saturday:'Weekend',sunday:'Weekend'}],viaticumEvents:[{date:state.selectedDate,status:'Unsure',location:'Berlin',event:'Check Viaticum',schedule:'Open Viaticum and check schedule, maps, paid/unpaid, and codes.'}]});}
