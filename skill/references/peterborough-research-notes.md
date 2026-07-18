# Peterborough Research Notes — Ontario Land Use Feasibility

Session: 2026-07-01
Purpose: Pre-assessment context gathering for 123 George Street North, Peterborough.

## Confirmed Planning Context

- **Municipality type**: Single-tier. City of Peterborough is a separated
  municipality and is NOT part of Peterborough County for planning
  decisions.
- **Upper-tier municipality**: Not applicable for planning approvals. The
  City of Peterborough performs both upper-tier and lower-tier planning
  functions.
- **Provincial plan applicability**: The City of Peterborough is outside
  the Greenbelt Plan, Oak Ridges Moraine Conservation Plan, and Niagara
  Escarpment Plan areas. Provincial plan conformity step can be skipped
  for projects in the city.

## Relevant Documents

| Layer | Document | Source | Status |
|-------|----------|--------|--------|
| Provincial | PPS 2024 | `documents/provincial/pps-2024.pdf` | Downloaded |
| Provincial | Planning Act | `documents/provincial/planning-act-ontario.html` | Downloaded |
| Provincial | Bill 17 (2025) | `documents/provincial/bill-17-2025.html` | Downloaded |
| Municipal OP | City of Peterborough Official Plan (Dec 2025 consolidation) | https://www.peterborough.ca/media/bqwnqo3w/2025-12-consolidation-official-plan-accessibility-check-complete.pdf | URL known, not downloaded |
| Municipal OP maps | Schedules A-K | https://www.peterborough.ca/media/00gdhb2h/official-plan-schedules-a-k-updated-dec-2025-consolidation.pdf | URL known, not downloaded |
| Zoning | Comprehensive Zoning By-law (multiple sections) | https://www.peterborough.ca/business-building-development/planning-building-and-development/planning-and-development-services/zoning/ | URLs known, not downloaded |

## How to Find Zoning for a Peterborough Property

1. Visit the City of Peterborough Zoning page:
   https://www.peterborough.ca/business-building-development/planning-building-and-development/planning-and-development-services/zoning/
2. Use the **Interactive Map** link (ArcGIS Experience Builder). Note:
   this portal may not render in headless browser sessions.
3. Alternative: use the **Key Map** link to download PDF zoning map sheets,
   then locate the property on the appropriate sheet.
4. For direct confirmation, email the Zoning Administrator at
   planning@peterborough.ca (contacts listed on the zoning page have
   included achapman@peterborough.ca and astillman@peterborough.ca).

## Key Zoning Sections for Residential Apartment Projects

From the City's zoning by-law index:

- Sections 7-12: Residential districts (R.1, R.2, R.3, R.30, R.31, R.4,
  R.40, R.5, R.50, R.6, R.60, R.D.)
- Section 4: Parking, loading, and driveways
- Section 6: Supplementary regulations (including additional dwelling
  units, group homes, minimum floor area)
- Special Districts SP.1-SP.372: Site-specific zoning exceptions that
  must be checked for any property

## Observed Research Limitations

- `web_search` returned no results for exact address queries or zoning
  district searches. Municipal GIS and PDF documents are the reliable
  sources.
- `browser_navigate` to the ArcGIS Experience Builder map loaded only a
  welcome page; the map itself did not render in the headless session.
- `web_extract` on the zoning page successfully returned the by-law
  section index and links, confirming current URLs.

## Notes on Provincial Policy

PPS 2024 applies province-wide. For a 4-storey, 40-unit apartment in a
settlement area, the relevant policy areas are expected to be:
- Section 1.1.1 Settlement Areas
- Section 1.2 Housing (range of housing, intensification)
- Section 1.4 Infrastructure (water, sewer, roads)
- Section 2.1 Natural Heritage
- Section 2.5 Cultural Heritage
- Section 3.1 Natural Hazards

Specific policy text and citations must be extracted from the PPS 2024
PDF during the assessment.
