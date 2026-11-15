import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStations,parseAccessibleEntrances} from '../scripts/station-import.js';
import {dataset,get_station_accessibility} from '../src/station-tools.js';

test('MTA accordion parsing retains stations after nested divs and preserves route text in restrictions',()=>{
  const html='<details><summary><div>Manhattan</div></summary><div class="field--name-field-accordion-text"><p><strong>57 St</strong><span aria-label="subway line-m"> </span></p><ul><li><div>Elevator at SW corner.</div></li><li>Bus connections: M5</li></ul><p><strong>168 St</strong><span aria-label="subway line-a"> </span></p><ul><li>Elevator at SE corner.</li><li>Note: transfer to <span aria-label="subway line-1"> </span> is not accessible.</li></ul></div></details>';
  const records=parseAccessibleEntrances(html);
  assert.equal(records.length,2);
  assert.deepEqual(records[0].lines,['Elevator at SW corner.']);
  assert.match(records[1].lines[1],/1 is not accessible/);
});

function input(){
  const rows=[{station_id:'1',gtfs_stop_id:'A01',complex_id:'1',borough:'M',stop_name:'Example',daytime_routes:'A',ada:'1',ada_northbound:'1',ada_southbound:'1',north_direction_label:'Uptown',south_direction_label:'Downtown',ada_notes:'NaN'}, {station_id:'1',gtfs_stop_id:'B01',complex_id:'1',borough:'M',stop_name:'Example',daytime_routes:'B',ada:'0',ada_northbound:'0',ada_southbound:'0',north_direction_label:'Uptown',south_direction_label:'Downtown',ada_notes:'No B platform access'}];
  return {stations:rows,complexes:[{complex_id:'1',station_ids:'1',gtfs_stop_ids:'A01; B01',number_of_stations_in_complex:'2',borough:'M',stop_name:'Example',daytime_routes:'A B',ada:'2',ada_notes:'B not accessible'}],entrances:[{complex_id:'1',gtfs_stop_id:'A01',constituent_station_name:'Example',entrance_type:'Elevator',entrance_latitude:'40.7',entrance_longitude:'-73.9',entry_allowed:'YES',exit_allowed:'NO'}],accessibleHtml:'<details><summary>Manhattan</summary><div class="field--name-field-accordion-text"><p><strong>Example</strong><span aria-label="subway line-a"> </span></p><ul><li>Elevator at the south corner.</li><li>Note: B transfer is not accessible.</li></ul></div></details>',metadata:{stations:{rowsUpdatedAt:100},complexes:{rowsUpdatedAt:100},entrances:{rowsUpdatedAt:50}},checkedAt:'2026-11-15T12:00:00Z'};
}
test('import keeps direction restrictions and separates old entrance inventory from accessible evidence',()=>{
  const {dataset:out}=buildStations(input()),r=out.records[0];
  assert.equal(r.adaClassification,'partially_accessible');
  assert.equal(r.platforms.length,2);assert.deepEqual(r.platforms[1].directions.map(d=>d.stepFree),['no','no']);
  assert.equal(r.entrances.length,1);assert.deepEqual(r.entrances[0].services,['A']);
  assert.match(r.directionNotes,/B transfer is not accessible/);
  assert.equal(r.entranceLocations[0].stepFree,'unknown');assert.equal(r.entranceLocations[0].exitAllowed,false);
  assert.notEqual(r.entranceInventoryUpdatedAt,r.snapshotVerifiedAt);
  assert.equal(r.sources.find(s=>s.title.includes('entrance locations')).sourceUpdatedAt,'1970-01-01T00:00:50.000Z');
});
test('duplicate GTFS IDs and missing complex members fail before snapshot replacement',()=>{
  const duplicate=input();duplicate.stations[1].gtfs_stop_id='A01';assert.throws(()=>buildStations(duplicate),/duplicate/);
  const missing=input();missing.complexes[0].gtfs_stop_ids='A01';assert.throws(()=>buildStations(missing),/mismatch/);
  const absent=input();absent.complexes=[];assert.throws(()=>buildStations(absent),/Empty/);
});
test('missing entrance descriptions remain unknown and newly added restricted stations retain limits',()=>{
  const missing=get_station_accessibility({stationId:'108'}).record;
  assert.equal(missing.adaClassification,'fully_accessible');assert.equal(missing.entrances.length,0);
  const union=get_station_accessibility({stationId:'602'}).record;
  assert.equal(union.adaClassification,'partially_accessible');
  assert.ok(union.platforms.some(p=>p.classification==='not_accessible'&&p.services.includes('4')));
  assert.match(union.restrictionBrief,/4 5 6 not accessible/);
  assert.ok(union.entrances.length>0);
  assert.ok(union.entrances.every(e=>!e.services.some(s=>['4','5','6'].includes(s))));
  assert.equal(get_station_accessibility({stationId:'151'}).record.platforms.length,2);
  for(const r of dataset.records)for(const e of r.entrances)assert.ok(e.sources.length&&e.sources.every(s=>s.url.startsWith('https://')));
});
