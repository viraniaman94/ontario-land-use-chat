# Ontario Land Use Planning Regulatory Framework

Reference for the `ontario-land-use-feasibility` skill. Captures the
hierarchical planning system, compliance standards, and key documents.

## Hierarchy

Ontario's land use planning system is **province-led, municipality-implemented**.

| Level | Role | Documents |
|-------|------|-----------|
| **Province** | Sets ground rules via Planning Act & PPS; provincial plans for specific geographies | Planning Act, PPS 2024, Greenbelt Plan, ORMCP, NEP |
| **Municipalities/Planning Boards** | Primary decision-makers; implement policy through OPs, zoning by-laws, planning decisions | Official Plans, Zoning By-laws, Secondary Plans |
| **Approval Authorities & OLT** | Dispute resolution | Ontario Land Tribunal (OLT) |

## Compliance Standards

| Standard | Applies to | Meaning |
|----------|-----------|---------|
| "Consistent with" | PPS 2024 | Must apply PPS when making decisions; some flexibility in how to achieve |
| "Conform" | Provincial plans, upper-tier OPs | Stricter — must align with the plan |
| "Not conflict" | Provincial plans | No direct conflict with plan policies |
| "Comply with" | Zoning by-laws | Must meet all quantitative standards |

Provincial plans **generally take precedence** over PPS where they apply.

## Bill 23 Impact on Upper-Tier Planning Authority

Pursuant to Bill 23 (More Homes Built Faster Act, 2022), as of **January 1,
2025**, certain upper-tier municipalities lost their planning authority:

- **Durham Region** is now defined as an "upper-tier municipality without
  planning responsibilities." Its eight area municipalities (Ajax, Brock,
  Clarington, Oshawa, Pickering, Scugog, Uxbridge, Whitby) have assumed
  approval authority for all Planning Act decisions.
- The Regional Official Plan (ROP) has been **folded into each area
  municipality's Official Plan**. Each area municipality may repeal or amend
  the ROP as it pertains to their jurisdiction.
- When assessing a project in Durham, check the **area municipality's OP**
  (which now incorporates the former Regional OP), not just the Regional
  document. The Regional Official Plan document (Dec 2024 consolidation)
  remains a reference but is no longer the active planning authority.

## Counties Without Zoning By-laws

Several upper-tier municipalities in the 150km radius do NOT have county-level
zoning by-laws. Zoning is delegated to the lower-tier municipalities:

- Northumberland County (7 lower-tier municipalities handle zoning)
- Hastings County (14 lower-tier municipalities handle zoning)
- Peterborough County (8 lower-tier townships handle zoning)
- Durham Region (8 area municipalities handle zoning)

For projects in these areas, you must obtain the **lower-tier** zoning by-law.

## Key Documents

### Provincial Planning Statement (PPS) 2024
- **In force:** October 20, 2024
- **Replaces:** PPS 2020 + A Place to Grow: Growth Plan for the Greater Golden Horseshoe, 2019
- **Issued under:** Section 3 of the Planning Act
- **Scope:** Province-wide
- **Policy areas:** Settlement areas, housing, economic development, infrastructure, natural heritage, agriculture, mineral aggregates, water, cultural heritage, natural hazards, human-made hazards
- **Key change from PPS 2020:** Streamlined, more housing-focused, gives municipalities more flexibility

### Greenbelt Plan
- **Issued under:** Greenbelt Act, 2005
- **Scope:** Greater Golden Horseshoe — Greenbelt area
- **Key feature:** Permanent protection from urbanization; total land area cannot be reduced
- **Includes:** Agricultural and environmental protection in protected countryside; urban river valley designation
- **Note:** References to "the PPS" in the Greenbelt Plan mean the PPS 2020 as it read before revocation

### Oak Ridges Moraine Conservation Plan (ORMCP)
- **Issued under:** Oak Ridges Moraine Conservation Act, 2001 (O. Reg. 140/02)
- **Scope:** 190,000 hectares, 160km from Trent River (east) to Niagara Escarpment (west)
- **Key feature:** Ecologically-based plan; regional watershed divide; headwaters source

### Niagara Escarpment Plan (NEP)
- **Scope:** Niagara Escarpment corridor
- **Key feature:** Environmental protection along the escarpment

### Planning Act
- **Legal foundation** of Ontario's land use planning system
- **Key planning tools:** Official plans, zoning by-laws (incl. minor variances), community planning permit systems, land division (subdivision, consents), site plan control, community improvement plans
- **Amended by:** Bill 17 (2025) — see `references/bill17-changes.md`

### Bill 17 — Protect Ontario by Building Faster and Smarter Act, 2025
- **Royal Assent:** June 5, 2025 (Statutes of Ontario 2025, chapter 9)
- **Key changes:** As-of-right setback variations, limits on complete application requirements, DC changes
- **Details:** See `references/bill17-changes.md`

## Municipal Structure (150km of Peterborough)

### Single-tier municipalities
Combine upper and lower-tier functions. Have their own OPs and zoning by-laws.
- City of Peterborough (0 km)
- City of Kawartha Lakes (43 km)
- City of Quinte West (93 km)
- City of Belleville (114 km)
- Prince Edward County (130 km)

### Upper-tier municipalities (counties/regions)
Set broad land use policy. Lower-tier municipalities must conform.
- Peterborough County (23 km) — 8 lower-tier townships
- Northumberland County (54 km) — 7 lower-tier municipalities
- Durham Region (72 km) — 8 lower-tier municipalities (NOTE: lost planning authority Jan 2025 per Bill 23)
- Hastings County (104 km) — 13 lower-tier municipalities
- Haliburton County (100 km) — 4 lower-tier townships
- Lennox & Addington County (145 km) — 4 lower-tier municipalities
- District Municipality of Muskoka (147 km) — 6 lower-tier (only Gravenhurst within 150km)

Full list with lower-tier details in `documents/municipalities-radius.md`.

## The Feasibility Review Workflow

When a planner receives a potential project, the standard review checks:

1. **Is the proposed use permitted?** (OP land use designation + zoning by-law)
2. **Does it meet quantitative standards?** (setbacks, height, density/FAR, lot coverage, parking)
3. **Is it consistent with provincial policy?** (PPS 2024)
4. **Do provincial plans apply?** (Greenbelt, ORMCP, NEP — geographic check)
5. **Are there overlay constraints?** (Heritage, flood plain, conservation, contamination)
6. **What approvals are needed?** (OPA, ZBA, subdivision, site plan, minor variance, or as-of-right)
7. **What are the red flags / risks?** (Non-conforming use, OLT exposure, policy conflicts)

## Existing AI Tools in This Space (as of 2025)

No existing tool does Ontario PPS + provincial plan + OP + zoning conformity review. See `references/existing-ai-tools.md` for full survey.