// Token Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable and sortable table, a per-protocol detail view with the
// model's own arithmetic and the protocol's farm plan, the live-token calibration universe, and the
// method page with every category multiple the model used. No network: every byte is in data.js.
//
// The model (lib/model.ts, version in DATA.model_version): a pre-token protocol is priced against the
// snapshot's tokenized protocols in its own category. Each category's multiple is the median of its
// peers' market-cap / TVL ratios, winsorized to [0.01, 10] and shrunk toward the global median with
// 4 pseudo-peers of weight; implied value = TVL x multiple x growth multiplier x maturity multiplier.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tier: 'all', tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tier')) state.tier = params.get('tier');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tier !== 'all') params.set('tier', state.tier);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.tier !== 'all' && r.tier !== state.tier) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'mark' }),
        el('div', null,
          el('div', { class: 'brand-name', text: 'Token Launch Radar' }),
          el('div', { class: 'brand-sub', text: 'Pre-token protocols, priced by the peers that already trade' })
        )
      ),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Universe ', el('b', { text: DATA.stats.protocols_scanned + ' protocols' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var s = DATA.stats;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.watchlist_size + ' watchlist protocols, ', el('span', { class: 'hl', text: DATA.board_size + ' pre-token rows' }), ', ranked by implied launch value'),
        el('p', { text: 'Every protocol in the snapshot that records no token is priced the way the market already prices its traded peers: TVL times the category\u2019s median market-cap-to-TVL multiple, adjusted for seven-day growth and for how long the protocol has run with no token. The watchlist (TVL at or above ' + fmtUsd(DATA.floor_usd) + ') is the floor, never the ceiling: the early radar adds every rankable pre-token protocol below it.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Board rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board implied value, total' }), el('b', { text: fmtUsd(s.board_implied_total_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Tokenized peers calibrating' }), el('b', { text: String(s.tokenized_peers) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global median multiple' }), el('b', { text: fmtMult(s.global_multiple) }))
      )
    );
  }

  function modelStrip() {
    var m = DATA.model;
    return el('div', { class: 'modelstrip' },
      el('b', { text: 'The model, in one line: ' }),
      el('span', { class: 'formula', text: 'implied = TVL x category multiple (median peer mcap/TVL, winsorized [' + m.ratio_floor + ', ' + m.ratio_cap + '], shrunk to the global median with K=' + m.shrinkage_k + ') x growth x maturity' }),
      el('span', { text: ' Every row shows its multiple, its peer count and its value band; open any protocol to see the arithmetic and the peers behind its price.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, onchange) {
      var sel = el('select', { id: id, 'aria-label': label },
        values.map(function (v) {
          var o = el('option', { value: v[0], text: v[1] });
          if (v[0] === current) o.setAttribute('selected', 'selected');
          return o;
        })
      );
      sel.addEventListener('change', function () { onchange(sel.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
    }
    var tabs = el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }),
      el('div', { class: 'tabs' },
        el('button', { type: 'button', 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Pre-token board', onclick: function () { state.tab = 'board'; writeHash(); render(); } }),
        el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live tokens', onclick: function () { state.tab = 'live'; writeHash(); render(); } }),
        el('button', { type: 'button', 'aria-pressed': state.tab === 'method' ? 'true' : 'false', text: 'Method & multiples', onclick: function () { state.tab = 'method'; writeHash(); render(); } })
      )
    );
    var count = state.tab === 'board' ? rows().length + ' of ' + DATA.board_size + ' rows shown'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : DATA.categories.length + ' calibrated categories';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', [['all', 'All categories']].concat(categories.map(function (c) { return [c, c]; })), state.category, function (v) { state.category = v; }),
      select('chain', 'Chain', [['all', 'All chains']].concat(chains.map(function (c) { return [c, c]; })), state.chain, function (v) { state.chain = v; }),
      select('tier', 'Radar tier', [['all', 'Watchlist + early'], ['watchlist', 'Watchlist only'], ['early', 'Early only']], state.tier, function (v) { state.tier = v; }),
      tabs,
      el('span', { class: 'count', text: count })
    );
  }

  function chart() {
    var top = DATA.rows.slice(0, 12);
    var box = el('section', { class: 'panel chartbox' },
      el('h2', { text: 'The top of the board' }),
      el('p', { text: 'Implied launch value of the twelve highest-ranked pre-token protocols, with the peer band (25th to 75th percentile multiple) as the whisker.' })
    );
    var canvas = el('canvas', { class: 'chart', 'aria-label': 'Bar chart of the twelve highest implied values' });
    box.appendChild(canvas);
    requestAnimationFrame(function () { drawChart(canvas, top); });
    return box;
  }
  function drawChart(canvas, top) {
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var labelW = 150, valW = 86, plotW = w - labelW - valW - 12;
    var max = top[0].implied_high_usd || 1;
    var rowH = h / top.length;
    ctx.font = '12px -apple-system, "Segoe UI", Roboto, sans-serif';
    top.forEach(function (r, i) {
      var y = i * rowH + rowH / 2;
      ctx.fillStyle = '#8fa1b5';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      var name = r.name.length > 20 ? r.name.slice(0, 19) + '\u2026' : r.name;
      ctx.fillText(name, labelW - 8, y);
      var bw = Math.max(2, (r.implied_value_usd / max) * plotW);
      var lw = (r.implied_low_usd / max) * plotW, hw = (r.implied_high_usd / max) * plotW;
      ctx.fillStyle = '#1d5c3a';
      ctx.fillRect(labelW + lw, y - 2, Math.max(1, hw - lw), 4);
      ctx.fillStyle = '#3ddc84';
      ctx.fillRect(labelW, y - 5, bw, 10);
      ctx.fillStyle = '#dbe4ee';
      ctx.textAlign = 'left';
      ctx.fillText(fmtUsd(r.implied_value_usd), labelW + bw + 8, y);
    });
  }

  function sortHeader(key, label, num) {
    return el('th', num ? { scope: 'col', class: 'num' } : { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or tier to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tier = 'all'; writeHash(); render(); } })
      ));
    }
    var maxHigh = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_high_usd; })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var band = el('div', { class: 'bandcell' },
        el('div', { class: 'bandlab', text: fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) }),
        el('div', { class: 'bandbar' },
          el('i', { style: 'left:' + (r.implied_low_usd / maxHigh * 100) + '%;width:' + Math.max(1.5, (r.implied_high_usd - r.implied_low_usd) / maxHigh * 100) + '%' }),
          el('u', { style: 'left:' + (r.implied_value_usd / maxHigh * 100) + '%' })
        )
      );
      var tr = el('tr', { onclick: function () { state.selected = r.slug; writeHash(); render(); window.scrollTo(0, 0); } },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null,
          el('div', { class: 'pname', text: r.name }),
          el('div', { class: 'pslug', text: r.slug })
        ),
        el('td', null, el('span', { class: 'badge ' + (r.tier === 'watchlist' ? 'watch' : 'early'), text: r.tier })),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'chains', text: (r.chains || []).slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        el('td', null, band)
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel tablewrap' },
      el('table', null,
        el('thead', null, el('tr', null,
          sortHeader('rank', '#'),
          sortHeader('name', 'Protocol'),
          el('th', { scope: 'col', text: 'Tier' }),
          el('th', { scope: 'col', text: 'Category' }),
          el('th', { scope: 'col', text: 'Chains' }),
          sortHeader('tvl', 'TVL', true),
          sortHeader('growth', '7d', true),
          sortHeader('age', 'Age', true),
          sortHeader('multiple', 'Peer x', true),
          sortHeader('implied', 'Implied value', true),
          el('th', { scope: 'col', text: 'Peer band' })
        )),
        tbody
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'pname', text: r.name }), el('div', { class: 'pslug', text: r.slug })),
        el('td', { text: r.category || 'Uncategorized' }),
        el('td', { class: 'chains', text: (r.chains || []).slice(0, 3).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.ratio === null ? 'n/a' : fmtMult(r.ratio) }),
        el('td', { class: 'num ' + growthClass, text: r.change_7d === null ? 'n/a' : fmtPct(r.change_7d) })
      ));
    });
    return el('div', null,
      el('section', { class: 'lede', style: 'grid-template-columns:1fr;padding-bottom:0' },
        el('div', null,
          el('h1', { text: 'The calibration universe: tokens that already trade' }),
          el('p', { text: 'These protocols are never ranked: their token exists, so the market has already answered. Their market-cap-to-TVL ratios are the peers the pre-token board is priced against, category by category. Exchange (CEX) protocols are excluded from calibration: their tokens price the exchange, not a dollar of TVL.' })
        )
      ),
      el('div', { class: 'panel tablewrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Chains' }),
            el('th', { scope: 'col', class: 'num', text: 'TVL' }), el('th', { scope: 'col', class: 'num', text: 'Market cap' }),
            el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' }), el('th', { scope: 'col', class: 'num', text: '7d' })
          )),
          tbody
        )
      )
    );
  }

  function methodView() {
    var m = DATA.model, s = DATA.stats;
    var tbody = el('tbody');
    DATA.categories.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.peers_n) }),
        el('td', { class: 'num', text: fmtMult(c.raw_median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) }),
        el('td', { class: 'num', text: fmtMult(c.multiple_low) + ' \u2013 ' + fmtMult(c.multiple_high) })
      ));
    });
    return el('div', { class: 'method' },
      el('h2', { text: 'How an implied value is made' }),
      el('p', { text: 'The snapshot is the only input: ' + s.protocols_scanned + ' protocols at or above $5M of TVL, fetched once from DefiLlama\u2019s public protocol index. A protocol counts as pre-token when its record carries no market cap, no CoinGecko id and no symbol. Nothing outside the snapshot (no prices, no news, no social signal) enters the model, and no protocol name is special-cased: one function prices every row.' }),
      el('span', { class: 'formula', text: 'implied value = TVL x multiple(category) x growth multiplier x maturity multiplier' }),
      el('p', { text: 'The multiple is calibrated, not chosen. Every tokenized protocol in the snapshot (excluding exchanges) is a peer: its ratio is market cap / TVL, winsorized to [' + m.ratio_floor + ', ' + m.ratio_cap + '] so a single mania cannot set a price. A category\u2019s multiple is its peers\u2019 median ratio shrunk toward the global median (' + fmtMult(s.global_multiple) + ' across ' + s.tokenized_peers + ' peers) with K = ' + m.shrinkage_k + ' pseudo-peers of weight: a category with eleven traded peers mostly prices itself, a category with one borrows most of its price from the whole market. The band repeats the same shrinkage on the category\u2019s 25th and 75th percentile ratios.' }),
      el('p', { text: 'The growth multiplier is 1 + (clamped 7d TVL change / 100) x ' + m.growth_weight + ', the change clamped to [' + m.growth_floor + '%, +' + m.growth_cap + '%]: a protocol adding TVL fast is priced up, a leaking one down, neither without limit. The maturity multiplier runs from ' + m.maturity_floor + ' to ' + (m.maturity_floor + m.maturity_range) + ' across the first ' + m.maturity_days + ' days DefiLlama has tracked the protocol: the longer a protocol has operated at scale with no token on record, the more of its value the model credits. A protocol with no listing date is treated as ' + m.unknown_age_days + ' days old.' }),
      el('h2', { text: 'Every category multiple the model used' }),
      el('div', { class: 'panel tablewrap' },
        el('table', { class: 'mini' }, null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'num', text: 'Peers' }),
            el('th', { scope: 'col', class: 'num', text: 'Raw median' }), el('th', { scope: 'col', class: 'num', text: 'Multiple used' }),
            el('th', { scope: 'col', class: 'num', text: 'Band' })
          )),
          tbody
        )
      ),
      el('h2', { text: 'What the board does not claim' }),
      el('p', { text: 'An implied value is what a token would be worth if it priced like the protocol\u2019s traded peers today. It is not a prediction that a token will be issued, or when, or on what terms: the board says a protocol records no token, never that it has none, because a record can lag reality. Farm plans are activity checklists derived from each protocol\u2019s category, chains, TVL and age, not financial advice; capital in any protocol can be lost.' })
    );
  }

  function parseStep(s) {
    var m = /^(.*) Cost: (.*)\. Time: (.*)\.$/.exec(s);
    if (!m) return { text: s, cost: null, time: null };
    return { text: m[1], cost: m[2], time: m[3] };
  }

  function detailView(r) {
    var peers = (DATA.peers[r.category || 'Uncategorized'] || []);
    var peerBody = el('tbody');
    peers.forEach(function (p) {
      peerBody.appendChild(el('tr', null,
        el('td', { text: p.name }),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: fmtMult(p.ratio) })
      ));
    });
    var steps = el('ol', { class: 'steps' });
    r.farm_steps.map(parseStep).forEach(function (s) {
      steps.appendChild(el('li', null,
        el('span', { class: 'stext', text: s.text }),
        s.cost ? el('span', { class: 'chip', text: 'Cost: ' + s.cost }) : null,
        s.time ? el('span', { class: 'chip time', text: 'Time: ' + s.time }) : null
      ));
    });
    var median = DATA.rows[Math.floor(DATA.rows.length / 2)].implied_value_usd;
    var why = r.rank === 1
      ? 'It tops the board: the largest peer-priced value of any pre-token protocol in the snapshot.'
      : 'It ranks #' + r.rank + ' of ' + DATA.board_size + ': its implied value is ' + (r.implied_value_usd >= median ? 'above' : 'below') + ' the board median of ' + fmtUsd(median) + ', set by its TVL, its category multiple of ' + fmtMult(r.multiple) + ', and its growth and maturity multipliers.';
    return el('div', null,
      el('button', { class: 'backlink', type: 'button', text: '\u2190 Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('div', { class: 'detail-head' },
        el('div', null,
          el('h1', { text: r.name }),
          el('div', { class: 'sub' },
            el('span', { class: 'badge ' + (r.tier === 'watchlist' ? 'watch' : 'early'), text: r.tier + ' radar' }),
            '  ' + (r.category || 'Uncategorized') + ' \u00b7 ' + (r.chains || []).join(', ') + ' \u00b7 rank #' + r.rank + ' of ' + DATA.board_size
          ),
          el('p', { class: 'sub', text: why })
        ),
        el('div', null,
          el('div', { class: 'biglab', text: 'Implied launch value' }),
          el('div', { class: 'bigfig', text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'sub', text: 'peer band ' + fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) })
        )
      ),
      el('div', { class: 'grid2' },
        el('section', { class: 'card' },
          el('h2', { text: 'The arithmetic' }),
          el('div', { class: 'arith', text: '' },
            document.createTextNode('TVL ' + fmtUsd(r.tvl_usd) + '  x  multiple ' + fmtMult(r.multiple) + '  x  growth ' + r.growth_multiplier.toFixed(2) + '  x  maturity ' + r.maturity_multiplier.toFixed(2) + '  =  '),
            el('b', { text: fmtUsd(r.implied_value_usd) })
          ),
          el('dl', { class: 'kv' },
            el('dt', { text: 'Multiple basis' }), el('dd', { text: r.peers_basis }),
            el('dt', { text: 'Multiple band' }), el('dd', { text: fmtMult(r.multiple_low) + ' \u2013 ' + fmtMult(r.multiple_high) }),
            el('dt', { text: '7d TVL change' }), el('dd', { text: r.change_7d === null ? 'not reported' : fmtPct(r.change_7d) }),
            el('dt', { text: 'Age on record' }), el('dd', { text: r.age_days === null ? 'no listing date' : r.age_days + ' days (listed ' + r.listed_at + ')' })
          ),
          el('p', { text: 'The page recomputes nothing: these are the same figures main.ts wrote to board.json, from the same model in lib/model.ts.' })
        ),
        el('section', { class: 'card' },
          el('h2', { text: 'Snapshot record' }),
          el('dl', { class: 'kv' },
            el('dt', { text: 'Slug' }), el('dd', { text: r.slug }),
            el('dt', { text: 'Category' }), el('dd', { text: r.category || 'Uncategorized' }),
            el('dt', { text: 'Chains' }), el('dd', { text: (r.chains || []).join(', ') || 'none named' }),
            el('dt', { text: 'TVL' }), el('dd', { text: fmtUsd(r.tvl_usd) }),
            el('dt', { text: 'Token on record' }), el('dd', { text: 'none (no market cap, no CoinGecko id, no symbol)' }),
            el('dt', { text: 'Radar tier' }), el('dd', { text: r.tier === 'watchlist' ? 'Watchlist (TVL at or above the floor)' : 'Early (below the floor)' })
          )
        )
      ),
      el('section', { class: 'card', style: 'margin-top:14px' },
        el('h2', { text: 'The traded peers behind this price' }),
        peers.length === 0
          ? el('p', { text: 'No protocol in this category has a token trading in the snapshot, so this row is priced on the global median multiple of ' + fmtMult(DATA.stats.global_multiple) + ' across all ' + DATA.stats.tokenized_peers + ' peers.' })
          : el('div', { class: 'tablewrap' },
              el('table', { class: 'mini' }, null,
                el('thead', null, el('tr', null,
                  el('th', { scope: 'col', text: 'Peer protocol' }), el('th', { scope: 'col', class: 'num', text: 'TVL' }),
                  el('th', { scope: 'col', class: 'num', text: 'Market cap' }), el('th', { scope: 'col', class: 'num', text: 'Mcap / TVL' })
                )),
                peerBody
              )
            )
      ),
      el('section', { class: 'card', style: 'margin-top:14px' },
        el('h2', { text: 'Farm plan: the steps to farm ' + r.name }),
        steps
      )
    );
  }

  function footer() {
    return el('footer', null,
      el('p', { text: 'Data: ' + DATA.source + '. The snapshot is sealed: every run of this program reads the same bytes, and the board above is reproducible from it alone.' }),
      el('p', { text: 'Implied values are this entry\u2019s model (version ' + DATA.model_version + ', lib/model.ts), not a promise of a token, a price or a return. A protocol here records no token on DefiLlama\u2019s index; that is all the board claims. Farm plans are derived from each protocol\u2019s category, chains, TVL and age \u2014 check the protocol\u2019s own pages before committing funds, and never pay a third party to claim an airdrop.' })
    );
  }

  function render() {
    app.setAttribute('aria-busy', 'true');
    app.textContent = '';
    app.appendChild(header());
    var selected = state.selected ? bySlug[state.selected] : null;
    if (selected) {
      app.appendChild(detailView(selected));
    } else {
      app.appendChild(lede());
      app.appendChild(modelStrip());
      app.appendChild(controls());
      if (state.tab === 'board') {
        app.appendChild(boardTable());
        app.appendChild(chart());
      } else if (state.tab === 'live') {
        app.appendChild(liveTable());
      } else {
        app.appendChild(methodView());
      }
    }
    app.appendChild(footer());
    app.removeAttribute('aria-busy');
  }

  readHash();
  render();
})();
