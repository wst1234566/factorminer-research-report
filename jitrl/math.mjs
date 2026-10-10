/**
 * A deterministic teaching calculation for the JitRL walkthrough.
 * The rewards, state tokens and logits are constructed examples, NOT released
 * traces or a reproduction of the paper's Table 7. No model is called or trained.
 */
export const ACTIONS = Object.freeze(['Catalog', 'Marketing', 'Search']);
export const BASE_LOGITS = Object.freeze([0.9, 0.7, 0.4]);
export const CURRENT_TOKENS = Object.freeze([
  'sidebar', 'menu', 'search_empty', 'filters_none', 'no_modal',
]);
export const EPSILON = 1e-8;
export const DEFAULTS = Object.freeze({
  gamma: 0.1, beta: 1, threshold: 0.8, k: 10, includeNew: false, normalize: true,
});

const HISTORY = [
  { id: 'H1', action: 'Catalog', rewards: [-2, 0, 0], tokens: [...CURRENT_TOKENS, 'banner_visible'] },
  { id: 'H2', action: 'Catalog', rewards: [-1, 0, 0], tokens: [...CURRENT_TOKENS] },
  { id: 'H3', action: 'Marketing', rewards: [1, 2, 3], tokens: [...CURRENT_TOKENS] },
  { id: 'H4', action: 'Marketing', rewards: [2, 2, 3], tokens: [...CURRENT_TOKENS, 'notice_visible'] },
  { id: 'H5', action: 'Search', rewards: [0, 1, 0], tokens: [...CURRENT_TOKENS, 'breadcrumb_visible'] },
  { id: 'H6', action: 'Search', rewards: [0, 0, 0], tokens: CURRENT_TOKENS.slice(0, 4) },
];

function finiteNumber(value, name, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be a finite number in [${min}, ${max}]`);
  }
  return value;
}

function optionsFor(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }
  const params = { ...DEFAULTS, ...options };
  finiteNumber(params.gamma, 'gamma', 0, 1);
  finiteNumber(params.beta, 'beta', 0);
  finiteNumber(params.threshold, 'threshold', 0, 1);
  finiteNumber(params.k, 'k', 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(params.k)) throw new RangeError('k must be an integer');
  for (const name of ['includeNew', 'normalize']) {
    if (typeof params[name] !== 'boolean') throw new TypeError(`${name} must be boolean`);
  }
  return {
    gamma: params.gamma, beta: params.beta, threshold: params.threshold, k: params.k,
    includeNew: params.includeNew, normalize: params.normalize,
  };
}

/** Return G_t = r_t + gamma * G_(t+1) at every time step, in chronological order. */
export function discountedReturns(rewards, gamma = DEFAULTS.gamma) {
  finiteNumber(gamma, 'gamma', 0, 1);
  if (!Array.isArray(rewards)) throw new TypeError('rewards must be an array');
  const returns = new Array(rewards.length);
  let future = 0;
  for (let t = rewards.length - 1; t >= 0; t--) {
    finiteNumber(rewards[t], `rewards[${t}]`);
    future = rewards[t] + gamma * future;
    finiteNumber(future, `returns[${t}]`);
    returns[t] = future;
  }
  return returns;
}

/** Set Jaccard; repeated tokens are counted once. Two empty sets have similarity 1. */
export function jaccard(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) throw new TypeError('tokens must be arrays');
  const a = new Set(left), b = new Set(right);
  const intersectionTokens = [...a].filter(token => b.has(token));
  const unionTokens = [...new Set([...a, ...b])];
  return {
    intersection: intersectionTokens.length, union: unionTokens.length,
    intersectionTokens, unionTokens,
    similarity: unionTokens.length ? intersectionTokens.length / unionTokens.length : 1,
  };
}

/** Stable softmax (subtracting a common maximum leaves probabilities unchanged). */
export function softmax(logits) {
  if (!Array.isArray(logits) || logits.length === 0) throw new TypeError('logits must be nonempty');
  logits.forEach((value, i) => finiteNumber(value, `logits[${i}]`));
  const maximum = Math.max(...logits);
  const exponents = logits.map(value => Math.exp(value - maximum));
  const denominator = exponents.reduce((total, value) => total + value, 0);
  return exponents.map(value => value / denominator);
}

function softmaxTerms(logits) {
  const shift = Math.max(...logits);
  const exponents = logits.map(value => Math.exp(value - shift));
  const denominator = exponents.reduce((a, b) => a + b, 0);
  // Raw exp(z) is useful for the worked example. null avoids misleading Infinity
  // if a caller chooses very large beta; shifted values always remain stable.
  const raw = logits.map(value => Math.exp(value));
  const rawSum = raw.reduce((a, b) => a + b, 0);
  return {
    shift, exponents, denominator,
    rawExponents: raw.map(value => Number.isFinite(value) ? value : null),
    rawDenominator: Number.isFinite(rawSum) ? rawSum : null,
  };
}

function updatePolicy(Q, V, z, params) {
  const A = Q.map(value => value - V);
  const M = Math.max(...A.map(Math.abs));
  const An = A.map(value => value / (M + EPSILON));
  const appliedAdvantage = params.normalize ? An : [...A];
  const correction = appliedAdvantage.map(value => params.beta * value);
  const zp = z.map((value, i) => value + correction[i]);
  const post = softmax(zp);
  return { Q, V, A, M, An, appliedAdvantage, correction, z, prior: softmax(z), zp, post,
    softmaxTerms: { prior: softmaxTerms(z), post: softmaxTerms(zp) } };
}

/**
 * Main public API. All action-indexed arrays follow ACTIONS order.
 * records is chronological; neighbors is sorted by similarity (ties by H number).
 * Unknown actions use Q=0, with random exploration deliberately disabled.
 * With no neighbors, valueAvailable=false, estimates are zero placeholders and
 * post=prior. This explicit fallback prevents empty-mean/divide-by-zero artifacts.
 */
export function compute(options = {}) {
  const params = optionsFor(options);
  const source = HISTORY.map(record => ({ ...record, rewards: [...record.rewards], tokens: [...record.tokens] }));
  if (params.includeNew) source.push({
    id: 'H7', action: 'Marketing', rewards: [2, 3, 3], tokens: [...CURRENT_TOKENS],
  });
  const records = source.map((record, index) => {
    const returns = discountedReturns(record.rewards, params.gamma);
    return { ...record, index, returns, G: returns[0], jaccard: jaccard(CURRENT_TOKENS, record.tokens) };
  });
  const ranking = [...records]
    .filter(record => record.jaccard.similarity >= params.threshold)
    .sort((a, b) => b.jaccard.similarity - a.jaccard.similarity || a.index - b.index)
    .slice(0, params.k);
  const selectedIds = new Set(ranking.map(record => record.id));
  for (const record of records) {
    record.selected = selectedIds.has(record.id);
    record.exclusion = record.selected ? null
      : record.jaccard.similarity < params.threshold ? 'below-threshold' : 'outside-top-k';
  }
  const neighbors = ranking;
  const n = neighbors.length;
  const counts = ACTIONS.map(action => neighbors.filter(record => record.action === action).length);
  const sums = ACTIONS.map(action => neighbors.filter(record => record.action === action).reduce((sum, record) => sum + record.G, 0));
  const totalReturn = neighbors.reduce((sum, record) => sum + record.G, 0);
  const V = n ? totalReturn / n : 0;
  const Q = sums.map((sum, i) => counts[i] ? sum / counts[i] : 0);
  const values = updatePolicy(Q, V, [...BASE_LOGITS], params);
  const newRewards = [2, 3, 3];
  const newReturns = discountedReturns(newRewards, params.gamma);
  return {
    params, actions: [...ACTIONS], currentTokens: [...CURRENT_TOKENS], epsilon: EPSILON,
    records, neighbors, excluded: records.filter(record => !record.selected), n,
    G: records.map(record => record.G), rewards: records.map(record => [...record.rewards]),
    counts, sums, totalReturn, ...values,
    randomExploration: false, missingActionRule: 'Q=0; random exploration disabled',
    valueAvailable: n > 0, fallback: n === 0,
    fallbackReason: n === 0 ? 'No neighbors: preserve the base policy.' : null,
    newTrajectory: {
      rewards: newRewards, returns: newReturns,
      steps: [
        { state: '起始后台页面', action: 'Marketing', reward: newRewards[0], G: newReturns[0], entersCurrentNeighborhood: true },
        { state: '相关菜单页面', action: '打开 Reviews', reward: newRewards[1], G: newReturns[1], entersCurrentNeighborhood: false },
        { state: '评价列表页面', action: '读取目标评价', reward: newRewards[2], G: newReturns[2], entersCurrentNeighborhood: false },
      ],
    },
    teachingData: true,
  };
}

/**
 * Optional appendix example: add unseen Help with z=0.2 and expose both branches.
 * Returns a mixture of branch probabilities, NOT softmax of an averaged Q.
 * lambda is the probability of optimistic VALUE ASSIGNMENT, not taking Help.
 * alpha=5, lambda=.05 are illustrative settings for this optional calculation.
 */
export function exploration(options = {}) {
  const params = optionsFor(options);
  const alpha = options.alpha ?? 5;
  const lambda = options.lambda ?? 0.05;
  const helpLogit = options.helpLogit ?? 0.2;
  finiteNumber(alpha, 'alpha', 0);
  finiteNumber(lambda, 'lambda', 0, 1);
  finiteNumber(helpLogit, 'helpLogit');
  const main = compute(params);
  const actions = [...ACTIONS, 'Help'];
  const z = [...BASE_LOGITS, helpLogit];
  const helpQ = main.n ? main.V + alpha / main.n : 0;
  const optimistic = updatePolicy([...main.Q, helpQ], main.V, z, params);
  const neutral = updatePolicy([...main.Q, 0], main.V, z, params);
  const mixture = optimistic.post.map((value, i) => lambda * value + (1 - lambda) * neutral.post[i]);
  return {
    params: { ...params, alpha, lambda, helpLogit }, actions, n: main.n, V: main.V,
    bonus: main.n ? alpha / main.n : 0,
    optimistic: { branchProbability: lambda, ...optimistic },
    neutral: { branchProbability: 1 - lambda, ...neutral },
    mixture, fallback: main.fallback, valueAvailable: main.valueAvailable,
    fallbackReason: main.fallbackReason, teachingData: true,
  };
}
