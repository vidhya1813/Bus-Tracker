// Place names: Tamil names, common nicknames, and forgiving matching
// ("trichy", "kovai", "ஊட்டி" and small typos all find the right stop).

export const TAMIL_NAMES = {
  Chennai: 'சென்னை',
  Chengalpattu: 'செங்கல்பட்டு',
  Tindivanam: 'திண்டிவனம்',
  Villupuram: 'விழுப்புரம்',
  Ulundurpet: 'உளுந்தூர்பேட்டை',
  Perambalur: 'பெரம்பலூர்',
  Tiruchirappalli: 'திருச்சிராப்பள்ளி',
  Melur: 'மேலூர்',
  Madurai: 'மதுரை',
  Vellore: 'வேலூர்',
  Krishnagiri: 'கிருஷ்ணகிரி',
  Dharmapuri: 'தருமபுரி',
  Salem: 'சேலம்',
  Erode: 'ஈரோடு',
  Tiruppur: 'திருப்பூர்',
  Coimbatore: 'கோயம்புத்தூர்',
  Dindigul: 'திண்டுக்கல்',
  Palani: 'பழனி',
  Pollachi: 'பொள்ளாச்சி',
  Virudhunagar: 'விருதுநகர்',
  Tirunelveli: 'திருநெல்வேலி',
  Nagercoil: 'நாகர்கோவில்',
  Kanyakumari: 'கன்னியாகுமரி',
  Thanjavur: 'தஞ்சாவூர்',
  Tiruvarur: 'திருவாரூர்',
  Nagapattinam: 'நாகப்பட்டினம்',
  Velankanni: 'வேளாங்கண்ணி',
  Mamallapuram: 'மாமல்லபுரம்',
  Marakkanam: 'மரக்காணம்',
  Puducherry: 'புதுச்சேரி',
  Paramakudi: 'பரமக்குடி',
  Ramanathapuram: 'இராமநாதபுரம்',
  Mandapam: 'மண்டபம்',
  Rameswaram: 'இராமேஸ்வரம்',
  Mettupalayam: 'மேட்டுப்பாளையம்',
  Coonoor: 'குன்னூர்',
  Ooty: 'ஊட்டி',
};

const NICKNAMES = {
  madras: 'Chennai',
  cmbt: 'Chennai',
  koyambedu: 'Chennai',
  trichy: 'Tiruchirappalli',
  tiruchi: 'Tiruchirappalli',
  tiruchy: 'Tiruchirappalli',
  திருச்சி: 'Tiruchirappalli',
  kovai: 'Coimbatore',
  cbe: 'Coimbatore',
  கோவை: 'Coimbatore',
  pondy: 'Puducherry',
  pondicherry: 'Puducherry',
  பாண்டி: 'Puducherry',
  udhagamandalam: 'Ooty',
  ooty: 'Ooty',
  உதகமண்டலம்: 'Ooty',
  nellai: 'Tirunelveli',
  நெல்லை: 'Tirunelveli',
  kanniyakumari: 'Kanyakumari',
  'cape comorin': 'Kanyakumari',
  tanjore: 'Thanjavur',
  தஞ்சை: 'Thanjavur',
  mahabalipuram: 'Mamallapuram',
  rameshwaram: 'Rameswaram',
  ராமேஸ்வரம்: 'Rameswaram',
  ramnad: 'Ramanathapuram',
  ராமநாதபுரம்: 'Ramanathapuram',
  velankani: 'Velankanni',
  nagai: 'Nagapattinam',
  villupuram: 'Villupuram',
  viluppuram: 'Villupuram',
  dharmapuri: 'Dharmapuri',
  palani: 'Palani',
  pazhani: 'Palani',
};

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

/**
 * Resolve user input to a known stop name.
 * Returns { name } on a confident match, otherwise { name: null, suggestions: [...] }.
 */
export function resolvePlace(input, knownNames) {
  const q = norm(input);
  if (!q) return { name: null, suggestions: [] };
  const byLower = new Map(knownNames.map((n) => [n.toLowerCase(), n]));
  if (byLower.has(q)) return { name: byLower.get(q) };

  const tamil = Object.entries(TAMIL_NAMES).find(([, ta]) => ta === input.trim());
  if (tamil && byLower.has(tamil[0].toLowerCase())) return { name: tamil[0] };

  const nick = NICKNAMES[q];
  if (nick && byLower.has(nick.toLowerCase())) return { name: nick };

  const prefix = knownNames.filter((n) => n.toLowerCase().startsWith(q));
  if (prefix.length === 1 && q.length >= 3) return { name: prefix[0] };

  const scored = knownNames
    .map((n) => ({ n, d: levenshtein(q, n.toLowerCase()) }))
    .sort((a, b) => a.d - b.d);
  if (scored[0] && scored[0].d <= Math.max(1, Math.floor(q.length / 5))) return { name: scored[0].n };

  const suggestions = [...new Set([...prefix, ...scored.filter((s) => s.d <= 4).map((s) => s.n)])].slice(0, 4);
  return { name: null, suggestions };
}
