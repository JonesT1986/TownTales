# Loading RM data (for Travis's assistant)

RM pages show only what's loaded here. Three CSV files, imported in this order in Supabase
(Table Editor → pick the table → Insert → Import data from CSV). The example row in each file shows the format; delete it before importing real data.

## 1. `rms` — one row per RM
| Column | Required | Notes |
|---|---|---|
| `slug` | Yes | Lower-case name, number, province: `martin-122-sk`. Manitoba (no numbers): `rockwood-mb`. Never change it once live (it's the page address `/rm/<slug>`). |
| `name` | Yes | Just the name: `Martin`. |
| `number` | SK only | `122`. Leave blank elsewhere. |
| `prov` | Yes | `SK`, `MB`, `AB` … |
| `kind_label` | Yes | `Rural Municipality` (shows as "RM of Martin No. 122"). For others: `County`, `Municipal District` → "County of …". |
| `full_name` | No | Only if the name reads oddly otherwise, e.g. `County of Vermilion River`. |
| `office_town` | No | Town slug where the RM office is/was (must already be on TownTales). |
| `est`, `est_label` | No | Year formed (`1913`) and how the date reads (`January 13, 1913`). |
| `intro` | No | Short history of the RM, a few paragraphs (blank line between). **Only shown when `intro_source` is filled.** |
| `intro_source`, `intro_source_url` | With intro | Where the intro comes from. |
| `hidden` | Yes | `false`. Set `true` to take a page down. |

## 2. `rm_town_links` — which RM each town is in
Two columns: `town` (TownTales slug, e.g. `wapella-sk`) and `rm` (RM slug). Importing it fills in each town's RM automatically
and the town page shows "Part of the RM of …". A town not on TownTales yet will be refused; add it first or leave it as a hamlet in step 3.

## 3. `rm_places` — hamlets, ghost towns, country schools, churches, post offices, rural cemeteries
| Column | Required | Notes |
|---|---|---|
| `external_id` | Yes | Your own id, e.g. `martin-122-sk:school:earlswood`. Must be unique: importing the same id twice is refused, so fix a row by editing it in the table. |
| `rm` | Yes | RM slug. |
| `kind` | Yes | One of `hamlet`, `ghost_town`, `school`, `church`, `post_office`, `cemetery`, `other`. |
| `name` | Yes | `Earlswood School District No. 1204`. |
| `years_label`, `location_desc`, `note` | No | `1905–1960`, `10 km north of Wapella`, a sentence or two. |
| `town` | No | Slug, only if the place also has its own TownTales page. |
| `tier` | Yes | `documented` (from records) or `community` (local memory). |
| `source` | Yes | Shown publicly. |
| `source_url`, `sort` | No | `sort` 0 is fine. |
| `status` | Yes | `published` (or `hidden`). |

Same rules as the rest of TownTales: every row has a source, nothing copied word-for-word from copyrighted books.
History only: no council, taxes, services or current RM business.

Town cemeteries already on TownTales show on the RM page automatically; only add `cemetery` rows for country cemeteries that aren't already a town's.
