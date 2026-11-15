import {readFile,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildStations,parseAccessibleEntrances} from './station-import.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const index=process.argv.indexOf('--source-dir');
const fixtureDir=index<0 ? null : resolve(process.argv[index+1]);
const urls={stations:'https://data.ny.gov/resource/39hk-dx4f.json?$limit=10000&$order=station_id',complexes:'https://data.ny.gov/resource/5f5g-n3cz.json?$limit=10000',entrances:'https://data.ny.gov/resource/i9wp-a4ja.json?$limit=10000','stations-meta':'https://data.ny.gov/api/views/39hk-dx4f.json','complexes-meta':'https://data.ny.gov/api/views/5f5g-n3cz.json','entrances-meta':'https://data.ny.gov/api/views/i9wp-a4ja.json',accessible:'https://www.mta.info/accessibility/stations'};
const documents=Object.fromEntries(await Promise.all(Object.entries(urls).map(async([name,url])=>{
  if(fixtureDir)return [name,await readFile(resolve(fixtureDir,name+(name==='accessible'?'.html':'.json')),'utf8')];
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`MTA source ${name} unavailable; no snapshot replaced`);
  return [name,await response.text()];
})));
const stations=JSON.parse(documents.stations),complexes=JSON.parse(documents.complexes),entrances=JSON.parse(documents.entrances);
if(stations.length<450 || complexes.length<400 || entrances.length<1500)throw Error('Incomplete network import; retain current data');
if(parseAccessibleEntrances(documents.accessible).length<100)throw Error('Accessible entrance page structure changed; retain current data');
const metadata=Object.fromEntries(['stations','complexes','entrances'].map(k=>[k,JSON.parse(documents[k+'-meta'])]));
const notes=JSON.parse(await readFile(resolve(root,'data/station-notes.json'),'utf8'));
const result=buildStations({stations,complexes,entrances,accessibleHtml:documents.accessible,metadata,checkedAt:new Date().toISOString(),notes});
result.report.sourceHashes=Object.fromEntries(Object.entries(documents).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
await writeFile(resolve(root,'data/stations.json.pending'),JSON.stringify(result.dataset,null,2)+'\n');
await rename(resolve(root,'data/stations.json.pending'),resolve(root,'data/stations.json'));
await writeFile(resolve(root,'data/import-report.json'),JSON.stringify(result.report,null,2)+'\n');
console.log(JSON.stringify(result.report,null,2));
