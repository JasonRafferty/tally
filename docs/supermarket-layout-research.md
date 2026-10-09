# Supermarket grouping research

Researched 9 October 2026. Presets are editable department routes, not official
branch maps or aisle numbers. A chain name alone cannot identify an exact route.

## Evidence reviewed

- Aldi UK, [Typical Store Layout](https://www.aldi.co.uk/corporate/property/typical-store-layout), including its linked February 2025 PDF. The PDF was rendered and inspected: it is a building/site plan with parking and loading, not a labelled grocery aisle plan. It cannot establish category order.
- [STP Construction's Project Fresh case study](https://stpltd.co.uk/transforming-aldi-stores-across-the-uk/), 2021. As a project contractor, it describes wider aisles, extra produce space and additional chillers. Supports fresh-focused departments, not an exact sequence.
- Lidl GB, [Healthier Choices](https://corporate.lidl.co.uk/sustainability/healthy-sustainable-diets/sub-folder/sub-folder/landing-page-healthier-choices). Confirms fruit and vegetables moved to the front of redesigned stores.
- Lidl, [Strood proposal](https://strood.expansion.lidl.co.uk/proposals/) and its linked site-plan PDF. Confirms in-store bakery and a specific proposed sales area. Does not publish a universal department route.
- Lidl, [Middle of Lidl](https://www.lidl.co.uk/c/middle-of-lidl/s10054469). Identifies rotating non-food offers; everyday cleaning products must not automatically be classified as special offers.
- Morrisons, [Market Street hub](https://morrisons.com/inspiration/shopping-at-morrisons/market-street-hub). Establishes greengrocer, butcher, fishmonger and bakery departments. It does not establish their walking sequence in every branch.
- Morrisons, [Bishopbriggs opening](https://www.morrisons-corporate.com/media-centre/corporate-news/morrisons-opens-brand-new-store-in-bishopbriggs/), July 2024. Illustrates a larger branch with Market Street, home/leisure, clothing and Market Kitchen; a Morrisons Daily cannot be assumed to have this layout.
- Tesco, [2012 UK investor store-tour booklet](https://www.tescoplc.com/media/oeymtowl/investor_and_analyst_attendee_booklet.pdf). Has labelled department plans for named stores. Historical, store-specific evidence only; unsuitable as a current nationwide route.
- Tesco, [Bromley By Bow store page](https://www.tesco.com/store-locator/london/tesco-stores-ltd-74bab65e-f489-4ff2-acbf-ded374500847). Directs shoppers to the app's store-specific stock/shopping-list features. No public branch-location feed was integrated.
- The Grocer, [Tesco shopping-list rollout](https://www.thegrocer.co.uk/news/tesco-availability-app-guides-shoppers-around-store-in-smart-shopping-list-rollout/709170.article), September 2025. Reports store-specific item locations and aisle-order navigation. This supports the limitation of a chain-only preset, not a reusable public aisle map.

## Implementation decisions and limits

All four presets begin with fresh departments, use meaningful grocery categories,
and place frozen near the end as a shopping convenience. Exact order beyond
confirmed department facts is our suggested route, not a finding from the sources.
Morrisons keeps bakery near the front alongside other fresh departments; Lidl's
produce and bakery are adjacent. Other differences are editable starting choices.
No numbered aisles, precise shelf positions or universal routes are asserted.

The Edit menu lets users move departments up/down or restore a suggested route.
Orders are stored per supermarket on each list, shared with the other person and
available offline. Selecting another supermarket preserves previous adjustments.
Unclassified items stay in Other. Specialbuy/Middle of Lidl sections are not
invented from ordinary household purchases.

Legacy generic grouping remains readable until the user chooses a supermarket;
existing items, grouping corrections and list data are not rewritten.

## Smarter suggestions

Duplicate comparison shares one normalisation/alias function between browser and
server. Fuzzy matches are suggestions only: typos are not silently renamed or
merged. Distinct products such as milk and oat milk remain distinct.

Regular-purchase ranking learns from unchecked-to-checked shopping items. Replayed
operations and ticks less than six hours apart do not count as another trip.
Average intervals become available after repeated purchases; no historic shopping
schedule is invented. Existing add-history still supplies Buy again suggestions.
