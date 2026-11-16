// Deterministic public-data conversion. No model calls or inferred accessible paths.
export const sourceUrls = {
  stations: 'https://data.ny.gov/Transportation/MTA-Subway-Stations/39hk-dx4f',
  complexes: 'https://data.ny.gov/Transportation/MTA-Subway-Stations-and-Complexes/5f5g-n3cz',
  entrances: 'https://data.ny.gov/Transportation/MTA-Subway-Entrances-and-Exits-2024/i9wp-a4ja',
  accessible: 'https://www.mta.info/accessibility/stations',
};
const boroughs = { M:'Manhattan', B:'Brooklyn', Bk:'Brooklyn', Bx:'Bronx', Q:'Queens', SI:'Staten Island' };
const classes = { '0':'not_accessible', '1':'fully_accessible', '2':'partially_accessible' };
const flag = value => ({ '0':'no', '1':'yes' }[value] || 'unknown');
export const clean = value => !value || /^(nan|null)$/i.test(value.trim()) ? '' : value.trim();
const list = value => clean(value).split(/\s+/).filter(Boolean);
const normalize = value => value.toLowerCase().replace(/\bstreet\b/g,'st').replace(/\bavenue\b/g,'av').replace(/\bavenue?s\b/g,'avs').replace(/\bsquare\b/g,'sq').replace(/\bpark\b/g,'pk').replace(/\bplace\b/g,'pl').replace(/\bwest\b/g,'w').replace(/\bwashington\b/g,'wash').replace(/\bstation\b/g,'').replace(/[^a-z0-9]/g,'');
const xmlText = value => value.replace(/<span\b[^>]*aria-label="subway line-([^"]+)"[^>]*>[\s\S]*?<\/span>/gi,(_,route)=>` ${route.toUpperCase()} `).replace(/<[^>]+>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();

export function parseAccessibleEntrances(html) {
  // MTA publishes five borough accordions containing p/ul pairs. Fail closed if this structure changes.
  const sections = [];
  for (const [,block] of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const panel = block.match(/<div\b[^>]*class="[^"]*field--name-field-accordion-text[^"]*"[^>]*>/i);
    if (!panel) continue;
    const summary = xmlText(block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '');
    const borough = { 'The Bronx':'Bronx', 'Staten Island Railway':'Staten Island' }[summary] || summary;
    if (!Object.values(boroughs).includes(borough)) continue;
    const content=block.slice(panel.index+panel[0].length);
    for (const [,heading,items] of content.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>\s*<ul\b[^>]*>([\s\S]*?)<\/ul>/gi)) {
      const name = xmlText(heading.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '');
      const services = [...heading.matchAll(/aria-label="subway line-([^"]+)"/gi)].map(m=>['FS','GS','RS'].includes(m[1].toUpperCase())?'S':m[1].toUpperCase());
      const lines = [...items.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(m=>xmlText(m[1])).filter(line=>line && !/^(Bus connections?|Connections?):|New Jersey Transit|suburban bus|boarding areas at the Port Authority/i.test(line));
      if (name && lines.length) sections.push({ name, borough, services, lines });
    }
  }
  return sections;
}

function matchReference(section, records) {
  const name = normalize(section.name);
  const possible = records.filter(({station,platforms,aliases})=>station.borough === section.borough && [station.stationName,...platforms.map(p=>p.name),...aliases].some(n=>normalize(n)===name) && (!section.services.length || section.services.some(s=>station.services.includes(s))));
  const score=record=>section.services.filter(s=>record.station.services.includes(s)).length;
  const best=possible.filter(r=>score(r)===Math.max(...possible.map(score)));
  return best.length === 1 ? best[0] : null;
}

export function buildStations({stations,complexes,entrances,accessibleHtml,metadata,checkedAt,notes={}}) {
  if (![stations,complexes,entrances].every(Array.isArray) || !stations.length || !complexes.length) throw Error('Empty or invalid MTA station data');
  const stationIds = new Set(), stopIds = new Set(), complexIds = new Set();
  for (const row of stations) {
    if (!row.station_id || !row.complex_id || !row.gtfs_stop_id || !boroughs[row.borough] || !classes[row.ada] || stopIds.has(row.gtfs_stop_id)) throw Error('Invalid or duplicate station identifier/classification');
    stationIds.add(row.station_id); stopIds.add(row.gtfs_stop_id);
  }
  const stamp = key => new Date(metadata[key].rowsUpdatedAt * 1000).toISOString();
  const source = key => ({url:sourceUrls[key],title:{stations:'MTA station accessibility and direction records',complexes:'MTA stations and transfer complexes',entrances:'MTA entrance locations (2024 inventory)',accessible:'MTA accessible-station entrance reference'}[key],sourceUpdatedAt:key==='accessible' ? (accessibleHtml.match(/Updated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ? new Date(accessibleHtml.match(/Updated\s+([A-Z][a-z]+ \d{1,2}, \d{4})/)[1]+' 12:00:00 GMT').toISOString() : null) : stamp(key),verifiedAt:checkedAt});
  const groups = new Map();
  for (const row of stations) { if(!groups.has(row.complex_id)) groups.set(row.complex_id,[]);groups.get(row.complex_id).push(row); }
  const records = complexes.map(complex=>{
    const id=complex.complex_id, rows=groups.get(id);
    if(!id || complexIds.has(id) || !rows?.length || !classes[complex.ada] || !boroughs[complex.borough]) throw Error('Invalid or unmatched station complex');
    complexIds.add(id);
    const declared = clean(complex.station_ids).split(/;\s*/).sort();
    const declaredStops=clean(complex.gtfs_stop_ids).split(/;\s*/).sort();
    if(JSON.stringify(declared)!==JSON.stringify([...new Set(rows.map(r=>r.station_id))].sort()) || JSON.stringify(declaredStops)!==JSON.stringify(rows.map(r=>r.gtfs_stop_id).sort()) || Number(complex.number_of_stations_in_complex)!==rows.length) throw Error(`Constituent station mismatch at ${id}`);
    const platforms=rows.map(row=>({id:row.gtfs_stop_id,stationId:row.station_id,name:row.stop_name,services:list(row.daytime_routes),classification:classes[row.ada],directions:[{label:clean(row.north_direction_label)||'Northbound',stepFree:flag(row.ada_northbound)},{label:clean(row.south_direction_label)||'Southbound',stepFree:flag(row.ada_southbound)}],notes:clean(row.ada_notes)}));
    // A complex cannot be unconditionally fully accessible if one of its constituent stations is not.
    const classification=complex.ada==='1' && platforms.some(p=>p.classification!=='fully_accessible') ? 'partially_accessible' : classes[complex.ada];
    const restriction=clean(complex.ada_notes);
    return {
      station:{stationId:id,stationName:complex.stop_name,borough:boroughs[complex.borough],services:list(complex.daytime_routes),...(notes[id]?.locationLabel ? {locationLabel:notes[id].locationLabel} : {})},
      aliases:[...new Set([complex.display_name,...rows.map(r=>r.stop_name),...(notes[id]?.aliases||[])])],
      adaClassification:classification,
      directionNotes:[restriction,'Read each service and direction separately. A station listing does not confirm equipment operation.'].filter(Boolean).join(' '),
      restrictionBrief:restriction,
      entrances:[], platforms,platformNotes:platforms.map(p=>`${p.name} (${p.services.join(' / ')}): ${p.classification.replaceAll('_',' ')}${p.notes ? '. '+p.notes:''}`),
      equipmentNotes:['Use the separate equipment panel for timestamped MTA reports. No matching equipment means unknown feed coverage.'],currentElevatorStatus:'not_checked',officialStatusUrl:'https://www.mta.info/elevator-escalator-status',snapshotVerifiedAt:checkedAt,lastSuccessfulRefreshAt:null,refreshState:'not_implemented',sources:[source('stations'),source('complexes')],
    };
  });
  if(complexIds.size!==groups.size || [...groups.keys()].some(id=>!complexIds.has(id))) throw Error('Station list and complex list do not cover the same network');
  const sections=parseAccessibleEntrances(accessibleHtml), unmatched=[];
  let matchedSections=0;
  for(const section of sections) {
    const record=matchReference(section,records);
    if(!record){unmatched.push({name:section.name,borough:section.borough,services:section.services});continue;}
    matchedSections++;
    // Some headings include both accessible services and badges followed by “not accessible”.
    // Only attribute the entrance to services with accessible platforms in the station dataset.
    const accessibleServices=new Set(record.platforms.filter(p=>p.classification!=='not_accessible'&&p.classification!=='unknown').flatMap(p=>p.services));
    const entranceServices=section.services.filter(s=>accessibleServices.has(s));
    const scope=entranceServices.length ? `${section.name} (${entranceServices.join(' / ')}): ` : `${section.name}: `;
    for(const line of section.lines){
      // Restrictions are kept as restrictions, never promoted to a wheelchair entrance.
      if(/^Note:|not ADA|not accessible|closed|out of service|unavailable/i.test(line)) {
        record.directionNotes+=' '+line;
        if(!record.restrictionBrief)record.restrictionBrief=line;
      }else if(accessibleServices.size && /\belevators?\b|\bramps?\b|\baccessible entrance\b|\baccessible path\b/i.test(line)) {
        record.entrances.push({entranceId:`${record.station.stationId}-reference-${record.entrances.length+1}`,locationDescription:scope+line,stepFree:'yes',entryAllowed:null,exitAllowed:null,services:entranceServices,directionNotes:'Official accessible-station reference. Follow the stated service/direction restrictions and check current equipment reports.',sources:[source('accessible')]});
      }
    }
    if(!record.sources.some(s=>s.url===sourceUrls.accessible))record.sources.push(source('accessible'));
  }
  let curatedFallbacks=0;
  for(const record of records){
    const old=notes[record.station.stationId];
    if(!record.entrances.length && record.adaClassification!=='not_accessible' && old?.entrances?.length){record.entrances=old.entrances;curatedFallbacks++;for(const s of old.entrances.flatMap(e=>e.sources))if(!record.sources.some(t=>t.url===s.url))record.sources.push(s);}
    // Coordinates are inventory locations, not an inferred accessible path or a current operating condition.
    const rows=entrances.filter(e=>String(e.complex_id)===record.station.stationId && stopIds.has(e.gtfs_stop_id));
    record.entranceLocations=rows.map((e,i)=>({id:`${record.station.stationId}-inventory-${i+1}`,type:e.entrance_type,stationName:e.constituent_station_name,latitude:Number(e.entrance_latitude),longitude:Number(e.entrance_longitude),entryAllowed:e.entry_allowed==='YES'?true:e.entry_allowed==='NO'?false:null,exitAllowed:e.exit_allowed==='YES'?true:e.exit_allowed==='NO'?false:null,stepFree:'unknown'})).filter(e=>Number.isFinite(e.latitude)&&Number.isFinite(e.longitude));
    if(rows.length)record.sources.push(source('entrances'));
    record.entranceInventoryUpdatedAt=stamp('entrances');
  }
  // Stable ordering makes imports reviewable and does not privilege the original pilot cards.
  const order=['Manhattan','Bronx','Brooklyn','Queens','Staten Island'];
  records.sort((a,b)=>order.indexOf(a.station.borough)-order.indexOf(b.station.borough) || a.station.stationName.localeCompare(b.station.stationName,'en',{numeric:true}) || Number(a.station.stationId)-Number(b.station.stationId));
  const sourceCounts={stations:stations.length,stationIds:stationIds.size,complexes:complexes.length,entrances:entrances.length};
  const report={checkedAt,sourceCounts,cards:records.length,byBorough:Object.fromEntries(order.map(b=>[b,records.filter(r=>r.station.borough===b).length])),referenceSections:sections.length,matchedSections,unmatchedReferences:unmatched,curatedFallbacks,cardsWithAccessibleEntranceNotes:records.filter(r=>r.entrances.length).length,cardsWithoutAccessibleEntranceNotes:records.filter(r=>r.adaClassification!=='not_accessible'&&!r.entrances.length).map(r=>({id:r.station.stationId,name:r.station.stationName,services:r.station.services})),sourceDates:Object.fromEntries(['stations','complexes','entrances','accessible'].map(k=>[k,source(k).sourceUpdatedAt]))};
  return {dataset:{verifiedAt:checkedAt,sourceUpdatedAt:stamp('stations'),coverageNote:`${records.length} station and transfer-complex cards covering all ${stations.length} station records in MTA's subway and Staten Island Railway reference datasets. Ferry service is separate. Service lists are dated references, not today's schedule. Missing entrance/equipment details remain unknown.`,sourceCounts,records},report};
}
