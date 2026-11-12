export const equipmentUrl = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene_equipments.json';
export const outagesUrl = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json';

export function stationElevators(stationId, equipment, outages, checkedAt) {
  const elevators = equipment.filter(row => row.equipmenttype === 'EL' && String(row.stationcomplexid) === String(stationId) && row.isactive === 'Y');
  const ids = new Set(elevators.map(row => row.equipmentno));
  const reports = outages.filter(row => row.equipmenttype === 'EL' && ids.has(row.equipment)).map(row => ({
    equipmentId: row.equipment, serving: row.serving || 'Location not supplied', reason: row.reason || 'Reason not supplied',
    startsAt: row.outagedate || null, estimatedReturn: row.estimatedreturntoservice || null, upcoming: row.isupcomingoutage === 'Y'
  }));
  return { stationId, checkedAt, elevatorCount: elevators.length, outages: reports.filter(row => !row.upcoming), planned: reports.filter(row => row.upcoming), sourceUrl: 'https://www.mta.info/elevator-escalator-status' };
}

export function stationEquipment(stationId, equipment, outages, checkedAt) {
  const items = equipment.filter(row => ['EL', 'ES'].includes(row.equipmenttype) && String(row.stationcomplexid) === String(stationId) && row.isactive === 'Y').map(row => {
    const reports = outages.filter(report => report.equipment === row.equipmentno && report.equipmenttype === row.equipmenttype).map(report => ({
      upcoming: report.isupcomingoutage === 'Y', reason: report.reason || 'Reason not supplied',
      startsAt: report.outagedate || null, estimatedReturn: report.estimatedreturntoservice || null,
      serving: report.serving || row.serving || 'Location not supplied'
    }));
    return { id: row.equipmentno, type: row.equipmenttype, station: row.station || '', serving: row.serving || 'Location not supplied', short: row.shortdescription || '', lines: row.linesservedbyelevator || row.trainno || '', outage: reports.some(report => !report.upcoming), reports };
  });
  return { stationId, checkedAt, items, coverage: items.length ? 'matched_equipment' : 'no_matching_equipment', sourceUrl: 'https://www.mta.info/elevator-escalator-status' };
}

function createFeedService(format, fetcher, clock) {
  let cached, pending;
  async function load() {
    const rows = await Promise.all([equipmentUrl, outagesUrl].map(async url => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('MTA feed unavailable');
      return response.json();
    }));
    const [equipment, outages] = rows;
    if (!Array.isArray(equipment) || !equipment.length || !equipment.every(row => row && typeof row.equipmentno === 'string' && typeof row.stationcomplexid === 'string' && typeof row.equipmenttype === 'string') || !Array.isArray(outages) || !outages.every(row => row && typeof row.equipment === 'string' && typeof row.equipmenttype === 'string' && ['Y','N'].includes(row.isupcomingoutage))) throw new Error('MTA feed format changed');
    cached = { equipment, outages, fetchedAt: clock() };
    return cached;
  }
  return async stationId => {
    if (!cached || clock() - cached.fetchedAt >= 60_000) {
      if (!pending) pending = load().finally(() => { pending = null; });
      await pending; // Never present an expired cache as a fresh successful check.
    }
    return format(stationId, cached.equipment, cached.outages, new Date(cached.fetchedAt).toISOString());
  };
}

export function createElevatorService(fetcher = fetch, clock = () => Date.now()) {
  return createFeedService(stationElevators, fetcher, clock);
}

export function createEquipmentService(fetcher = fetch, clock = () => Date.now()) {
  return createFeedService(stationEquipment, fetcher, clock);
}
