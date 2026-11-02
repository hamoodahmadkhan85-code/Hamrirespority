import type { CSSProperties } from 'react';

const dotPositions: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

export function DiceDots({ value, color = '#d62828' }: { value: number; color?: string }) {
  const dots = dotPositions[value] || [];
  return (
    <div className="dice-face" style={{ '--dot-color': color } as CSSProperties}>
      {dots.map(([x, y], i) => (
        <span key={i} className="dice-dot" style={{ left: `${x}%`, top: `${y}%` }} />
      ))}
    </div>
  );
}
