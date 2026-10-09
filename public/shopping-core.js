// Shared by browser and server so duplicate checks use exactly the same rules.
globalThis.ShoppingCore = (() => {
  const aliases = new Map([
    ['washingup liquid', 'washing up liquid'], ['dish soap', 'washing up liquid'],
    ['dishwashing liquid', 'washing up liquid'], ['washing up soap', 'washing up liquid'],
    ['yogurt', 'yoghurt'], ['yogurts', 'yoghurts'], ['scallions', 'spring onions'],
    ['zucchini', 'courgette'], ['eggplant', 'aubergine'], ['cilantro', 'coriander'],
    ['garbanzo beans', 'chickpeas'], ['confectioners sugar', 'icing sugar'],
    ['baking soda', 'bicarbonate of soda'], ['trash bags', 'bin bags'],
    ['paper towels', 'kitchen roll'], ['toilet paper', 'toilet roll'],
  ]);
  function key(text) {
    const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return aliases.get(value) ?? value;
  }
  // Damerau-Levenshtein includes adjacent swapped letters, e.g. "mlik".
  function distance(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
    return rows[a.length][b.length];
  }
  return Object.freeze({ key, distance });
})();
