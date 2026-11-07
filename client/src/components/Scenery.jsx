// Animated Tamil Nadu landscape drawn in SVG. Colours come from the active theme;
// each theme adds its own landmarks: tea hills + mist, sea + lighthouse,
// temple gopurams at dusk, or paddy fields + river + coconut palms.
import { useRef } from 'react';
import { usePrefs } from '../prefs.jsx';
import Bus3D from './Bus3D.jsx';

const Palm = ({ x, y, s = 1, flip = false, delay = 0 }) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <path d="M0 0 C 5 -45 -4 -90 9 -128" stroke="var(--trunk)" strokeWidth="8" fill="none" strokeLinecap="round" />
    <g className="fronds" style={{ animationDelay: `${delay}s` }} transform="translate(9 -128)">
      {[-165, -125, -85, -45, -5, 30].map((a) => (
        <path key={a} d="M0 0 C 22 -16 50 -12 70 8 C 48 1 24 -1 0 0Z" fill="var(--leaf)" transform={`rotate(${a})`} />
      ))}
      <circle r="6" cy="4" fill="var(--trunk)" />
    </g>
  </g>
);

function Gopuram({ x, y, s = 1, opacity = 1 }) {
  const tiers = [];
  let top = -46;
  for (let i = 0; i < 7; i++) {
    const w = 120 - i * 14;
    const h = 24 - i;
    tiers.push(`${-w / 2},${top} ${w / 2},${top} ${w / 2 - 7},${top - h} ${-w / 2 + 7},${top - h}`);
    top -= h;
  }
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--silhouette)" opacity={opacity}>
      <rect x="-66" y="-46" width="132" height="46" />
      {tiers.map((p) => <polygon key={p} points={p} />)}
      <rect x="-26" y={top - 22} width="52" height="24" rx="12" />
      {[-14, 0, 14].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={top - 27} rx="4" ry="5" />
          <rect x={cx - 1} y={top - 38} width="2" height="8" />
        </g>
      ))}
      <path d="M-14 0 L-14 -26 Q0 -40 14 -26 L14 0Z" fill="var(--sky3)" opacity="0.55" />
    </g>
  );
}

const Lighthouse = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <polygon className="beam" points="0,-128 -420,-170 -420,-86" fill="url(#beam)" />
    <polygon points="-16,0 16,0 10,-112 -10,-112" fill="#fdfdfd" />
    {[-22, -62, -98].map((b) => (
      <polygon key={b} points={`${-15 + (-b / 112) * 6},${b} ${15 - (-b / 112) * 6},${b} ${14 - ((-b + 16) / 112) * 6},${b - 16} ${-14 + ((-b + 16) / 112) * 6},${b - 16}`} fill="#d6336c" />
    ))}
    <rect x="-12" y="-128" width="24" height="16" fill="#ffe066" className="lamp" />
    <polygon points="-15,-128 15,-128 0,-144" fill="#343a40" />
  </g>
);

const Cloud = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--cloud)">
    <ellipse cx="0" cy="0" rx="46" ry="18" />
    <ellipse cx="30" cy="-12" rx="30" ry="20" />
    <ellipse cx="-24" cy="-8" rx="24" ry="16" />
    <ellipse cx="58" cy="2" rx="26" ry="13" />
  </g>
);

const Pine = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--pine)">
    <polygon points="0,-60 16,-20 8,-20 22,4 -22,4 -8,-20 -16,-20" />
    <rect x="-2" y="4" width="4" height="8" fill="var(--trunk)" />
  </g>
);

export default function Scenery({ compact = false, busLabel, children }) {
  const { theme } = usePrefs();
  const ref = useRef(null);

  // Mouse parallax: layers drift at different speeds.
  const onMove = (e) => {
    const el = ref.current;
    if (!el || compact) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  };

  return (
    <div ref={ref} className={`scenery ${compact ? 'compact' : ''}`} onMouseMove={onMove} aria-hidden={!children}>
      <svg className="scenery-svg" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Tamil Nadu landscape">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--sky1)' }} />
            <stop offset="0.55" style={{ stopColor: 'var(--sky2)' }} />
            <stop offset="1" style={{ stopColor: 'var(--sky3)' }} />
          </linearGradient>
          <radialGradient id="glow">
            <stop offset="0" style={{ stopColor: 'var(--sun)', stopOpacity: 0.7 }} />
            <stop offset="1" style={{ stopColor: 'var(--sun)', stopOpacity: 0 }} />
          </radialGradient>
          <linearGradient id="beam" x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor="#fff6bf" stopOpacity="0.8" />
            <stop offset="1" stopColor="#fff6bf" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="seaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--sea1)' }} />
            <stop offset="1" style={{ stopColor: 'var(--sea2)' }} />
          </linearGradient>
          <filter id="blur8"><feGaussianBlur stdDeviation="8" /></filter>
        </defs>

        <rect width="1200" height="500" fill="url(#sky)" />
        <g className="layer sun-layer">
          <circle cx="880" cy="150" r="150" fill="url(#glow)" className="sun-glow" />
          <circle cx="880" cy="150" r="58" style={{ fill: 'var(--sun)' }} />
        </g>
        <g className="clouds c1"><Cloud x={160} y={110} s={1.1} /><Cloud x={620} y={70} s={0.8} /></g>
        <g className="clouds c2"><Cloud x={420} y={150} s={0.6} /><Cloud x={1050} y={95} s={0.9} /></g>
        <g className="birds">
          {[0, 26, 50].map((d, i) => (
            <path key={d} d="M0 0 q7 -7 14 0 q7 -7 14 0" transform={`translate(${d} ${i * 9})`} fill="none" stroke="var(--bird)" strokeWidth="2.5" strokeLinecap="round" />
          ))}
        </g>

        <g className="layer far">
          <path d="M0 300 C 150 215 300 255 430 225 C 570 190 700 255 850 215 C 990 180 1100 235 1200 205 L1200 500 L0 500Z" style={{ fill: 'var(--hill3)' }} />
        </g>

        {theme === 'gopuram' && (
          <g className="layer far">
            <Gopuram x={960} y={330} s={1.35} opacity={0.75} />
            <Gopuram x={1110} y={340} s={0.8} opacity={0.6} />
          </g>
        )}

        <g className="layer mid">
          <path d="M0 350 C 120 300 260 330 380 312 C 520 288 640 342 780 318 C 920 292 1060 332 1200 302 L1200 500 L0 500Z" style={{ fill: 'var(--hill2)' }} />
          {theme === 'nilgiri' &&
            [70, 110, 150, 650, 700, 740, 1040, 1080].map((x, i) => <Pine key={x} x={x} y={330 - (i % 3) * 6} s={0.9 + (i % 2) * 0.3} />)}
          {theme === 'gopuram' && <Gopuram x={300} y={345} s={0.7} opacity={0.9} />}
        </g>

        {theme === 'nilgiri' && (
          <g className="mist">
            <ellipse cx="250" cy="282" rx="460" ry="22" fill="#fff" opacity="0.32" filter="url(#blur8)" />
            <ellipse cx="980" cy="318" rx="520" ry="18" fill="#fff" opacity="0.26" filter="url(#blur8)" />
          </g>
        )}

        {theme === 'marina' && (
          <g className="layer mid">
            <rect x="0" y="345" width="1200" height="80" fill="url(#seaGrad)" />
            <g className="waves">
              {[360, 380, 400].map((y, i) => (
                <path
                  key={y}
                  d={`M-200 ${y} ${Array.from({ length: 16 }, (_, k) => `q 50 ${i % 2 ? 8 : -8} 100 0`).join(' ')}`}
                  fill="none"
                  stroke="#fff"
                  strokeOpacity={0.55 - i * 0.12}
                  strokeWidth="3"
                  className={`wave w${i}`}
                />
              ))}
            </g>
            <g className="boat"><path d="M0 0 L60 0 L50 12 L10 12Z" fill="#7a4a2a" /><path d="M30 0 L30 -40 L52 -6Z" fill="#fff4e6" /></g>
            <Lighthouse x={1060} y={352} />
          </g>
        )}

        {theme === 'kaveri' && (
          <g className="layer mid">
            <path d="M0 395 C 200 365 380 400 600 372 C 820 345 1000 385 1200 360 L1200 386 C 1000 410 820 372 600 398 C 380 424 200 392 0 420Z" style={{ fill: 'var(--sea1)' }} opacity="0.9" />
            <path d="M0 405 C 200 377 380 410 600 384" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" fill="none" className="wave w1" />
          </g>
        )}

        <g className="layer near">
          <path d="M0 410 C 200 380 400 398 600 388 C 800 378 1000 402 1200 382 L1200 500 L0 500Z" style={{ fill: 'var(--hill1)' }} />
          {theme === 'nilgiri' &&
            [0, 1, 2].map((i) => (
              <path key={i} d={`M-20 ${410 + i * 7} C 220 ${392 + i * 7} 420 ${404 + i * 7} 620 ${398 + i * 7} C 820 ${390 + i * 7} 1020 ${408 + i * 7} 1220 ${392 + i * 7}`} stroke="var(--tea)" strokeWidth="5" strokeLinecap="round" strokeDasharray="14 7" fill="none" opacity="0.8" />
            ))}
          {theme === 'kaveri' &&
            [0, 1].map((i) => (
              <path key={i} d={`M-20 ${414 + i * 8} C 300 ${402 + i * 8} 900 ${416 + i * 8} 1220 ${400 + i * 8}`} stroke={i % 2 ? 'var(--paddy2)' : 'var(--paddy1)'} strokeWidth="7" fill="none" className="paddy" />
            ))}
          {theme === 'marina' && <rect x="0" y="412" width="1200" height="20" style={{ fill: 'var(--sand)' }} />}
        </g>

        {(theme === 'marina' || theme === 'kaveri' || theme === 'gopuram') && (
          <g className="layer near">
            <Palm x={60} y={430} s={1.05} />
            <Palm x={120} y={432} s={0.8} flip delay={0.6} />
            <Palm x={1130} y={430} s={1} flip delay={0.3} />
            {theme !== 'marina' && <Palm x={540} y={420} s={0.55} delay={0.9} />}
          </g>
        )}

        <g className="road">
          <rect x="0" y="428" width="1200" height="72" style={{ fill: 'var(--road)' }} />
          <rect x="0" y="428" width="1200" height="4" fill="#fff" opacity="0.5" />
          <line x1="-80" y1="452" x2="1280" y2="452" stroke="#ffd43b" strokeWidth="4" strokeDasharray="44 30" className="road-dash" />
        </g>
      </svg>

      {!compact && (
        <div className="bus-stage">
          <Bus3D label={busLabel} />
        </div>
      )}
      {children && <div className="scenery-content">{children}</div>}
    </div>
  );
}
