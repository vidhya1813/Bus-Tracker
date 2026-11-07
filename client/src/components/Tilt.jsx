// 3D tilt-on-hover wrapper with a moving glare. Does nothing on touch screens
// or for people who prefer reduced motion.
import { useRef } from 'react';

const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Tilt({ as: Tag = 'div', className = '', max = 8, children, style, ...rest }) {
  const ref = useRef(null);

  const move = (e) => {
    if (reduce || e.pointerType === 'touch') return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
    el.classList.add('tilting');
  };
  const leave = () => {
    const el = ref.current;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.classList.remove('tilting');
  };

  return (
    <Tag ref={ref} className={`tilt ${className}`} onPointerMove={move} onPointerLeave={leave} style={style} {...rest}>
      {children}
      <span className="glare" aria-hidden="true" />
    </Tag>
  );
}
