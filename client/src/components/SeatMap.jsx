// Seat grid rendered from row/col data. Sleepers show lower and upper decks.
export default function SeatMap({ seats, selected, onToggle, readOnly = false, showBoarded = false }) {
  const decks = [...new Set(seats.map((s) => s.deck || ''))];
  return (
    <div className="seatmap-wrap">
      <div className="legend" aria-hidden="true">
        <span><i className="seat-dot available" /> Available</span>
        <span><i className="seat-dot selected" /> Selected</span>
        <span><i className="seat-dot booked" /> Booked</span>
        {showBoarded && <span><i className="seat-dot boarded" /> Boarded</span>}
        <span><i className="seat-dot" style={{ background: '#74c0fc', borderColor: '#74c0fc', width: 6 }} /> Window</span>
      </div>
      <div className="decks">
        {decks.map((deck) => {
          const list = seats.filter((s) => (s.deck || '') === deck);
          const cols = Math.max(...list.map((s) => s.col_no)) + 1;
          const windowSide = (c) => (c === 0 ? 'window left' : c === cols - 1 ? 'window right' : '');
          return (
            <div key={deck || 'main'} className="deck">
              <div className="deck-title">{deck === 'L' ? 'Lower berth' : deck === 'U' ? 'Upper berth' : 'Front of bus · Driver 🧑‍✈️'}</div>
              <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${cols}, var(--seat))` }}>
                {list.map((s) => {
                  const isSel = selected?.includes(s.seat_no);
                  const taken = s.status !== 'available';
                  const cls = [
                    'seat',
                    deck ? 'berth' : '',
                    windowSide(s.col_no),
                    isSel ? 'selected' : taken ? 'booked' : 'available',
                    showBoarded && s.boarded ? 'boarded' : '',
                  ].join(' ');
                  return (
                    <button
                      key={s.seat_no}
                      type="button"
                      className={cls}
                      style={{ gridColumn: s.col_no + 1, gridRow: s.row_no + 1 }}
                      disabled={readOnly || (taken && !isSel)}
                      onClick={() => onToggle?.(s.seat_no)}
                      aria-pressed={isSel}
                      aria-label={`Seat ${s.seat_no}${windowSide(s.col_no) ? ' (window)' : ''}, ${isSel ? 'selected' : taken ? 'booked' : 'available'}`}
                    >
                      {s.seat_no}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
