// Fake database used by the tests (no network).
const towns = [{ slug: 'wapella-sk', name: 'Wapella', prov: 'SK', hidden: false }, { slug: 'moose-jaw-sk', name: 'Moose Jaw', prov: 'SK', hidden: false }, { slug: 'baddeck-ns', name: 'Baddeck', prov: 'NS', hidden: false }];
const cems = [
  { id: 'wap-cem-1', town: 'wapella-sk', name: 'Wapella Cemetery', aka: ['Town Cemetery'], location_desc: 'North edge of town, east of Highway 1', affiliation: 'Municipal', status: 'active', managed_by: 'Town of Wapella', source: 'Saskatchewan Genealogical Society cemetery index', source_url: 'https://example.org/sgs' },
  { id: 'wap-cem-3', town: 'wapella-sk', name: 'Buck Cemetery', aka: [], source: 'x' }, { id: 'wap-cem-4', town: 'wapella-sk', name: 'Earlswood Cemetery', aka: [], source: 'x' }, { id: 'wap-cem-5', town: 'wapella-sk', name: 'St. Paul\'s Cemetery', aka: [], source: 'x' }, { id: 'wap-cem-6', town: 'wapella-sk', name: 'Wapella Jewish Cemetery', aka: [], source: 'x' },
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
const teams = [
  { id: 't1', town: 'wapella-sk', name: 'Wapella Red Sox', sport: 'Baseball', league: 'Qu\'Appelle Valley League', years_label: 'c. 1920s–1960s', home_venue: 'Wapella sports grounds', championships: ['1952 league champions', { year: '1958', title: 'Provincial intermediate B' }], note: 'Played Sunday doubleheaders.', tier: 'documented', source: 'Wapella history book (1979), p. 212', source_url: null, status: 'published' },
  { id: 't2', town: 'wapella-sk', name: 'Wapella Wolves', sport: 'Hockey', league: null, years_label: '1948–1972', home_venue: 'Wapella Rink', championships: [], note: null, tier: 'community', source: 'Recollection of J. Smith', source_url: null, status: 'published' },
];
const athletes = [{ id: 'a1', town: 'wapella-sk', name: 'Test Athlete', sport: 'Hockey', level: 'NHL', connection: 'Born in Wapella', teams_label: 'Test Team A, Test Team B', years_label: '1990s–2000s', achievements: ['Test highlight'], note: null, tier: 'documented', source: 'Test source', source_url: null, status: 'published' }];
const tables = { athletes, teams, town_stats, towns, cemeteries: cems, memorials: mems, clippings: clips, provinces, timeline: [
  {"town": "wapella-sk", "year": 1874, "label": "September 1874", "title": "Treaty 4 signed at Fort Qu'Appelle", "body": "", "sort": 0},
  {"town": "wapella-sk", "year": 1882, "label": "1882", "title": "The CPR main line reaches Wapella", "body": "", "sort": 1},
  {"town": "wapella-sk", "year": 1883, "label": "1883", "title": "Scottish settlement founded south of town", "body": "", "sort": 2},
  {"town": "wapella-sk", "year": 1883, "label": "Nov. 1, 1883 (reported)", "title": "Post office reportedly opens", "body": "", "sort": 3},
  {"town": "wapella-sk", "year": 1885, "label": "1885 or 1886", "title": "First school district, Wapella #11", "body": "", "sort": 4},
  {"town": "wapella-sk", "year": 1886, "label": "1886", "title": "Jewish farm colony founded northeast of town", "body": "", "sort": 5},
  {"town": "wapella-sk", "year": 1889, "label": "1889", "title": "Rabbi Edel Brotman takes up a homestead", "body": "", "sort": 6},
  {"town": "wapella-sk", "year": 1889, "label": "1889", "title": "The Bronfman family arrives in Wapella", "body": "", "sort": 7},
  {"town": "wapella-sk", "year": 1890, "label": "c. 1890", "title": "A small railway village takes shape", "body": "", "sort": 8},
  {"town": "wapella-sk", "year": 1898, "label": "1898", "title": "Jewish colony opens its own school", "body": "", "sort": 9},
  {"town": "wapella-sk", "year": 1901, "label": "1901", "title": "The Commercial Hotel is built", "body": "", "sort": 10},
  {"town": "wapella-sk", "year": 1901, "label": "1901", "title": "Frost destroys crops; farmers turn to JCA loans", "body": "", "sort": 11},
  {"town": "wapella-sk", "year": 1903, "label": "1903", "title": "Wapella incorporated as a town", "body": "", "sort": 12},
  {"town": "wapella-sk", "year": 1903, "label": "1903", "title": "CPR branch line opens up the district", "body": "", "sort": 13},
  {"town": "wapella-sk", "year": 1907, "label": "1906-1907", "title": "Old Town Hall designed and completed", "body": "", "sort": 14},
  {"town": "wapella-sk", "year": 1910, "label": "1910", "title": "First steam threshing outfit among Jewish farmers", "body": "", "sort": 15},
  {"town": "wapella-sk", "year": 1913, "label": "January 13, 1913", "title": "RM of Martin No. 122 incorporated", "body": "", "sort": 16},
  {"town": "wapella-sk", "year": 1921, "label": "1921", "title": "Farmers prosecuted under the Lord's Day Act", "body": "", "sort": 17},
  {"town": "wapella-sk", "year": 1924, "label": "1924", "title": "Wapella baseball team's near-perfect season", "body": "", "sort": 18},
  {"town": "wapella-sk", "year": 1930, "label": "1930s", "title": "Ten dry years in the Depression", "body": "", "sort": 19},
  {"town": "wapella-sk", "year": 1943, "label": "1943-1944", "title": "The Wapella Post weekly newspaper", "body": "", "sort": 20},
  {"town": "wapella-sk", "year": 1979, "label": "1979", "title": "Mingling Memories published", "body": "", "sort": 21},
  {"town": "wapella-sk", "year": 2017, "label": "September 2017", "title": "Grain elevator sold; rail switch reconnected", "body": "", "sort": 22}
], items: Array.from({ length: 26 }, (_, i) => ({ id: 'i' + i, town: 'wapella-sk', status: 'published' })) };

function filt(rows, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (k === 'or') {
      const conds = v.replace(/^\(|\)$/g, '').split(',').map((c) => c.split('.'));
      rows = rows.filter((r) => conds.some(([col, op, ...rest]) => op === 'ilike' && String(r[col] || '').toLowerCase().includes(decodeURIComponent(rest.join('.')).replace(/\*/g, '').toLowerCase())));
      continue;
    }
    const m = v.match(/^(eq|neq)\.(.*)$/); if (!m) continue;
    const val = decodeURIComponent(m[2]);
    rows = rows.filter((r) => { const x = String(r[k]); return m[1] === 'eq' ? x === val : x !== val; });
  }
  return rows;
}
// Honour Pages (Nov 21): wap-0001 is honoured; m-pend1 is a family submission still waiting for review.
tables.honour_pages = [
  { id: 'hp_aaaaaaaaaaaaaaaaaaaaaaaa', memorial_id: 'wap-0001', town: 'wapella-sk', status: 'published', placed_by: 'The Anderson family', published_at: '2026-11-21T12:00:00Z',
    story: 'John came west on the CPR in 1882 with two oxen and a plough.\n\nHe farmed north of town for forty years, sang bass in the church choir, and never missed a Sports Day. <b>not bold</b>',
    photos: [{ url: 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/honour/wap-0001/a.jpg', caption: 'John and Mary, 1910' }, { url: 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/honour/wap-0001/b.jpg', caption: 'Harvest, 1948' }, { url: 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/honour/wap-0001/c.jpg', caption: null }] },
];
const pendingMem = { id: 'm-pend1', town: 'wapella-sk', name: 'Agnes Fraser', birth_date_label: '1901', death_date_label: '1988', status: 'pending' };
const mockFetch = async (url, opts = {}) => {
  const u = new URL(url);
  const table = u.pathname.split('/').pop();
  if (table === 'honour_target') {
    const id = u.searchParams.get('p_id');
    const m = id === pendingMem.id ? pendingMem : tables.memorials.find((x) => x.id === id && x.status === 'published');
    const out = m ? { id: m.id, town: m.town, name: m.name, maiden_name: m.maiden_name || null, birth_date_label: m.birth_date_label, death_date_label: m.death_date_label, status: m.status,
      honoured: tables.honour_pages.some((h) => h.memorial_id === m.id && h.status === 'published') } : { id: null };
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  let rows = tables[table];
  if (!rows) return new Response(JSON.stringify({ message: 'relation does not exist' }), { status: 404 });
  rows = filt(rows, u.searchParams);
  if (table === 'memorials' || table === 'clippings') rows = rows.filter((r) => r.status ? r.status === 'published' : true);
  const range = (opts.headers || {}).Range;
  if (range) { const [a, b] = range.split('-').map(Number); rows = rows.slice(a, b + 1); } else rows = rows.slice(0, 1000);
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
};


// Whitewood: the real Oct 20 problem report (timeline card "Read" + "From the archive" link).
towns.push({ slug: 'whitewood-sk', name: 'Whitewood', prov: 'SK', hidden: false });
town_stats.push({ slug: 'whitewood-sk', items: 1, entries: 2, timeline_status: 'ready', timeline_built_at: '2026-11-01T00:00:00Z' });
tables.items.push({ id: '568f3cdc-c042-4c15-a5b5-275cc5f7a05a', town: 'whitewood-sk', kind: 'document', title: 'First Agricultural Fair', body: 'The first Agricultural Fair was held in 1884 and the Presbyterian congregation was organized the same year.', year: 1884, date_label: '1884', image_url: '', source: 'Saskatchewan History', source_url: 'https://www.saskhistory.ca/whitewood-town-of/', contributor: 'TownTales research', origin: 'muse', status: 'published', created_at: '2026-10-01T00:00:00Z' });
tables.timeline.push({ id: 'ww-1', town: 'whitewood-sk', year: 1884, label: '1884', title: 'First Agricultural Fair; Presbyterians organize', body: 'The first Agricultural Fair was held in 1884. The Presbyterian congregation was organized the same year.', cat: 'Churches', tier: 'documented', item_ids: ['568f3cdc-c042-4c15-a5b5-275cc5f7a05a'], cite: '', sort: 0 });
tables.timeline.push({ id: 'ww-2', town: 'whitewood-sk', year: 1905, label: 'September 1, 1905', title: 'Saskatchewan becomes a province', body: 'Whitewood becomes part of the new province.', cat: 'Events', tier: 'documented', item_ids: ['568f3cdc-c042-4c15-a5b5-275cc5f7a05a'], cite: 'p. 27', sort: 1 });

// Real McFadyen records from the live site, for the family report preview.
try { const real = require('./data/mcfadyen.json'); tables.memorials.push(...real.memorials); tables.cemeteries.push(...real.cemeteries); } catch (e) {}
module.exports = { mockFetch, tables };
