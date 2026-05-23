const { performance } = require('perf_hooks');

const DEFAULT_CATEGORY_ID = "other";

function normalizeEntry(entry) {
  return {
    ...entry,
    personId: entry.personId ?? "",
    personName: entry.personName ?? "",
    categoryId: entry.categoryId ?? DEFAULT_CATEGORY_ID,
    subcategoryId: entry.subcategoryId ?? "custom",
  };
}

// Generate 10,000 entries
const entries = Array.from({ length: 100000 }, (_, i) => ({
    id: String(i),
    title: `Entry ${i}`,
    username: `user${i}`,
    password: `pass${i}`,
    categoryId: i % 2 === 0 ? "social" : undefined,
    subcategoryId: "facebook",
}));

function testBaseline() {
    const counts = {};
    for (const entry of entries) {
        const id = normalizeEntry(entry).categoryId;
        counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
}

function testOptimized() {
    const counts = {};
    for (const entry of entries) {
        const id = entry.categoryId ?? DEFAULT_CATEGORY_ID;
        counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
}

const N = 100;

const startBaseline = performance.now();
for (let i = 0; i < N; i++) testBaseline();
const endBaseline = performance.now();
console.log(`Baseline: ${(endBaseline - startBaseline).toFixed(2)} ms`);

const startOptimized = performance.now();
for (let i = 0; i < N; i++) testOptimized();
const endOptimized = performance.now();
console.log(`Optimized: ${(endOptimized - startOptimized).toFixed(2)} ms`);
console.log(`Improvement: ${((1 - (endOptimized - startOptimized) / (endBaseline - startBaseline)) * 100).toFixed(2)}% faster`);
