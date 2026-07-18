---
name: ontario-land-use-feasibility
description: "Assess land use planning feasibility for projects in Ontario within 150km of Peterborough. Reviews conformity with the Provincial Planning Statement 2024, provincial plans, municipal official plans, and zoning by-laws. Generates a structured feasibility report with citations."
version: 1.1.0
author: Aman
platforms: [linux, macos]
metadata:
  hermes:
    tags: [ontario, land-use-planning, feasibility, planning, zoning, official-plan, pps]
    category: productivity
    requires_toolsets: [file, search, web]
---

# Ontario Land Use Planning Feasibility Assessment

Assess whether a proposed development project is feasible under Ontario's
land use planning framework. Reviews provincial policy, provincial plans,
municipal official plans, and zoning by-laws to produce a structured
feasibility report with citations.

## When to Use

- User provides a project description for a site in Ontario (within 150km
  of Peterborough) and asks whether it's feasible
- User asks for a planning conformity review
- User asks "can I build X on this property?"
- User asks for a zoning analysis or official plan check

## Architecture

This skill follows a **local-document-knowledge-base** architecture:
- Documents are downloaded as PDFs/HTML files under `documents/` (organized
  by tier: `provincial/`, `upper-tier/`, `lower-tier/`, `zoning/`)
- The skill body (this SKILL.md) IS the analysis engine — there is no
  separate RAG system, vector store, or external service
- The agent reads documents directly from disk using `read_file` or
  `web_extract` (for PDFs) and reasons through the 10-step procedure below
- The feasibility report is generated from `templates/feasibility-report.md`
- See `references/regulatory-framework.md` for the full Ontario planning
  hierarchy and compliance standards
- See `references/bill17-changes.md` for detailed Bill 17 (2025) amendments
- See `references/existing-ai-tools.md` for a survey of comparable tools
- See `references/peterborough-research-notes.md` for confirmed context
  sources and research techniques for the City of Peterborough
- See `references/municipal-url-discovery.md` for resolved broken/missing
  municipal OP URLs and the search techniques used to find them
- Run `python3 scripts/verify-downloads.py` to verify all downloaded
  documents are valid PDFs (not Cloudflare challenge pages or error HTML)

### Next.js Web App (Agent Layer)

A Next.js web app at `/Users/amanv/Projects/ontario-land-use-chat`
operationalizes this skill as a chat-based AI agent. The agent layer
lives under `lib/agent/` and consists of three modules:

- `document-service.ts` — reads PDFs/HTML from this skill's `documents/`
  directory with path traversal protection, in-memory caching, and 50K
  character truncation. Uses `pdf-parse` v2 for PDF text extraction.
- `system-prompt.ts` — builds the system prompt from this SKILL.md +
  the document index + the report template + 10 critical rules.
- `tools.ts` — three AI SDK (`ai@7`) tools (`readDocument`,
  `listDocuments`, `searchDocuments`) using `tool()` with Zod v4
  `inputSchema` for parameter validation.

See `references/web-app-agent-layer.md` for the full architecture,
code patterns, and the pdf-parse v2 API details.

## Document Knowledge Base

All planning documents are stored locally under `documents/`. An index of
every document is maintained in `documents/document-index.md` — **always
read this index first** to know what documents are available.

### Provincial Documents (downloaded)

| Document | File | Format |
|----------|------|--------|
| PPS 2024 | `documents/provincial/pps-2024.pdf` | PDF (6.5MB) |
| Greenbelt Plan | `documents/provincial/greenbelt-plan.pdf` | PDF (7.8MB) |
| Oak Ridges Moraine Conservation Plan | `documents/provincial/oak-ridges-moraine-conservation-plan.pdf` | PDF (6.5MB) |
| Niagara Escarpment Plan | `documents/provincial/niagara-escarpment-plan.pdf` | PDF (5.6MB) |
| Planning Act | `documents/provincial/planning-act-ontario.html` | HTML (910KB) |
| Bill 17 (2025) | `documents/provincial/bill-17-2025.html` | HTML (61KB) |

### Municipal Documents (partially downloaded)

Municipal official plans and zoning by-laws are stored under
`documents/upper-tier/`, `documents/single-tier/`, `documents/zoning/`,
and `documents/lower-tier/`. Check `documents/document-index.md` for the
current inventory and `documents/municipal-document-urls.md` for direct
PDF source URLs (12 municipalities catalogued). The list of municipalities
within the 150km operating radius is in
`documents/municipalities-radius.md`.

As of July 2026, **all 41 target documents** are downloaded (269 MB):
- All 7 upper-tier OPs including Hastings County (3-part PDF — see pitfall
  below)
- All 5 single-tier OPs + key schedules (Peterborough, Kawartha Lakes,
  Quinte West, Belleville, Prince Edward County)
- Zoning by-laws for Peterborough (14 sections + special districts),
  Quinte West, Belleville, and Prince Edward County

Lower-tier OPs and zoning by-laws are downloaded on demand when a project
is in a two-tier municipality (e.g., Cobourg, Port Hope, Clarington).

### Document Hierarchy

Ontario's planning framework is hierarchical. Every feasibility assessment
must check the project against each applicable layer, in order:

| Layer | Documents | Compliance Standard | Location |
|-------|-----------|-------------------|----------|
| 1. Provincial | PPS 2024, Bill 17 | "Consistent with" | `documents/provincial/` |
| 2. Provincial Plans | Greenbelt, ORMCP, NEP | "Conform or not conflict" | `documents/provincial/` |
| 3. Upper-tier OP | County/Regional Official Plan | "Conform to" | `documents/upper-tier/` |
| 4. Lower-tier OP | Municipal Official Plan | "Conform to" | `documents/lower-tier/` |
| 5. Zoning By-law | Municipal Zoning By-law | "Comply with" | `documents/zoning/` |

**Province-wide documents** (PPS 2024, Planning Act) apply to ALL projects.
**Provincial plans** apply only if the site is within their geographic area.
**Upper-tier and lower-tier documents** apply based on the site's municipality.

## Assessment Procedure

When a user provides a project for feasibility assessment, follow these
steps in order. Each step must be completed before moving to the next.

### Step 1: Gather Project Information

Collect or confirm the following from the user:

**Required:**
- Site location (address, lot/concession, or legal description)
- Municipality (lower-tier and upper-tier if applicable)
- Proposed land use (residential, commercial, industrial, institutional,
  mixed-use, agricultural, etc.)
- Project scale (number of units, building height, lot area, density)

**Helpful if available:**
- Current land use designation (from official plan)
- Current zoning
- Site plan or concept
- Environmental features on or near the site
- Precedent studies or prior approvals on the site

If any required information is missing, ask the user before proceeding.
Do not guess or fabricate site details.

### Step 2: Identify Applicable Planning Context

Using the site's location, determine:

1. **Municipality**: Which lower-tier and upper-tier municipality is the
   site in? Check `documents/municipalities-radius.md` for the list of
   municipalities within the 150km operating area.

2. **Provincial plans**: Is the site within any of these areas?
   - Greenbelt Plan area
   - Oak Ridges Moraine Conservation Plan area
   - Niagara Escarpment Plan area
   - Growth Plan for Northern Ontario area

   If unsure, use web_search to check the site's location against
   provincial plan boundaries.

3. **Conservation authority**: Is the site within a conservation authority
   regulated area? (relevant for environmental constraints)

4. **Available documents**: Check `documents/document-index.md` to see
   which documents we have for this municipality. If we don't have the
   relevant official plan or zoning by-law, note the gap and check if
   the document URL is listed in `documents/municipal-document-urls.md`
   — if so, download it first. If not, search for it online.

### Step 3: PPS 2024 Consistency Analysis

Read the PPS 2024 from `documents/provincial/pps-2024.pdf`. The PPS is
the province-wide policy document. Key policy areas to check:

1. **Settlement areas** (Section 1.1.1): Is the site within a settlement
   area? Is the proposed use appropriate for the area?
2. **Housing** (Section 1.2): Does the project provide a range of housing
   options? Market and affordable housing?
3. **Economic development** (Section 1.3): If commercial/industrial, does
   it support economic development goals?
4. **Infrastructure** (Section 1.4): Is there adequate water, sewer,
   roads, and other infrastructure?
5. **Natural heritage** (Section 2.1): Are there natural features on or
   adjacent to the site (wetlands, woodlands, habitat)?
6. **Agriculture** (Section 2.2): Is the site on prime agricultural land?
   Does the project conflict with agricultural operations?
7. **Mineral aggregates** (Section 2.3): Is the site in an aggregate
   resource area?
8. **Water** (Section 2.4): Are there water resources to protect?
9. **Cultural heritage** (Section 2.5): Are there heritage features?
10. **Natural hazards** (Section 3.1): Is the site in a flood plain,
    erosion hazard area, or other natural hazard area?
11. **Human-made hazards** (Section 3.2): Are there contaminated sites,
    abandoned mines, or other human-made hazards?

For each applicable policy:
- Quote the relevant policy number and text
- Assess whether the project is consistent with it
- Note any conflicts or concerns
- If the policy doesn't apply, state "Not applicable — reason"

### Step 4: Provincial Plan Conformity (if applicable)

Only complete this step if the site is within a provincial plan area
(Greenbelt, ORMCP, NEP). If no provincial plans apply, skip this step.

For each applicable provincial plan:
1. Identify the relevant designations and policies for the site
2. Assess conformity (stricter standard than PPS — must "conform" or
   "not conflict")
3. Note any constraints or required studies

### Step 5: Official Plan Conformity Analysis

Read the applicable official plan(s) from `documents/`. If both an
upper-tier and lower-tier OP exist, check both — the lower-tier OP must
conform to the upper-tier OP.

1. **Land use designation**: What is the site's designation in the OP?
   - Is the proposed use a permitted use within that designation?
   - Are there policies specific to this designation?
2. **General policies**: Check applicable general policies:
   - Growth management / intensification
   - Housing
   - Community design
   - Environmental policies
   - Infrastructure
3. **Site-specific policies**: Are there any site-specific OPA policies
   that apply?
4. **OP amendment needed?**: If the proposed use is not permitted in the
   current designation, note that an OPA (Official Plan Amendment) would
   be required.

### Step 6: Zoning By-law Compliance Analysis

Read the applicable zoning by-law from `documents/`.

1. **Current zone**: What zone is the site in?
2. **Permitted uses**: Is the proposed use permitted in this zone?
3. **Zone standards**: Check the proposed project against all applicable
   quantitative standards:
   - Minimum lot area
   - Minimum lot frontage
   - Front, rear, and side yard setbacks
   - Maximum height
   - Maximum density (units/acre or units/hectare)
   - Maximum lot coverage
   - Minimum parking requirements
   - Floor area ratio (if applicable)
   - Landscaping requirements
   - Loading requirements (commercial/industrial)
4. **Bill 17 considerations**: As of June 2025, Bill 17 introduced
   as-of-right setback variations of up to 10% for urban residential
   lands (excludes Greenbelt, within 300m of railway, within 120m of
   conservation authority regulated lands). Check if this applies.
5. **Zoning amendment needed?**: If the project doesn't meet zoning
   standards, note what is needed:
   - ZBA (Zoning By-law Amendment) for use/density changes
   - Minor variance for small quantitative shortfalls (via Committee of
     Adjustment)

### Step 7: Overlay Districts & Site-Specific Constraints

Check for any additional constraints that may affect feasibility:

1. **Environmental overlays**: Flood plains, ANSI provincially significant
   wetlands, Areas of Natural and Scientific Interest, conservation
   authority regulation limits
2. **Heritage**: Heritage conservation districts, designated heritage
   properties
3. **Infrastructure**: Road widening lines, future road corridors,
   sewage/water capacity constraints
4. **Airport noise**: Near airports? Check noise exposure projections
5. **Railway**: Within 300m of a railway? Setback requirements apply
6. **Contamination**: Known contaminated sites (Record of Site Condition
   may be needed)
7. **Source water protection**: Within a drinking water source protection
   area?

### Step 8: Required Approvals & Pathway

Based on the analysis, identify all approvals the project would need:

| If the project... | Then it needs... |
|-------------------|-----------------|
| Is a permitted use in current OP and zone, meets all standards | No planning approvals (building permit only) |
| Meets OP but needs zoning relief (small shortfall) | Minor variance (Committee of Adjustment) |
| Meets zone but OP designation doesn't permit use | Official Plan Amendment (OPA) |
| OP permits use but zone doesn't, or standards exceed zone | Zoning By-law Amendment (ZBA) |
| Is a subdivision of land | Plan of subdivision (Draft Plan Approval) |
| Is a land severance | Consent (Committee of Adjustment) |
| Is within a site plan control area | Site Plan Approval |
| Is on land needing environmental study | Environmental Assessment |

For each approval, note:
- Approving authority (municipal council, committee of adjustment,
  LPAT/OLT, province)
- Statutory timeline (if any)
- Public consultation requirements
- Appeal rights

### Step 9: Risk Assessment

Assess the overall risk profile:

| Risk Level | Description |
|-----------|-------------|
| **Low** | Straightforward compliance, all uses permitted, meets all standards, no overlays, no amendments needed |
| **Medium** | Minor variances needed, some policy tension, standard timeline, some neighbourhood opposition possible |
| **High** | OPA/ZBA required, provincial plan conformity issues, environmental constraints, likely appeals, long timeline |

Key risk factors to flag:
- Policy conflicts (lower-tier vs. upper-tier, OP vs. PPS)
- Environmental constraints requiring studies
- Neighbourhood opposition / NIMBY risk
- OLT (Ontario Land Tribunal) appeal risk
- Infrastructure capacity limitations
- Timing risk (council cycles, regulatory changes)

### Step 10: Generate Feasibility Report

Use the template at `templates/feasibility-report.md` to generate the
final report. Fill in every section. If a section is not applicable,
state "Not applicable" with a brief reason.

**Verdict definitions:**
- **GO**: All layers pass. Project is compliant or needs only routine
  approvals (building permit, site plan). Low risk.
- **CONDITIONAL GO**: Mostly compliant but needs minor variances or
  standard amendments. Medium risk. Feasible with conditions.
- **CAUTION**: Significant issues. OPA or ZBA needed, policy tensions,
  environmental constraints. High risk but potentially feasible with
  careful planning and studies.
- **NO-GO**: Fundamental conflict (provincial plan prohibition,
  environmental hazard land, infrastructure unavailable, use not
  contemplated in any planning document).

**Citations format**: Every finding must cite the source document, the
section/policy number, and quote the relevant text. Format:
> [Document Name], Section X.Y.Z, policy [number]: "quoted text"

## Important Notes

### Professional Judgment
This tool provides a preliminary feasibility assessment based on
available documents. It does not replace professional planning judgment,
legal advice, or formal application review. Always recommend the user
consult with a registered professional planner (RPP) for formal opinions.

### Document Currency
Planning documents change. Before relying on any document, check:
- Is the PPS version current? (PPS 2024 is current as of skill creation)
- Has the municipality recently amended its OP or zoning by-law?
- Are there any recent provincial legislative changes (e.g., Bill 17)?

### Bill 17 (2025) Changes
Bill 17 (Protect Ontario by Building Faster and Smarter Act, 2025) made
significant changes to the Planning Act, including:
- As-of-right setback variations (up to 10% for urban residential)
- Limits on complete application requirements
- Changes to development charges
- Ministerial approval for new complete application requirements in OPA

Check `documents/provincial/` for Bill 17 text and always consider its
impact on the assessment.

### Geographic Scope
This skill is configured for municipalities within 150km of Peterborough,
Ontario. The list of covered municipalities is in
`documents/municipalities-radius.md`. If a project is outside this area,
inform the user and suggest obtaining the relevant municipal documents
before proceeding.

## Pitfalls

- **Do not assume zoning**: Always verify the site's zone by reading the
  zoning by-law and any zoning maps. If no map is available, ask the user.
- **Upper-tier vs. lower-tier**: In two-tier municipalities, both the
  upper-tier and lower-tier OP may apply. Don't just check one.
- **OP consolidations**: Many OPs are available as "office consolidations"
  that include amendments. Check the consolidation date.
- **Zoning by-law amendments**: Zoning by-laws are amended frequently.
  Always check if a more recent amendment exists.
- **Provincial plan boundaries**: If the site might be near a provincial
  plan boundary, verify carefully — being just inside vs. outside changes
  the conformity standard.
- **Secondary plans**: Many municipalities have secondary plans for
  specific areas that contain additional policies. Don't miss these.
- **Site-specific OPA**: Some sites have site-specific official plan
  amendments that override general Designation policies. Always check for
  these.
- **Phasing of approvals**: Some projects need multiple approvals in
  sequence (e.g., OPA → ZBA → subdivision → site plan). The pathway and
  sequencing matters for timeline estimates.
- **Document download failures**: Ontario.ca and municipal websites may
  block curl downloads (returning HTML error pages or "Permission denied"
  instead of the PDF). Always verify downloaded files with `file` command
  to confirm they are actually PDFs/HTML, not error pages. If a download
  fails, try `web_extract` as a fallback to get the content as markdown.
- **Document format mismatch**: Some documents (Planning Act, Bill 17) are
  only available as HTML from Ontario's e-Laws portal, not as PDFs. Save
  them as `.html` files and read them with the appropriate tool.
- **Municipal website redesigns**: Ontario municipalities frequently
  redesign their websites, breaking all old URLs. The
  `municipalities-radius.md` file contains URLs that were valid at
  creation time (June 2026) but may now 404. If a URL fails, search the
  municipality's current website for "official plan" or "planning"
  rather than trusting the stored URL. City of Peterborough and
  Peterborough County both redesigned their sites in 2025-2026.
- **Finding disappeared OP URLs**: When a municipal website redesign
  breaks the stored URL, use this discovery sequence: (1) `web_search`
  with `site:domain.ca "official plan"` to find the new page; (2) if
  the new site search doesn't work, try the municipality's CivicWeb
  portal (`<name>.civicweb.net`) — many Ontario municipalities host
  their OP PDFs there even when the main site lacks a planning page;
  (3) use browser navigation if the site's internal search doesn't
  respond to headless requests. See
  `references/municipal-url-discovery.md` for the 4 URLs discovered
  this way and the exact search strings that worked.
- **Cloudflare-protected municipal sites**: Some municipal sites
  (confirmed: `hastingscounty.com`) use Cloudflare bot protection that
  blocks BOTH curl downloads AND browser automation (the browser gets
  a 'Just a moment...' challenge page that never resolves). For these
  sites, automated download is not possible — ask the user to manually
  download the PDF via a browser and place it at the expected path. The
  Hastings County OP was obtained this way: the user downloaded it in
  3 parts via their browser (Part A — Official Plan, Part B — Urban
  Communities Secondary Plan, Part C — Birds Creek Secondary Plan) and
  the files were placed at `upper-tier/hastings-county-op-part-*.pdf`.
  Cloudflare-protected sites may split their OP into multiple files so
  check for all parts when the user provides the document(s).
- **Document download verification**: After downloading PDFs with curl,
  always verify each file starts with `%PDF` (check first 5 bytes with
  `head -c 5 <file>`) — municipal sites may return HTML error pages or
  Cloudflare challenge pages with HTTP 200 status, so exit code alone is
  insufficient. A 5 KB file that should be 5 MB is almost certainly an
  error page.
- **Peterborough County Official Plan**: RESOLVED — the County's new
  website (ptbocounty.ca) now exposes a planning page at
  `/county-government/departments/planning-and-public-works/planning/official-plan/`
  and the consolidated OP PDF is downloadable via direct link (see
  `documents/municipal-document-urls.md`).
- **Interactive GIS maps fail in headless browsers**: Municipal zoning
  and mapping portals built on ArcGIS Experience Builder or Web
  AppBuilder (e.g., Peterborough's e-Maps 3) often do not render or allow
  interaction in automated browser sessions. Do not rely on browser tools
  to read zoning from these maps. Instead: download the PDF zoning key
  maps, use the municipality's direct property lookup if available, or
  contact the zoning administrator.
- **Web search gaps for municipal details**: `web_search` may return
  empty results for highly specific municipal queries (exact street
  addresses, zoning district codes, map sheet numbers). When this
  happens, fall back to `web_extract` on the municipality's planning and
  zoning pages, or search the downloaded PDF documents directly.
- **Peterborough County Official Plan**: As of June 2026, the County's
  new website (ptbocounty.ca) does not expose a planning/OP page in its
  navigation. The County planning department may need to be contacted
  directly, or the OP may be found via the County's CivicWeb portal
  (escribemeetings.com). This is a known gap.
- **Durham Region lost planning authority**: Pursuant to Bill 23, as of
  January 1, 2025, the Region of Durham is defined by the province as an
  "upper-tier municipality without planning responsibilities." Durham's
  eight area municipalities have assumed approval authority for all
  Planning Act decisions. The Regional Official Plan (ROP) has been
  folded into each area municipality's Official Plan. When assessing a
  project in Durham, check the **area municipality's** OP (which now
  incorporates the former Regional OP), not just the Regional document.
- **Upper-tier counties without zoning**: Northumberland County,
  Hastings County, Peterborough County, and Durham Region do NOT have
  upper-tier zoning by-laws. Zoning is always administered by the
  lower-tier municipality. For these areas, you must obtain the
  lower-tier municipal zoning by-law for the specific township/town.