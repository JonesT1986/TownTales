// Fake database used by the tests (no network).
const towns = [{ slug: 'wapella-sk', name: 'Wapella', prov: 'SK', hidden: false }, { slug: 'moose-jaw-sk', name: 'Moose Jaw', prov: 'SK', hidden: false }, { slug: 'baddeck-ns', name: 'Baddeck', prov: 'NS', hidden: false }];
const cems = [
  { id: 'wap-cem-1', town: 'wapella-sk', name: 'Wapella Cemetery', aka: ['Town Cemetery'], location_desc: 'North edge of town, east of Highway 1', affiliation: 'Municipal', status: 'active', managed_by: 'Town of Wapella', source: 'Saskatchewan Genealogical Society cemetery index', source_url: 'https://example.org/sgs' },
  { id: 'wap-cem-2', town: 'wapella-sk', name: 'St. John\'s Anglican Cemetery', aka: [], location_desc: '5 km south', affiliation: 'Anglican', status: 'inactive', managed_by: null, source: 'Wapella history book (1979)', source_url: null },
];
const first = ['John', 'Mary', 'William', 'Margaret', 'James', 'Annie', 'Robert', 'Elizabeth'], last = ['Anderson', 'Brown', 'Campbell', 'Davidson', 'Elliott', 'Fraser', 'Gordon', 'Hamilton', 'Irvine', 'Johnston', 'Kerr', 'MacLeod', 'Nelson', 'Olson', 'Peterson', 'Reid', 'Smith', 'Thompson', 'Wilson', 'Young'];
const mems = [];
for (let i = 0; i < 1304; i++) {
  const by = 1850 + (i % 70), dy = by + 20 + (i % 60);
  mems.push({ id: 'wap-' + String(i + 1).padStart(4, '0'), town: 'wapella-sk', cemetery_id: i % 3 ? 'wap-cem-1' : 'wap-cem-2', cemetery_name: null,
    name: first[i % 8] + ' ' + last[(i * 7) % 20] + (i === 5 ? ' Jr.' : ''), maiden_name: i % 8 === 1 ? last[(i * 3) % 20] : null,
    birth_date_label: i % 11 ? (i % 4 ? String(by) : 'March 3, ' + by) : 'c. ' + by, birth_place: i % 5 ? null : 'Ontario',
    death_date_label: i % 13 ? String(dy) : null, death_place: null, note: i === 0 ? 'Farmed north of town for 40 years. <script>alert(1)</script>' : null,
    tier: i % 10 ? 'documented' : 'community', source: i % 10 ? 'Saskatchewan Genealogical Society cemetery index' : 'Submitted by Jane Doe (granddaughter) — family Bible', source_url: i % 10 ? 'https://example.org/sgs' : null, status: 'published' });
}
const clips = [
  { id: 'c1', town: 'wapella-sk', image_url: 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/clippings/x.jpg', paper_name: 'Wapella Post', date_label: 'June 1952', submitter_name: 'Ellen', description: 'Sports day', transcription: 'WAPELLA SPORTS DAY\nA large crowd gathered…', transcription_status: 'transcribed', moderation: 'approved' },
  { id: 'c2', town: 'wapella-sk', image_url: 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/clippings/y.jpg', paper_name: null, date_label: null, submitter_name: null, description: null, transcription: 'Checked text', transcription_status: 'checked', moderation: 'approved' },
];
const provinces = [{ code: 'SK', overview: 'Settlement followed the railway.\n\nHomesteaders arrived after 1882.', overview_source: 'Encyclopedia of Saskatchewan', overview_source_url: 'https://example.org/esk', topics: [{ title: 'The CPR main line', body: 'Towns were laid out every 10–15 km.', source: 'CPR archives' }, { title: 'No source topic', body: 'should be hidden' }] }];
const town_stats = towns.map((t) => ({ slug: t.slug, items: 0, entries: 1, timeline_status: 'ready', timeline_built_at: '2026-11-01T00:00:00Z' }));
const tables = { town_stats, towns, cemeteries: cems, memorials: mems, clippings: clips, provinces, timeline: [{ town: 'wapella-sk', year: 1882, label: '1882', title: 'Railway arrives', body: 'x', sort: 0 }], items: [] };

function filt(rows, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    const m = v.match(/^(eq|neq)\.(.*)$/); if (!m) continue;
    const val = decodeURIComponent(m[2]);
    rows = rows.filter((r) => { const x = String(r[k]); return m[1] === 'eq' ? x === val : x !== val; });
  }
  return rows;
}
const mockFetch = async (url, opts = {}) => {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  let rows = tables[table];
  if (!rows) return new Response(JSON.stringify({ message: 'relation does not exist' }), { status: 404 });
  rows = filt(rows, u.searchParams);
  if (table === 'memorials' || table === 'clippings') rows = rows.filter((r) => r.status ? r.status === 'published' : true);
  const range = (opts.headers || {}).Range;
  if (range) { const [a, b] = range.split('-').map(Number); rows = rows.slice(a, b + 1); } else rows = rows.slice(0, 1000);
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
};


module.exports = { mockFetch, tables };
