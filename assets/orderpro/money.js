/* Pure centime allocation shared by split previews and confirmations. */
KiwiOrderMenu.orderProParts.run('money', function () {
// extract:splitMoney:start
  function splitMoney(subtotal, pct, count, weights) {
    function allocate(total, weights) {
      const sum = weights.reduce((s, n) => s + n, 0);
      const raw = weights.map(n => sum ? total * n / sum : total / weights.length);
      const parts = raw.map(Math.floor);
      let remainder = total - parts.reduce((s, n) => s + n, 0);
      raw.map((n, i) => ({ i, fraction: n - parts[i] }))
        .sort((a, b) => b.fraction - a.fraction || a.i - b.i)
        .forEach(({ i }) => { if (remainder > 0) { parts[i]++; remainder--; } });
      return parts;
    }
    const tip = Math.round(subtotal * pct / 100);
    const total = subtotal + tip;
    const tips = weights ? allocate(weights.some(n => n > 0) ? tip : 0, weights) : null;
    const parts = weights
      ? weights.map((base, i) => base + tips[i])
      : allocate(total, Array(count).fill(1));
    return { subtotal, tip, total, parts };
  }
// extract:splitMoney:end
  return Object.freeze({ compute: splitMoney });
});
