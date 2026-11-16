// Shared: loads the live list of public towns from the TownTales database (anon key is public by design; RLS limits it to visible towns).
const SB = 'https://zpqwrzsgpwwjrlbnfynn.supabase.co';
const KEY = 'sb_publishable_j_Vw3H_ebMP7WL4uZwRowQ_u-DX37QU';
const PROVS = { SK: 'Saskatchewan', MB: 'Manitoba', AB: 'Alberta', BC: 'British Columbia', ON: 'Ontario', QC: 'Quebec', NB: 'New Brunswick', NS: 'Nova Scotia', PE: 'Prince Edward Island', NL: 'Newfoundland and Labrador', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' };

let cache = { at: 0, towns: null };
async function getTowns() {
  if (cache.towns && Date.now() - cache.at < 5 * 60 * 1000) return cache.towns;
  try {
    const r = await fetch(`${SB}/rest/v1/towns?select=slug,name,prov&hidden=eq.false&order=slug`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) throw new Error('towns ' + r.status);
    const rows = await r.json();
    cache = { at: Date.now(), towns: Object.fromEntries(rows.map((t) => [t.slug, { name: t.name, prov: PROVS[t.prov] || t.prov }])) };
  } catch (e) {
    if (!cache.towns) throw e;
  }
  return cache.towns;
}
module.exports = { getTowns };
