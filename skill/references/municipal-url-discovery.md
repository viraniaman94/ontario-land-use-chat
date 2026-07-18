# Municipal URL Discovery — Resolved Broken/Missing Links

**Compiled:** 2026-07-07
**Purpose:** Documents the search strings and discovery techniques used to
find OP PDFs for 4 upper-tier municipalities whose URLs were either broken
(redesigned websites) or never catalogued. Future agents can apply the same
techniques when other municipal URLs break.

---

## Discovery Technique Sequence

When a municipal URL is broken or missing, try these in order:

1. **`web_search` with `site:` operator** — `site:domain.ca "official plan"`
   finds the new planning page on a redesigned site.
2. **CivicWeb portal** — `<name>.civicweb.net` hosts PDFs for many Ontario
   municipalities. Search the CivicWeb document list for "official plan".
3. **Browser search** — Navigate to the municipality's homepage and use the
   internal site search. Some sites' search doesn't respond in headless mode
   (e.g., Muskoka), so `web_search` is preferred.
4. **Google `site:` with `filetype:pdf`** —
   `site:domain.ca "official plan" filetype:pdf` sometimes surfaces direct
   PDF links that internal site search doesn't.

---

## 1. Peterborough County (broken URL)

**Old URL (404):** `https://www.ptbocounty.ca/en/county-government/planning.aspx`
**Search string:** `Peterborough County Official Plan PDF site:ptbocounty.ca`

**Result:** Found new planning page at:
`/county-government/departments/planning-and-public-works/planning/official-plan/`

**Resolved URLs:**
- **Consolidated OP (direct PDF):**
  `https://www.ptbocounty.ca/media/0waecu02/planning-county-op-1.pdf`
- **Original adopted OP (direct PDF):**
  `https://www.ptbocounty.ca/media/luoigbz1/planning-county-op.pdf`

**Downloaded as:** `upper-tier/peterborough-county-op.pdf` (2.26 MB) ✅

---

## 2. Haliburton County (no URL catalogued)

**Old URL (404):** `https://www.haliburtoncounty.ca/en/regional-government/planning.aspx`
**Search string:** `Haliburton County Official Plan PDF site:haliburtoncounty.ca`

**Result:** Found new OP page at:
`/county-office/plans-reports-and-studies/official-plan/`

**Resolved URL:**
- **OP Office Consolidation (Feb 12, 2024):**
  `https://www.haliburtoncounty.ca/media/wd4jkw3g/hcop-office-consolidation-february-12-2024.pdf`
- **Schedules A–M, Map 1, Table 1:** 14 separate PDFs available from the
  same page (see `municipal-document-urls.md` for the full list).

**Downloaded as:** `upper-tier/haliburton-county-op-feb-2024-consolidation.pdf` (0.71 MB) ✅

---

## 3. Lennox and Addington County (no URL catalogued)

**Old URL:** `https://www.lennox-addington.on.ca/planning`
**Search string:** `"Lennox and Addington" County Official Plan PDF`

**Result:** Found via CivicWeb portal:
`lennoxandaddington.civicweb.net/document/15477/`

**Resolved URL:**
- **OP By-law with OP and Appendices (2015):**
  `https://lennoxandaddington.civicweb.net/document/15477/Official%20Plan%20By-Law%20with%20OP%20and%20Appendicies%20FINAL.pdf?handle=AD2E5E400DD94E299101727968401380`

**Note:** L&A County is updating its OP ("New Official Plan 2026" project)
via an ArcGIS Experience Builder dashboard. The 2015 OP remains in force
until the new one is approved.

**Downloaded as:** `upper-tier/lennox-addington-county-op-2015.pdf` (18.53 MB) ✅

---

## 4. District Municipality of Muskoka (no URL catalogued)

**Old URL (404):** `https://www.muskoka.on.ca/en/residents/planning.aspx`
**Search string:** `Muskoka District Official Plan PDF 2024 2023 planning policy`
(empty results — Muskoka redesigned their site)
**Second search:** `"muskoka.on.ca" "official plan" planning district`
(found via `muskoka.civicweb.net` and then the new planning page)

**Result:** Found new planning page at:
`/en/business-planning-development/land-use-planning-and-policies.aspx`

**Resolved URL:**
- **MOP June 2025 Consolidation:**
  `https://www.muskoka.on.ca/en/business-planning-development/Planning-Docs-Forms/June-2025-MOP-Consolidation.pdf`

**Note:** Muskoka is undergoing a comprehensive OP review (OPA 61). The
June 2025 consolidation is the current in-force version. Also available via
CivicWeb: `muskoka.civicweb.net/document/30449/`

**Downloaded as:** `upper-tier/muskoka-district-op-june-2025-consolidation.pdf` (53.15 MB) ✅

---

## 5. Hastings County (Cloudflare-blocked)

**Old URL:** `https://hastingscounty.com/sites/default/files/County%20of%20Hastings%20Official%20Plan.pdf`
**Search string:** `"County of Hastings" "Official Plan" filetype:pdf hastingscounty`

**Result:** URL is known but **both curl and browser automation are blocked**
by Cloudflare bot protection (`hastingscounty.com` returns a 'Just a moment...'
challenge page that never resolves in automated sessions).

**Action:** User must manually download via browser and place at:
`documents/upper-tier/hastings-county-op.pdf`

---

## Summary of Techniques

| Municipality | Technique | Worked? |
|---|---|---|
| Peterborough County | `site:` search | ✅ |
| Haliburton County | `site:` search → page extract | ✅ |
| L&A County | web search → CivicWeb portal | ✅ |
| Muskoka District | web search (site:) → page extract | ✅ |
| Hastings County | (all techniques blocked by Cloudflare) | ❌ Manual |

**Lesson:** The `site:` search operator is the most reliable first step.
CivicWeb portals are the best fallback when the main site lacks a planning
page. Cloudflare-protected sites require manual user action.