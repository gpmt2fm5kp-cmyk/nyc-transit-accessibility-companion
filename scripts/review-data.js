// Read-only check. Never replaces the curated entrance notes or stamps an unreviewed snapshot.
import { dataset } from '../src/station-tools.js';
const response = await fetch('https://data.ny.gov/resource/39hk-dx4f.json?$limit=1000');
if (!response.ok) throw new Error('MTA source is unavailable; retain the existing snapshot.');
const latest = await response.json();
const changes = [];
for (const record of dataset.records) for (const platform of record.platforms) {
  const source = latest.find(row => row.gtfs_stop_id === platform.id);
  if (!source) { changes.push(`${platform.id}: source record missing`); continue; }
  const classification = { '0':'not_accessible', '1':'fully_accessible', '2':'partially_accessible' }[source.ada];
  if (classification !== platform.classification || source.daytime_routes !== platform.services.join(' ')) changes.push(`${platform.id}: classification or services changed; manual review needed`);
  const flags = [source.ada_northbound, source.ada_southbound].map(flag => ({ '0':'no','1':'yes' }[flag] || 'unknown'));
  if (flags.some((flag,index) => flag !== platform.directions[index].stepFree)) changes.push(`${platform.id}: direction flags changed; manual review needed`);
}
console.log(changes.length ? changes.join('\n') : 'No accessibility or service-list differences found in pilot platform records. Entrance references still require manual review.');
console.log('No files changed. This does not refresh or verify the saved snapshot.');
