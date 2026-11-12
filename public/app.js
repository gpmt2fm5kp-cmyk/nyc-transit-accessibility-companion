const $ = selector => document.querySelector(selector);
const state = { stations: [], record: null, borough: 'All', query: '', history: [], mode: 'snapshot', busy: false, selectVersion: 0, askVersion: 0, aiConfigured: false };
const classifications = { fully_accessible: 'Listed ADA accessible', partially_accessible: 'Some access is restricted', not_accessible: 'Not listed as ADA accessible', unknown: 'Accessibility not confirmed' };
const groupColors = { '1':'red','2':'red','3':'red','4':'green','5':'green','6':'green','7':'purple',A:'blue',C:'blue',E:'blue',B:'orange',D:'orange',F:'orange',M:'orange',N:'yellow',Q:'yellow',R:'yellow',W:'yellow',G:'lime' };
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('access-icon');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/icons.svg#${name}`); svg.append(use); return svg;
}
for (const slot of document.querySelectorAll('[data-icon]')) slot.append(icon(slot.dataset.icon));
function selectFeature(feature) {
  const active = document.querySelector(`[data-feature="${feature}"]`);
  const opening = active?.getAttribute('aria-expanded') !== 'true';
  for (const button of document.querySelectorAll('[data-feature]')) button.setAttribute('aria-expanded', String(opening && button === active));
  $('#step-free-panel').hidden = !opening || feature !== 'step-free';
  $('#coming-soon-panel').hidden = !opening || feature === 'step-free';
  if (opening && feature !== 'step-free') $('#coming-soon-title').textContent = {vision:'Vision support',hearing:'Hearing support',entrances:'Station entrances'}[feature];
}
for (const button of document.querySelectorAll('[data-feature]')) button.addEventListener('click', () => selectFeature(button.dataset.feature));
function routes(services, limit = services.length) {
  const container = element('span', undefined, 'routes');
  for (const service of services.slice(0, limit)) { const badge = element('span', service, `route ${groupColors[service] || ''}`); badge.setAttribute('aria-label', `Line ${service}`); container.append(badge); }
  if (services.length > limit) container.append(element('span', `+${services.length-limit}`, 'route'));
  return container;
}
function date(value) { return new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'America/New_York' }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)); }
async function request(url, options) {
  const response = await fetch(url, options);
  let body;
  try { body = await response.json(); } catch { throw new Error('The guide could not reach its server. Please refresh and try again.'); }
  if (!response.ok) throw new Error(body.message || 'That request could not be completed. Please try again.');
  return body;
}
function setThemeControl() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-toggle').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
  $('#theme-toggle').setAttribute('title', `Switch to ${dark ? 'light' : 'dark'} mode`);
  document.querySelector('meta[name="theme-color"]').content = dark ? '#080808' : '#f6f6f7';
}
$('#theme-toggle').addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('access-granted-theme', theme); } catch { /* Appearance still works if storage is disabled. */ }
  setThemeControl();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  let saved; try { saved = localStorage.getItem('access-granted-theme'); } catch { /* Use device preference. */ }
  if (!saved) { document.documentElement.dataset.theme = event.matches ? 'dark' : 'light'; setThemeControl(); }
});
setThemeControl();
const about = $('#about-dialog');
$('#about-button').addEventListener('click', () => about.showModal());
$('#close-about').addEventListener('click', () => about.close());
about.addEventListener('click', event => { if (event.target === about) { const bounds = about.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) about.close(); } });

function renderStations() {
  $('#station-list').replaceChildren();
  for (const station of state.stations) {
    const button = element('button', undefined, 'station-button');
    button.type = 'button';
    button.dataset.stationId = station.stationId;
    button.setAttribute('aria-current', String(state.record?.station.stationId === station.stationId));
    button.setAttribute('aria-label', `${station.stationName}, lines ${station.services.join(', ')}, ${station.borough}. ${classifications[station.classification]}.`);
    const sub = element('span', undefined, 'station-subline'); sub.append(routes(station.services, 4), element('span', station.borough));
    const access = element('span', undefined, 'station-access-status');
    access.append(icon(station.classification==='not_accessible'?'no-access':'wheelchair'), element('span', { fully_accessible: 'Step-free access listed', partially_accessible: 'Limited step-free access', not_accessible: 'No step-free access listed', unknown: 'Access not confirmed' }[station.classification]));
    button.append(element('strong', station.stationName), sub, access);
    button.addEventListener('click', () => selectStation(station.stationId, true));
    $('#station-list').append(button);
  }
  $('#empty-state').hidden = state.stations.length > 0;
  $('#result-count').textContent = `${state.stations.length} ${state.stations.length === 1 ? 'station' : 'stations'}${state.borough !== 'All' ? ` in ${state.borough}` : ' in this pilot'}`;
}
let searchVersion = 0;
async function searchStations() {
  const version = ++searchVersion;
  try {
    const result = await request(`/api/stations?${new URLSearchParams({ query: state.query, borough: state.borough })}`);
    if (version !== searchVersion) return;
    state.stations = result.matches;
    renderStations();
    $('#load-error').hidden = true;
  } catch(error) { if (version === searchVersion) { $('#load-error').textContent = error.message; $('#load-error').hidden = false; } }
}
let searchTimer;
$('#search').addEventListener('input', event => { state.query = event.target.value; clearTimeout(searchTimer); searchTimer = setTimeout(searchStations, 180); });
$('#search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); state.query = $('#search').value; searchStations(); });
for (const button of document.querySelectorAll('[data-borough]')) button.addEventListener('click', () => {
  state.borough = button.dataset.borough;
  for (const item of document.querySelectorAll('[data-borough]')) { const selected = item === button; item.classList.toggle('active', selected); item.setAttribute('aria-pressed', String(selected)); }
  searchStations();
});
$('#reset-search').addEventListener('click', () => { $('#search').value=''; state.query=''; state.borough='All'; for (const item of document.querySelectorAll('[data-borough]')) { const selected=item.dataset.borough==='All'; item.classList.toggle('active',selected); item.setAttribute('aria-pressed',String(selected)); } searchStations(); });
function resetConversation() {
  state.askVersion++;
  state.history=[]; state.busy=false;
  $('#conversation').replaceChildren(); $('#question').value=''; $('#usage').hidden=true;
  $('#ask-submit').disabled=false; $('#ask-submit').textContent='Ask';
}
function renderRecord() {
  const record=state.record;
  $('#station-name').textContent=record.station.stationName;
  $('#station-routes').replaceChildren(routes(record.station.services));
  $('#station-borough').textContent=record.station.borough;
  $('#station-access-brief').textContent={fully_accessible:'Step-free access listed · check elevator updates below',partially_accessible:'Limited step-free access · restrictions vary by service or direction',not_accessible:'No step-free access listed in the station reference',unknown:'Step-free access not confirmed'}[record.adaClassification];
  $('#access-label').textContent={fully_accessible:'Listed in MTA reference',partially_accessible:'Limited — see restrictions',not_accessible:'Not listed in MTA reference',unknown:'Not confirmed'}[record.adaClassification];
  $('#access-summary').dataset.access=record.adaClassification;
  $('.access-summary-icon').replaceChildren(icon(record.adaClassification==='not_accessible'?'no-access':'wheelchair'));
  $('#access-description').textContent=record.adaClassification==='not_accessible'
    ? 'Plan an accessible alternative with MTA.'
    : record.adaClassification==='partially_accessible'
      ? 'Access depends on your service or direction.'
      : 'Use the documented entrance below.';
  const entrances=$('#entrance-content'); entrances.replaceChildren();
  if (!record.entrances.length) entrances.append(element('p','No step-free entrance listed in our reference.'));
  else {
    const list=element('ul',undefined,'entrance-list');
    for (const entrance of record.entrances) list.append(element('li',entrance.locationDescription));
    entrances.append(list);
  }
  const quickPlatforms=$('#quick-platform-content');quickPlatforms.replaceChildren();
  if(record.adaClassification==='fully_accessible') quickPlatforms.append(element('p','Step-free platforms listed.'));
  else if(record.adaClassification==='not_accessible') quickPlatforms.append(element('p','No step-free platforms listed.'));
  else {
    const unrestricted=[...new Set(record.platforms.filter(p=>p.classification==='fully_accessible').flatMap(p=>p.services))];
    if(unrestricted.length) quickPlatforms.append(element('p',`${unrestricted.join(' / ')} · access listed`));
    for(const platform of record.platforms.filter(p=>p.classification!=='fully_accessible')) {
      const note=platform.classification==='not_accessible'?'no step-free access listed':platform.notes || 'direction restrictions; see details';
      quickPlatforms.append(element('p',`${platform.services.join(' / ')} · ${note}`));
    }
  }
  const restrictions={
    '611':'Port Authority passage: ramps do not meet ADA guidelines.',
    '620':'Court St (R) and its transfer are not accessible.',
    '606':'E / F: Manhattan-bound access only.'
  };
  const restriction=restrictions[record.station.stationId];
  $('#quick-restriction').textContent=restriction || '';
  $('#quick-restriction').hidden=!restriction;
  const platformContent=$('#platform-content'); platformContent.replaceChildren();
  if(record.adaClassification==='partially_accessible' || /not ADA|not accessible|not meet ADA/.test(record.directionNotes)) { const restriction=element('p',record.directionNotes,'restriction-note'); platformContent.append(restriction); }
  for (const platform of record.platforms) {
    const section=element('section',undefined,'platform-record');
    section.append(element('h4',`${platform.name} · ${platform.services.join(' / ')}`));
    const classification = element('p', {fully_accessible:'Step-free access listed',partially_accessible:'Direction restriction — check below',not_accessible:'No step-free platform access listed',unknown:'Platform access not confirmed'}[platform.classification], 'platform-access-label');
    section.append(classification);
    for (const direction of platform.directions) {
      const row=element('p',undefined,'direction-row');
      row.append(element('span',`${direction.label==='Last Stop'?'Terminal platform':direction.label}: `,'direction-label'),document.createTextNode({yes:'step-free access listed',no:'no step-free access listed',unknown:'access not confirmed'}[direction.stepFree]));
      section.append(row);
    }
    if(platform.notes) section.append(element('p',platform.notes));
    platformContent.append(section);
  }
  const sourceContent=$('#source-content'); sourceContent.replaceChildren();
  for (const source of record.sources) {
    const link=element('a',`${source.title} ↗`);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
    const section=element('div',undefined,'platform-record');
    section.append(link,element('p',`Checked ${date(source.verifiedAt)}. Source updated ${source.sourceUpdatedAt ? date(source.sourceUpdatedAt) : 'date not supplied'}.`,'source-date'));sourceContent.append(section);
  }
  sourceContent.append(element('p','Station reference updated by review and redeployment. Elevator outage reports are checked separately above.'));
  $('#snapshot-caption').textContent=`Reference checked ${date(record.snapshotVerifiedAt)} · Elevator reports checked separately · Station reference is not automatically refreshed`;
  for (const button of document.querySelectorAll('.station-button')) button.setAttribute('aria-current',String(button.dataset.stationId===record.station.stationId));
  $('#station-detail').setAttribute('aria-busy','false');
}
async function selectStation(stationId, focus=false) {
  const version=++state.selectVersion;
  $('#station-detail').setAttribute('aria-busy','true');
  resetConversation();
  for (const button of document.querySelectorAll('[data-feature]')) button.setAttribute('aria-expanded','false');
  $('#step-free-panel').hidden=true; $('#coming-soon-panel').hidden=true;
  state.record=null;
  elevatorVersion++; $('#elevator-summary').textContent='Choose a station to check its elevators.'; $('#elevator-checked').textContent=''; $('#elevator-reports').replaceChildren();
  state.mode='snapshot';renderMode();
  for(const details of document.querySelectorAll('.access-section'))details.open=false;
  try {
    const {record}=await request(`/api/stations/${encodeURIComponent(stationId)}`);
    if(version!==state.selectVersion)return;
    state.record=record;renderRecord(); refreshElevators();
    if(focus){$('#station-name').tabIndex=-1;$('#station-name').focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches)$('#station-detail').scrollIntoView({behavior:'smooth',block:'start'});}
    const url=new URL(location.href);url.searchParams.set('station',stationId);history.replaceState(null,'',url);
    $('#load-error').hidden=true;
  }catch(error){if(version===state.selectVersion){$('#station-detail').setAttribute('aria-busy','false');$('#load-error').textContent=error.message;$('#load-error').hidden=false;}}
}
let elevatorVersion = 0;
async function refreshElevators() {
  if (!state.record) return;
  const stationId=state.record.station.stationId, version=++elevatorVersion;
  const button=$('#refresh-elevators'); button.disabled=true; button.textContent='Checking…';
  $('#elevator-summary').textContent='Checking MTA elevator reports…';
  $('#elevator-checked').textContent=''; $('#elevator-reports').replaceChildren();
  try {
    const result=await request(`/api/stations/${encodeURIComponent(stationId)}/elevators`);
    if(version!==elevatorVersion || state.record?.station.stationId!==stationId) return;
    $('#elevator-summary').textContent=!result.elevatorCount ? 'No active passenger elevators listed for this station in MTA’s equipment feed.' : result.outages.length ? `${result.outages.length} elevator outage report${result.outages.length===1?'':'s'} · ${result.elevatorCount} elevators listed` : `No elevator outages reported · ${result.elevatorCount} elevators listed`;
    const time=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York',timeZoneName:'short'}).format(new Date(result.checkedAt));
    $('#elevator-checked').textContent=`MTA feeds checked ${time}. Auto-check every 5 minutes while this page is visible.`;
    for(const [title,reports] of [['Reported outages',result.outages],['Planned outages',result.planned]]) {
      if(!reports.length) continue;
      const details=element('details',undefined,'equipment-disclosure'); details.open=title==='Reported outages';
      details.append(element('summary',`${title} (${reports.length})`));
      for(const report of reports) {
        const item=element('div',undefined,'equipment-report');
        item.append(element('strong',`${report.equipmentId} · ${report.reason}`),element('p',report.serving));
        if(report.startsAt) item.append(element('p',`MTA start: ${report.startsAt} (New York time)`));
        if(report.estimatedReturn) item.append(element('p',`Estimated return: ${report.estimatedReturn} (New York time; may change)`));
        details.append(item);
      }
      $('#elevator-reports').append(details);
    }
  } catch(error) {
    if(version===elevatorVersion && state.record?.station.stationId===stationId) $('#elevator-summary').textContent=error.message;
  } finally {
    if(version===elevatorVersion){button.disabled=false;button.textContent='Refresh status';}
  }
}
$('#refresh-elevators').addEventListener('click',refreshElevators);
setInterval(()=>{if(!document.hidden)refreshElevators();},300_000);
function renderMode(){
  const demo=state.mode==='demonstration';
  $('#demo-panel').hidden=!demo;$('#question-mode').hidden=!demo;
  $('#demo-toggle').setAttribute('aria-pressed',String(demo));
  $('#demo-toggle').firstChild.textContent=demo?'Exit sample outage ':'Try a sample outage ';
}
async function toggleDemo(){
  if(!state.record)return;
  if(state.mode==='demonstration'){state.mode='snapshot';resetConversation();renderMode();return;}
  const station=state.record.station.stationId;
  try{
    const demo=await request(`/api/stations/${encodeURIComponent(station)}/demo`);
    if(state.record.station.stationId!==station)return;
    state.mode='demonstration';resetConversation();
    $('#demo-scenario').textContent=demo.scenario;$('#demo-next').textContent=demo.nextStep;renderMode();
    $('#demo-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(error){$('#load-error').textContent=error.message;$('#load-error').hidden=false;}
}
$('#demo-toggle').addEventListener('click',toggleDemo);
$('#exit-demo').addEventListener('click',()=>{state.mode='snapshot';resetConversation();renderMode();});
function message(role,text,error=false){const box=element('div',undefined,`message ${role}${error?' error':''}`);box.append(element('strong',role==='user'?'Your question':error?'Guide unavailable':'Station guide'),element('p',text));$('#conversation').append(box);return box;}
$('#ask-form').addEventListener('submit',async event=>{
  event.preventDefault();if(state.busy||!state.record)return;
  const question=$('#question').value.trim();if(!question)return;
  const version=++state.askVersion;const stationId=state.record.station.stationId;const mode=state.mode;
  state.busy=true;$('#ask-submit').disabled=true;$('#ask-submit').textContent='…';
  message('user',question);$('#question').value='';
  const pending=message('assistant','Reading the station reference…');pending.setAttribute('role','status');
  try{
    const result=await request('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stationId,question,dataMode:mode,history:state.history.slice(-6)})});
    if(version!==state.askVersion)return;
    pending.remove();
    const box=message('assistant',result.answer);
    box.append(element('p',`Next step: ${result.nextStep}`,'next-step'));
    box.append(element('p',`${result.dataMode==='demonstration'?'Sample outage for demonstration. ':''}${result.canConfirm?'Supported by the dated reference.':'This answer cannot confirm the requested conditions.'} AI answers use station reference data. See the separate elevator update panel for MTA reports.`,'answer-note'));
    state.history.push({role:'user',text:question},{role:'assistant',text:`${result.answer} ${result.nextStep}`});state.history=state.history.slice(-6);
    if(Number.isFinite(result.usage?.totalTokens)){$('#usage').textContent=`${result.usage.totalTokens.toLocaleString()} tokens used for this response`;$('#usage').hidden=false;}
  }catch(error){if(version!==state.askVersion)return;pending.remove();message('assistant',error.message,true);}
  finally{if(version===state.askVersion){state.busy=false;$('#ask-submit').disabled=false;$('#ask-submit').textContent='Ask';$('#question').focus({preventScroll:true});$('#conversation').scrollTop=$('#conversation').scrollHeight;}}
});
for(const chip of document.querySelectorAll('[data-question]'))chip.addEventListener('click',()=>{$('#question').value=chip.dataset.question;$('#question').focus();});
async function initialize(){
  await searchStations();
  const requested=new URLSearchParams(location.search).get('station');
  const first=state.stations.find(s=>s.stationId===requested)||state.stations[0];
  if(first)await selectStation(first.stationId);
  try{const health=await request('/api/health');state.aiConfigured=health.aiConfigured;$('#ai-status').textContent=health.aiConfigured?'AI guide ready':'AI guide not connected yet. Station cards are available.';$('#ai-status').classList.toggle('connected',health.aiConfigured);}catch{$('#ai-status').textContent='Guide connection unavailable. Try refreshing.';}
}
initialize();
