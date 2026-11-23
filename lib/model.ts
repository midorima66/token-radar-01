// The token radar's model ("comps-1"): one snapshot of the protocol universe in, one ranked board out.
//
// Where the house starter priced every protocol at a flat 0.25 x TVL, this model prices each pre-token
// protocol against the protocols in the same snapshot whose token already trades. The snapshot carries
// 144 tokenized protocols with both a TVL and a market cap; their market-cap-to-TVL ratios are the
// market's own answer to "what is a dollar of TVL in this category worth as a token?". The model:
//
//   1. winsorizes every peer ratio to [0.01, 10] so one mania (a 400x prediction market) cannot set a
//      category's price, and drops exchange (CEX) protocols, whose tokens price the exchange, not TVL;
//   2. takes each category's median ratio, then shrinks it toward the global median with weight
//      K = 4 pseudo-peers, so a category with a single traded peer borrows most of its price from the
//      whole market instead of from one possibly-idiosyncratic token;
//   3. prices a protocol at TVL x its category multiple, adjusted by a growth multiplier from its
//      seven-day TVL change and a maturity multiplier from how long it has run with no token on record;
//   4. carries a value band from the same shrinkage applied to the category's 25th and 75th percentile
//      ratios, so every row states a range, not a false point of precision.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds every
// other rankable pre-token protocol the snapshot carries: the early rows the radar exists to find. A
// protocol is pre-token when its record shows no token (no market cap, no CoinGecko id, no symbol) —
// the snapshot's live-token protocols are kept apart as the calibration universe, never ranked.
// No protocol name is ever special-cased: the same functions score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** Peer ratios are winsorized into [ratio_floor, ratio_cap] before any statistic is taken. */
  ratio_floor: number;
  ratio_cap: number;
  /** Pseudo-peer weight of the global median in every category's shrunk multiple. */
  shrinkage_k: number;
  /** The shrunk multiple is clamped into [multiple_min, multiple_max]. */
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  ratio_floor: 0.01,
  ratio_cap: 10,
  shrinkage_k: 4,
  multiple_min: 0.02,
  multiple_max: 3,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the board's rows carry it. */
export const MODEL_VERSION = 'comps-2';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 60;

/** One tokenized peer protocol, as the calibration saw it. */
export interface Peer {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** A category's calibration: its peer count and its shrunk multiples (point, low, high). */
export interface CategoryCal {
  category: string;
  peers_n: number;
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  raw_median: number;
}

/** The whole calibration derived from the snapshot's tokenized protocols. */
export interface Calibration {
  peers: Peer[];
  peers_by_category: Map<string, Peer[]>;
  categories: CategoryCal[];
  global: { n: number; median: number; p25: number; p75: number };
  byCategory: Map<string, CategoryCal>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  tier: 'watchlist' | 'early';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    version: string;
    multiple: number;
    multiple_low: number;
    multiple_high: number;
    peers_n: number;
    peers_basis: string;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one board row: everything the page renders, farm plan included. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  tier: 'watchlist' | 'early';
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  peers_n: number;
  peers_basis: string;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  stats: {
    protocols_scanned: number;
    tokenized_peers: number;
    global_multiple: number;
    global_low: number;
    global_high: number;
    board_implied_total_usd: number;
  };
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  categories: CategoryCal[];
  peers: Record<string, { name: string; tvl_usd: number; mcap_usd: number; ratio: number }[]>;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty sorted array. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th percentile of a non-empty sorted array, nearest-rank. */
function percentile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * The calibration: every tokenized protocol in the snapshot is a peer; each category's multiple is its
 * peers' median mcap/TVL ratio shrunk toward the global median by `shrinkage_k` pseudo-peers.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const peers: Peer[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.category === 'CEX') continue;
    peers.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      ratio: clamp(p.mcap_usd / p.tvl_usd, model.ratio_floor, model.ratio_cap),
    });
  }
  const all = peers.map((p) => p.ratio).sort((a, b) => a - b);
  const global = { n: peers.length, median: median(all), p25: percentile(all, 0.25), p75: percentile(all, 0.75) };

  const peers_by_category = new Map<string, Peer[]>();
  for (const peer of peers) {
    const key = peer.category ?? 'Uncategorized';
    const list = peers_by_category.get(key);
    if (list === undefined) peers_by_category.set(key, [peer]);
    else list.push(peer);
  }
  for (const list of peers_by_category.values()) list.sort((a, b) => b.ratio - a.ratio);

  const shrink = (catStat: number, globalStat: number, n: number): number =>
    clamp((n * catStat + model.shrinkage_k * globalStat) / (n + model.shrinkage_k), model.multiple_min, model.multiple_max);

  const categories: CategoryCal[] = [];
  const byCategory = new Map<string, CategoryCal>();
  for (const [category, list] of peers_by_category) {
    // Peers with no recorded category still count toward the global calibration and the peer
    // lists, but they are not a category: calFor routes category-less protocols to the global
    // fallback, so no "Uncategorized" multiple may be published for the Method view to advertise.
    if (category === 'Uncategorized') continue;
    const ratios = list.map((p) => p.ratio).sort((a, b) => a - b);
    const cal: CategoryCal = {
      category,
      peers_n: list.length,
      multiple: round4(shrink(median(ratios), global.median, list.length)),
      multiple_low: round4(shrink(percentile(ratios, 0.25), global.p25, list.length)),
      multiple_high: round4(shrink(percentile(ratios, 0.75), global.p75, list.length)),
      raw_median: round4(median(ratios)),
    };
    categories.push(cal);
    byCategory.set(category, cal);
  }
  categories.sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  return { peers, peers_by_category, categories, global: { ...global, median: round4(global.median), p25: round4(global.p25), p75: round4(global.p75) }, byCategory };
}

/** A category's calibration, or the global fallback when no peer trades in it. */
function calFor(cal: Calibration, category: string | null, model: ModelConstants): { multiple: number; multiple_low: number; multiple_high: number; peers_n: number; basis: string } {
  const found = category === null ? undefined : cal.byCategory.get(category);
  if (found !== undefined) {
    return {
      multiple: found.multiple,
      multiple_low: Math.min(found.multiple_low, found.multiple),
      multiple_high: Math.max(found.multiple_high, found.multiple),
      peers_n: found.peers_n,
      basis: `${found.peers_n} tokenized ${found.category} peer${found.peers_n === 1 ? '' : 's'}, median shrunk toward the global median`,
    };
  }
  return {
    multiple: clamp(cal.global.median, model.multiple_min, model.multiple_max),
    multiple_low: clamp(cal.global.p25, model.multiple_min, model.multiple_max),
    multiple_high: clamp(cal.global.p75, model.multiple_min, model.multiple_max),
    peers_n: 0,
    basis: 'no tokenized peer in its category: the global median of all peers',
  };
}

/** The implied value, its band, and every multiplier one protocol gets under `model` and `cal`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  cal: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; low: number; high: number; multiple: number; multiple_low: number; multiple_high: number; peers_n: number; basis: string; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = clamp(rawGrowth, model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (clamp(ageForModel, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
  const c = calFor(cal, protocol.category, model);
  const at = (m: number): number => Math.max(1, Math.round(protocol.tvl_usd * m * growthMult * maturityMult));
  const implied = at(c.multiple);
  return {
    implied,
    low: Math.min(at(c.multiple_low), implied),
    high: Math.max(at(c.multiple_high), implied),
    multiple: c.multiple,
    multiple_low: c.multiple_low,
    multiple_high: c.multiple_high,
    peers_n: c.peers_n,
    basis: c.basis,
    growthPct,
    growthMult,
    maturityMult,
    age,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that are products of a token that already trades, per the snapshot's watchlist rule. */
const TRADED_PRODUCT_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** A name carrying one of these as a whole word marks a wrapped or staked product of another token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name opening with an exchange's name is that exchange's own product. */
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked, bridged or
 * exchange product of a token that already trades — the same rule the snapshot's own watchlist
 * follows, so the early board and the watchlist apply one definition of "still to come".
 */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !(p.category !== null && TRADED_PRODUCT_CATEGORIES.has(p.category)) &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/** The headline figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, cal: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || (isRankable(p) && p.tvl_usd < snapshot.floor_usd));
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, cal, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    tier: watch.has(s.p.slug) ? ('watchlist' as const) : ('early' as const),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    model: {
      version: MODEL_VERSION,
      multiple: s.v.multiple,
      multiple_low: s.v.multiple_low,
      multiple_high: s.v.multiple_high,
      peers_n: s.v.peers_n,
      peers_basis: s.v.basis,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 50;
  return 25;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category family's opening action and its follow-up, in words a farmer can follow. */
function actionsFor(p: SnapshotProtocol, capital: number, chain: string): { open: string; deepen: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('curator') || c.includes('allocator') || c.includes('collateral')) {
    return {
      open: `Deposit $${capital} of USDC into one of ${name}'s curated vaults on ${chain} and keep the vault shares in the wallet.`,
      deepen: `Split a second $${Math.max(25, Math.round(capital / 2))} across a second ${name} vault on a different market, so the wallet shows more than one position.`,
    };
  }
  if (c.includes('lend') || c.includes('cdp')) {
    return {
      open: `Supply $${capital} of USDC to ${name} on ${chain} and leave the supply position open.`,
      deepen: `Borrow about a quarter of the supplied value against the position and repay it a week later, so the wallet registers both sides of the market.`,
    };
  }
  if (c.includes('dex')) {
    return {
      open: `Provide $${capital} of liquidity to ${name}'s main USDC pool on ${chain} and keep the position open.`,
      deepen: `Route one small swap a week through ${name} itself rather than an aggregator, so the wallet's volume is native to the protocol.`,
    };
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return {
      open: `Bridge $${capital} of USDC to ${chain} through ${name} and hold the bridged funds in the receiving wallet.`,
      deepen: `Use the bridged funds in one app on ${chain} each week instead of bridging straight back, so the trip reads as use, not a round trip.`,
    };
  }
  if (c.includes('staking') || c.includes('restak') || c.includes('staking pool')) {
    return {
      open: `Stake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the wallet.`,
      deepen: `Restake or re-deposit the receipt once, following ${name}'s own flow, and keep the second receipt beside the first.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) {
    return {
      open: `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`,
      deepen: `Close and reopen a small position once a week, keeping each trade small: the aim is a real trading record, not profit.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      open: `Fund $${capital} on ${name} and take one position in a liquid market.`,
      deepen: `Settle the first position and take a second in a different market, so the account shows settled history in more than one event.`,
    };
  }
  if (c.includes('stable')) {
    return {
      open: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet.`,
      deepen: `Move half of the minted asset into ${name}'s own yield or savings wrapper if it offers one, and hold both parts.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      open: `Subscribe $${capital} to ${name}'s yield asset on ${chain}, completing its onboarding form if it asks for one, and hold the asset.`,
      deepen: `Add a second small subscription after the first distribution lands, so the wallet shows a repeat, not a single touch.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      open: `Buy $${capital} of cover from ${name} on ${chain} for a position you actually hold, and keep the policy to expiry.`,
      deepen: `Renew the cover once when it lapses, so the wallet carries a second policy period.`,
    };
  }
  if (c.includes('chain')) {
    return {
      open: `Bridge $${capital} of USDC onto ${name}'s chain and hold a small balance of its gas asset in the wallet.`,
      deepen: `Use one native application on the chain each week (a swap, a mint or a transfer), so the wallet reads as a chain user, not a parked balance.`,
    };
  }
  if (c.includes('basis')) {
    return {
      open: `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the shares.`,
      deepen: `Leave the position untouched through one funding cycle, then add a small top-up so the deposit history spans two cycles.`,
    };
  }
  if (c.includes('payment')) {
    return {
      open: `Hold $${capital} in ${name} on ${chain} and route one real payment through it.`,
      deepen: `Route a second payment in a later week, so the account shows recurring use rather than a single deposit.`,
    };
  }
  if (c.includes('governance')) {
    return {
      open: `Deposit $${capital} of USDC into ${name} on ${chain} and register the wallet for its governance or rewards programme.`,
      deepen: `Vote or claim in the programme's next round if it opens one, and keep the record in the farm log.`,
    };
  }
  return {
    open: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    deepen: `Add one more small deposit in a later week, so the wallet's history with ${name} spans more than a single day.`,
  };
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const acts = actionsFor(p, capital, chain);
  const multi = p.chains.length > 1 ? ` It runs on ${p.chains.length} chains; farm it on ${chain}, where the wallet's gas is cheapest to keep topped up.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.${multi}`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: acts.open,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: acts.deepen,
      cost: 'about $2 of gas',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and never let a week pass empty.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; never pay a third party to claim.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view and peer tables. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, cal: Calibration, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, cal, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => r.tier === 'early').length;
  const peers: RadarData['peers'] = {};
  for (const [category, list] of cal.peers_by_category) {
    peers[category] = list.map((p) => ({ name: p.name, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: round4(p.ratio) }));
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    stats: {
      protocols_scanned: snapshot.protocols.length,
      tokenized_peers: cal.peers.length,
      global_multiple: cal.global.median,
      global_low: cal.global.p25,
      global_high: cal.global.p75,
      board_implied_total_usd: board.reduce((sum, r) => sum + r.implied_value_usd, 0),
    },
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map((row) => ({
      rank: row.rank,
      slug: row.slug,
      name: row.name,
      category: row.category,
      chains: row.chains,
      tvl_usd: row.tvl_usd,
      change_7d: row.change_7d,
      listed_at: row.listed_at,
      age_days: row.age_days,
      tier: row.tier,
      multiple: row.model.multiple,
      multiple_low: row.model.multiple_low,
      multiple_high: row.model.multiple_high,
      implied_value_usd: row.implied_value_usd,
      implied_low_usd: row.implied_low_usd,
      implied_high_usd: row.implied_high_usd,
      growth_multiplier: row.model.growth_multiplier,
      maturity_multiplier: row.model.maturity_multiplier,
      peers_n: row.model.peers_n,
      peers_basis: row.model.peers_basis,
      farm_steps: row.farm_steps,
    })),
    live,
    categories: cal.categories,
    peers,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
