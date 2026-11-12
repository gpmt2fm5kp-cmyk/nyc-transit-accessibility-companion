import test from 'node:test';
import assert from 'node:assert/strict';
import { stationElevators, createElevatorService, stationEquipment, createEquipmentService } from './elevator-status.js';
const equipment=[{stationcomplexid:'471',equipmentno:'EL1',equipmenttype:'EL',isactive:'Y'},{stationcomplexid:'151',equipmentno:'EL2',equipmenttype:'EL',isactive:'Y'},{stationcomplexid:'471',equipmentno:'ES1',equipmenttype:'ES',isactive:'Y'}];
const outages=[{equipment:'EL1',equipmenttype:'EL',isupcomingoutage:'N',serving:'Street to mezzanine'},{equipment:'EL1',equipmenttype:'EL',isupcomingoutage:'Y'},{equipment:'EL2',equipmenttype:'EL',isupcomingoutage:'N'}];
test('matches exact station and equipment IDs and separates planned work',()=>{
 const result=stationElevators('471',equipment,outages,'2026-11-12T01:00:00Z');
 assert.equal(result.elevatorCount,1);assert.equal(result.outages.length,1);assert.equal(result.planned.length,1);assert.equal(result.outages[0].serving,'Street to mezzanine');
 assert.equal(stationElevators('427',equipment,outages,'now').elevatorCount,0);
});
test('shares concurrent feed requests, caches for one minute and refuses failed stale refresh',async()=>{
 let calls=0,now=0,fail=false;
 const service=createElevatorService(async url=>{calls++;if(fail)throw Error('offline');return {ok:true,json:async()=>url.includes('equipments')?equipment:outages};},()=>now);
 await Promise.all([service('471'),service('151')]);assert.equal(calls,2);
 now=59_999;await service('471');assert.equal(calls,2);
 now=60_000;fail=true;await assert.rejects(service('471'),/offline/);
});
test('invalid upstream data cannot become a false no-outage result',async()=>{
 const service=createElevatorService(async()=>({ok:true,json:async()=>({unexpected:true})}));
 await assert.rejects(service('471'),/format changed/);
});

test('equipment directory includes escalators, separates upcoming work and never invents zero-match coverage',()=>{
 const result=stationEquipment('471',equipment,[...outages,{equipment:'ES1',equipmenttype:'ES',isupcomingoutage:'N',reason:'Repair'}],'checked');
 assert.equal(result.items.length,2);assert.equal(result.items.find(r=>r.id==='ES1').outage,true);
 assert.equal(result.items.find(r=>r.id==='EL1').reports.filter(r=>r.upcoming).length,1);
 const unmatched=stationEquipment('501',equipment,outages,'checked');assert.equal(unmatched.coverage,'no_matching_equipment');assert.equal(unmatched.items.length,0);
 const planned=stationEquipment('471',equipment,[{equipment:'EL1',equipmenttype:'EL',isupcomingoutage:'Y'}],'checked');assert.equal(planned.items.find(r=>r.id==='EL1').outage,false);
});
test('equipment service rejects failed feeds instead of returning a false clear status',async()=>{
 const service=createEquipmentService(async()=>({ok:false}));await assert.rejects(service('471'),/unavailable/);
});
