// Regional landmark icons, one per province/territory, drawn in the same box as the grain elevator
// on the homepage train line (viewBox 0 0 46 170, ground at y=168, flagpole at x=23).
// Each entry: [top of the landmark (where the flagpole meets it), SVG shapes].
// SK, AB and MB keep the grain elevator. Original drawings (generic landmarks, no logos).
const K = '#1E2930'; // outline ink
const S = `stroke='${K}' stroke-width='2' stroke-linejoin='round'`;
const WATER = `<path d='M-4 166q6-3 12 0t12 0t12 0t12 0t12 0' fill='none' stroke='#2B5C80' stroke-width='2'/>`;

const ICONS = {
  // British Columbia: a tall conifer
  BC: [104, `<rect x='19' y='158' width='8' height='10' fill='#6D4B30' ${S}/><path d='M23 104L9 126h7L4 144h9L-1 162h48L33 144h9L30 126h7z' fill='#2F5D3A' ${S}/>`],
  // Ontario: a loon on the water
  ON: [146, `<path d='M-4 158h54' stroke='#2B5C80' stroke-width='3'/>${WATER}<path d='M3 157C6 147 22 144 34 149L36 157z' fill='${K}'/><path d='M31 150C31 143 33 137 38 137C42 137 44 140 44 142L50 143L44 145C42 146 38 147 36 152z' fill='${K}'/><circle cx='40.2' cy='140.4' r='1.4' fill='#C8102E'/><g fill='#FFFCF3'><circle cx='10' cy='153' r='1.1'/><circle cx='14' cy='150.5' r='1.1'/><circle cx='18' cy='153' r='1.1'/><circle cx='22' cy='150' r='1.1'/><circle cx='26' cy='152.5' r='1.1'/></g><path d='M33.5 146.5l4.5-1.2' stroke='#FFFCF3' stroke-width='1.3'/>`],
  // Quebec: a fleur-de-lis on a stone pedestal
  QC: [112, `<rect x='9' y='152' width='28' height='16' fill='#A1A7AD' ${S}/><g fill='#2B5C80' ${S}><path d='M23 112C30 122 30 132 23 140C16 132 16 122 23 112z'/><path d='M21 137C12 139 5 129 12 122C13 130 17 133 21 133z'/><path d='M25 137C34 139 41 129 34 122C33 130 29 133 25 133z'/><rect x='13' y='138' width='20' height='4.5'/><path d='M17 142.5L23 151L29 142.5z'/></g>`],
  // New Brunswick: a red covered bridge
  NB: [124, `<rect x='-2' y='158' width='50' height='4' fill='#6D4B30' ${S}/>${WATER}<rect x='0' y='136' width='46' height='22' fill='#B4512C' ${S}/><path d='M5 139v16M41 139v16' stroke='#8F3E1F' stroke-width='1.6'/><path d='M14 158v-13a9 9 0 0 1 18 0v13z' fill='${K}'/><path d='M-3 137L23 124L49 137z' fill='#6D4B30' ${S}/>`],
  // Nova Scotia: a lighthouse on the rocks
  NS: [93, `<path d='M2 168l4-7h9l3 4h11l4-5h9l4 8z' fill='#7A7F86' ${S}/><path d='M15 166L18 112h10L31 166z' fill='#FFFCF3' ${S}/><path d='M16.6 146h12.8l.9 12H15.7z' fill='#C8102E'/><path d='M17.6 122h10.8l.6 10H17z' fill='#C8102E'/><path d='M15 166L18 112h10L31 166z' fill='none' ${S}/><rect x='14' y='108' width='18' height='4' fill='${K}'/><rect x='17' y='100' width='12' height='8' fill='#E3B34A' ${S}/><path d='M15 100L23 93L31 100z' fill='#C8102E' ${S}/>`],
  // Prince Edward Island: a white farmhouse with green gables
  PE: [118, `<rect x='31' y='121' width='5' height='13' fill='#B4512C' ${S}/><rect x='4' y='138' width='38' height='30' fill='#FFFCF3' ${S}/><path d='M0 140L23 118L46 140z' fill='#4F7334' ${S}/><path d='M16 150L23 142L30 150z' fill='#4F7334' ${S}/><rect x='19' y='154' width='8' height='14' fill='#4F7334' ${S}/><rect x='7' y='147' width='7' height='8' fill='#D9E8EF' stroke='#4F7334' stroke-width='1.8'/><rect x='32' y='147' width='7' height='8' fill='#D9E8EF' stroke='#4F7334' stroke-width='1.8'/>`],
  // Newfoundland and Labrador: an iceberg
  NL: [112, `<path d='M4 152L10 167H37L44 152z' fill='#B9D6E7'/><path d='M2 152L10 132L16 136L24 112L32 128L38 124L46 152z' fill='#FFFFFF' ${S}/><path d='M24 112L27 152H21z M10 132L14 152H8z' fill='#D9E8EF'/><path d='M2 152L10 132L16 136L24 112L32 128L38 124L46 152' fill='none' ${S}/><path d='M-4 152h54' stroke='#2B5C80' stroke-width='2.4'/>${WATER}`],
  // Yukon: stacked gold bars
  YT: [144, `<g fill='#E3B34A' ${S}><path d='M0 168l4-12h16l4 12z'/><path d='M22 168l4-12h16l4 12z'/><path d='M11 156l4-12h16l4 12z'/></g><path d='M6 159h12M28 159h12M17 147h12' stroke='#F6D27A' stroke-width='1.6' stroke-linecap='round'/>`],
  // Northwest Territories: an inukshuk
  NT: [92, `<g fill='#A1A7AD' ${S}><rect x='9' y='138' width='9' height='30' rx='2'/><rect x='28' y='138' width='9' height='30' rx='2'/><rect x='4' y='124' width='38' height='14' rx='3'/><rect x='17' y='102' width='12' height='22' rx='2'/><rect x='15' y='92' width='16' height='10' rx='3'/></g>`],
  // Nunavut: an igloo
  NU: [132, `<path d='M2 168A21 36 0 0 1 44 168z' fill='#FFFFFF' ${S}/><path d='M4 157h38M8 146h30M14 138h18' stroke='#A1A7AD' stroke-width='1.5'/><path d='M12 168v-11M23 157v-11M34 168v-11M17 146v-8M29 146v-8' stroke='#A1A7AD' stroke-width='1.5'/><path d='M29 168v-7a6 6 0 0 1 12 0v7z' fill='${K}'/>`],
};

const ELEVATOR = [52, `<g transform='translate(0,50)'><path d='M8 118V30L23 12l15 18v88z' fill='#B4512C' ${S}/><path d='M17 12h12V2H17z' fill='#B4512C' ${S}/><rect x='13' y='44' width='20' height='10' fill='#FFFCF3' stroke='${K}' stroke-width='1.6'/></g>`];

// A standalone icon (no flag) for page headings and cards.
function regionIcon(code, cls) {
  const [top, shapes] = ICONS[code] || ELEVATOR;
  const y = top - 6;
  return `<svg class="${cls || 'pv-icon'}" viewBox="-6 ${y} 58 ${172 - y}" aria-hidden="true">${shapes.replace(/'/g, '"')}</svg>`;
}

module.exports = { ICONS, ELEVATOR, regionIcon };
