import test from 'node:test';
import assert from 'node:assert/strict';
import { stationElevators, createElevatorService } from './elevator-status.js';
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
