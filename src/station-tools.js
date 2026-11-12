import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const dataset = JSON.parse(readFileSync(new URL('../data/stations.json', import.meta.url), 'utf8'));
const boroughs = ['All', 'Manhattan', 'Bronx', 'Brooklyn', 'Queens'];
export const searchInput = z.object({ query: z.string().trim().max(120).default(''), borough: z.enum(boroughs).default('All') }).strict();
export const stationInput = z.object({ stationId: z.string().trim().min(1).max(80) }).strict();
const normalize = text => text.toLowerCase().normalize('NFKD').replace(/[–—-]/g, ' ').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export function search_stations(input) {
  const { query, borough } = searchInput.parse(input);
  const tokens = normalize(query).split(' ').filter(Boolean);
  return {
    matches: dataset.records.filter(record => {
      const { stationName, borough: area, services } = record.station;
      const haystack = normalize([stationName, area, ...record.aliases, ...services].join(' '));
      return (borough === 'All' || area === borough) && tokens.every(token => haystack.split(' ').some(word => word.startsWith(token)));
    }).map(record => ({ ...record.station, classification: record.adaClassification })),
    coverageNote: dataset.coverageNote,
  };
}
export function get_station_accessibility(input) {
  const { stationId } = stationInput.parse(input);
  const record = dataset.records.find(item => item.station.stationId === stationId);
  if (!record) { const error = new Error('This station is outside the pilot. Choose one of the listed stations.'); error.status = 404; error.code = 'unknown_station'; throw error; }
  return { record };
}
export const tools = { search_stations, get_station_accessibility };
export function demonstrationFor(record) {
  return {
    label: 'Sample outage for demonstration',
    stationId: record.station.stationId,
    scenario: record.adaClassification === 'not_accessible'
      ? 'Imagine a rider needs a step-free exit here. The reference record already lists this station as not ADA accessible. This sample does not invent an elevator or an alternative route.'
      : 'Imagine a street-to-station elevator at this station is unavailable. This is an invented scenario, not a report about any real elevator. The exact path affected has not been established.',
    nextStep: 'For a real trip, check MTA elevator status and ask MTA about a verified accessible alternative. No alternative route has been verified in this demo.',
  };
}
