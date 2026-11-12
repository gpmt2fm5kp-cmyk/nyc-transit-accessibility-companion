import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, rateLimitKey } from '../server.js';
import { dataset, search_stations, get_station_accessibility, demonstrationFor } from '../src/station-tools.js';
import { askGuide } from '../src/guide.js';

async function withServer(options, run) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await run(base); } finally { await new Promise(resolve => server.close(resolve)); }
}
const post = (base, body, headers = {}) => fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type':'application/json', ...headers }, body: JSON.stringify(body) });

test('12 distinct official complexes preserve restricted and non-accessible records', () => {
  assert.equal(dataset.records.length,12);
  assert.equal(new Set(dataset.records.map(r=>r.station.stationId)).size,12);
  assert.equal(get_station_accessibility({stationId:'427'}).record.adaClassification,'not_accessible');
  assert.equal(get_station_accessibility({stationId:'151'}).record.adaClassification,'not_accessible');
  const court = get_station_accessibility({stationId:'606'}).record;
  const ef = court.platforms.find(p=>p.id==='F09');
  assert.deepEqual(ef.directions.map(d=>d.stepFree),['no','yes']);
  assert.equal(get_station_accessibility({stationId:'620'}).record.adaClassification,'partially_accessible');
  for(const r of dataset.records){assert.equal(r.currentElevatorStatus,'not_checked');assert.equal(r.refreshState,'not_implemented');assert.ok(r.sources.length);assert.ok(r.sources.every(s=>s.url.startsWith('https://')));}
});

test('search handles service, alias, borough and empty results without inventing stations',()=>{
  assert.ok(search_stations({query:'7'}).matches.some(s=>s.stationId==='471'));
  assert.equal(search_stations({query:'149 Grand Concourse'}).matches[0].stationId,'603');
  assert.equal(search_stations({query:'',borough:'Queens'}).matches.length,3);
  assert.equal(search_stations({query:'doesnotexist'}).matches.length,0);
  assert.throws(()=>get_station_accessibility({stationId:'../../.env'}),{code:'unknown_station'});
});

test('sample outage remains separate and never mutates the real station record',()=>{
  const {record}=get_station_accessibility({stationId:'471'});
  const before=JSON.stringify(record);
  const demo=demonstrationFor(record);
  assert.match(demo.label,/Sample outage/);
  assert.equal(JSON.stringify(record),before);
  assert.equal(record.currentElevatorStatus,'not_checked');
});

test('guide uses server evidence, validates output and limits confirmations',async()=>{
  const generate=async context=>{
    assert.equal(context.record.station.stationId,'606');
    return {output:{answer:'The reference lists a direction restriction.',canConfirm:true,nextStep:'Read the direction details.'},usage:42};
  };
  const result=await askGuide({stationId:'606',question:'Is the elevator working now?'},generate);
  assert.equal(result.canConfirm,false);
  assert.equal(result.usage.totalTokens,42);
  const demo=await askGuide({stationId:'606',question:'What should I do?',dataMode:'demonstration'},generate);
  assert.equal(demo.canConfirm,false);assert.match(demo.disclosure,/demonstration/);
  await assert.rejects(askGuide({stationId:'606',question:'Hello'},async()=>({output:{answer:'bad'},usage:1})));
});

test('station API and health work without a key; question fails clearly without affecting cards',()=>withServer({keyConfigured:()=>false},async base=>{
  const health=await (await fetch(`${base}/api/health`)).json();assert.equal(health.aiConfigured,false);assert.equal(health.stationCount,12);
  const response=await post(base,{stationId:'471',question:'Which entrance?'});assert.equal(response.status,503);
  assert.equal((await fetch(`${base}/api/stations/471`)).status,200);
  assert.equal((await fetch(`${base}/api/stations/missing`)).status,404);
  assert.equal((await fetch(`${base}/api/stations?borough=Invalid`)).status,400);
}));

test('malformed, oversized and untrusted requests are rejected before provider use',()=>withServer({keyConfigured:()=>true,answer:()=>{throw new Error('must not call');}},async base=>{
  assert.equal((await post(base,{stationId:'471',question:''})).status,400);
  assert.equal((await post(base,{stationId:'471',question:'a'.repeat(601)})).status,400);
  assert.equal((await post(base,{stationId:'471',question:'Hello',record:{fake:true}})).status,400);
  assert.equal((await post(base,{stationId:'471',question:'Hello'},{Origin:'https://other.example'})).status,403);
  assert.equal((await post(base,{stationId:'471',question:'a'.repeat(17000)})).status,413);
}));

test('provider failure is friendly and cannot expose raw secret-bearing errors',()=>withServer({keyConfigured:()=>true,answer:()=>{throw new Error('secret-do-not-return');}},async base=>{
  const response=await post(base,{stationId:'471',question:'Which entrance?'});
  assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/secret-do-not-return/);
}));

test('working provider path returns an answer and guards rapid repeated usage',()=>withServer({keyConfigured:()=>true,answer:async body=>({answer:'A sourced answer.',canConfirm:false,nextStep:'Check MTA.',stationId:body.stationId})},async base=>{
  for(let i=0;i<8;i++)assert.equal((await post(base,{stationId:'471',question:'Which entrance?'})).status,200);
  assert.equal((await post(base,{stationId:'471',question:'Which entrance?'})).status,429);
  assert.equal((await fetch(`${base}/api/stations`)).status,200);
}));

test('proxy IP headers are used only on Vercel',()=>{
 const request={headers:{'x-forwarded-for':'203.0.113.10'},ip:'127.0.0.1'};
 assert.equal(rateLimitKey(request,false),'127.0.0.1');
 assert.equal(rateLimitKey(request,true),'203.0.113.10');
 assert.equal(rateLimitKey({headers:{'x-forwarded-for':'invalid'},ip:'127.0.0.1'},true),'127.0.0.1');
});

test('elevator endpoint validates station before loading and safely reports upstream failure',async()=>{
 let calls=0;
 await withServer({elevatorStatus:async()=>{calls++;throw Error('private upstream diagnostics');}},async base=>{
  const unknown=await fetch(`${base}/api/stations/999999/elevators`);assert.equal(unknown.status,404);assert.equal(calls,0);
  const failure=await fetch(`${base}/api/stations/471/elevators`);assert.equal(failure.status,502);
  const body=await failure.json();assert.equal(body.error,'mta_unavailable');assert.doesNotMatch(JSON.stringify(body),/private upstream/);
 });
});
