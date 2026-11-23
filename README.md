[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/midorima66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/midorima66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Launch Radar

A token launch radar for make.fun's **token-radar-01** bounty: it reads a sealed snapshot of every
protocol DefiLlama tracks, finds the ones that record no token yet, prices each one against the
protocols in its own category whose token already trades, and hands in a static web dashboard with
the ranked board, a detail view for every protocol, and a concrete farm plan for every row.

**Model `comps-2`** — peer-calibrated comparables, not a flat multiple:

```
implied value = TVL × category multiple × growth multiplier × maturity multiplier
```

- **Category multiple.** Every tokenized protocol in the snapshot (exchanges excluded) is a peer.
  Its ratio is `market cap / TVL`, winsorized to `[0.01, 10]` so one mania cannot set a price.
  A category's multiple is its peers' median ratio **shrunk toward the global median** (0.19× across
  133 peers) with K = 4 pseudo-peers of weight: a category with eleven traded peers mostly prices
  itself; a category with one borrows most of its price from the whole market. The same shrinkage on
  the category's 25th/75th percentile ratios gives every row a **value band**, not a false point.
- **Growth multiplier.** `1 + (clamp(7d TVL change, −60%, +120%) / 100) × 0.5`.
- **Maturity multiplier.** 0.6 → 1.0 across the first 1,095 days the protocol has been tracked:
  the longer it has run at scale with no token on record, the more value the model credits.

The board covers **all 40 watchlist protocols** (TVL ≥ $50M, no token on record, not a wrapped or
staked product) and adds **138 early rows** — every other rankable pre-token protocol in the snapshot —
for **178 rows** in all. "Rankable" applies the snapshot's own watchlist rule to the early board too:
a protocol whose category is Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking or Restaked
BTC, whose name carries the whole word *wrapped*, *staked* or *staking*, or that opens with an
exchange's name is a product of a token that already trades, so it is never ranked as pre-token
(comps-2 removed 48 such rows that comps-1 had ranked; every surviving row keeps its comps-1 value).
The 133 tokenized protocols are never ranked; they are the calibration
universe, shown on the dashboard's *Live tokens* view. No protocol name is special-cased anywhere:
one function prices every row, and the dashboard shows each row's multiple, peer count, band, and
the peers behind its price. Protocols with no category on record are priced at the global median,
and the Method view advertises no multiple the model does not use.

## Run it

Requires Node.js 22.18 or later. No dependencies, no build step, no network.

```sh
npm start
# = MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

`input/snapshot.json` is a bundled copy of the competition's sealed snapshot so the demo runs
anywhere. In the grader's container the program reads `/input/snapshot.json` and writes `/output`
by default; `--input <file|dir>` and `--output <dir>` (or `MAKEFUN_OUTPUT_DIR`) override.

Outputs:

| File | What it is |
| --- | --- |
| `board.json` | The ranked board: 226 rows, each with implied value, value band, the full model breakdown, and 7 farm steps |
| `data.js` | The dashboard's whole dataset as one script (board, live peers, category calibration) |
| `dashboard/` | The static page (`index.html`, `app.css`, `app.js`) — renders with no network |
| `screenshots/` | Board, detail view, filtered view (1440×900 PNG) |
| `dossier.json` | The judge's dossier, built by `vendor/makefun-board.ts` from the dashboard and screenshots |

The run is deterministic: two runs over the same snapshot produce byte-identical outputs.
A pre-generated `board.json` and `dossier.json` from the bundled snapshot sit at the repo root.

To view the dashboard after a run, serve the output directory and open `dashboard/`:

```sh
cd out && python3 -m http.server 8000   # then open localhost:8000/dashboard/
```

Views are deep-linkable by hash: `#p=<slug>` is a protocol's detail view, `#category=<name>`,
`#chain=<name>`, `#tier=early`, `#tab=live` and `#tab=method` drive the filters and tabs.

## The dashboard

- **Pre-token board** — sortable (rank, name, TVL, 7d change, age, peer multiple, implied value),
  filterable by search, category, chain and radar tier; every row carries its peer band bar.
- **Detail view per protocol** — the arithmetic spelled out (`TVL × multiple × growth × maturity`),
  the multiple's basis and band, the snapshot record, the traded peers behind the price with their
  own TVL / market cap / ratio, and the 7-step farm plan with a cost and time chip on every step.
- **Live tokens** — the calibration universe: tokenized protocols with the market's own values.
- **Method & multiples** — the full methodology and a table of every category multiple used,
  with peer counts, raw medians and bands.
- A canvas chart of the top 12 implied values with band whiskers sits under the board.

Farm plans are generated from each protocol's own record (category family, primary chain, chain
count, TVL-sized capital, age-sized hold window): open a position, deepen it with a second
category-specific action, a weekly qualifying action, a hold, a safe points/claim check, and a
farm log — each step stating what it costs and how long it takes.

## Layout

```
main.ts                  the program: snapshot in, board + dashboard + dossier out
lib/model.ts             the comps-1 model: calibration, implied value, farm plans, the gate check
vendor/makefun-board.ts  make.fun's dossier library, copied byte-for-byte from the competition kit
dashboard/               the static page (38.9 KB of source in total, no framework, no network)
screenshots/             the three hand-in screenshots, rendered from this dashboard
input/snapshot.json      the sealed DefiLlama snapshot (competition input, for the local demo)
board.json, dossier.json pre-generated outputs of the program on that snapshot
```

## Honesty notes

An implied value is what a token would be worth if it priced like the protocol's traded peers
today. It is not a prediction that a token will be issued, or when, or on what terms. The board
says a protocol *records* no token — a record can lag reality — never that it has none. Farm plans
are activity checklists, not financial advice; capital in any protocol can be lost.

License: MIT (see `LICENSE`).
