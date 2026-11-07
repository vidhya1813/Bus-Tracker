// A real CSS 3D bus: six faces in preserve-3d space, spinning wheels, glowing headlights.
// Tap it to spin it around.
import { useState } from 'react';

export default function Bus3D({ label = 'GovBus', small = false }) {
  const [spin, setSpin] = useState(false);
  return (
    <button
      type="button"
      className={`bus3d-wrap ${small ? 'small' : ''} ${spin ? 'spin' : ''}`}
      onClick={() => setSpin((s) => !s)}
      aria-label="3D bus. Tap to spin."
      title="Tap to spin"
    >
      <div className="bus3d-shadow" />
      <div className="bus3d">
        <div className="bf side left">
          <div className="windows" />
          <div className="door" />
          <div className="stripe" />
          <div className="brand">{label}</div>
          <div className="wheel w1"><i /></div>
          <div className="wheel w2"><i /></div>
        </div>
        <div className="bf side right">
          <div className="windows" />
          <div className="stripe" />
          <div className="brand">அரசுப் பேருந்து</div>
          <div className="wheel w1"><i /></div>
          <div className="wheel w2"><i /></div>
        </div>
        <div className="bf front">
          <div className="board">{label}</div>
          <div className="windshield" />
          <div className="lights"><span /><span /></div>
          <div className="grille" />
        </div>
        <div className="bf back">
          <div className="rear-window" />
          <div className="tail"><span /><span /></div>
        </div>
        <div className="bf roof"><div className="ac-unit" /></div>
        <div className="bf floor" />
      </div>
    </button>
  );
}
