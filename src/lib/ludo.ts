export type Color = 'red' | 'blue' | 'green' | 'yellow';
export type Pawns = Record<Color, number[]>;
export type GamePhase = 'roll' | 'move' | 'gameover';
export type GameMode = 'pass' | 'computer' | 'friends' | 'online';

export const colors: Record<Color, { label: string; hex: string; soft: string; light: string }> = {
  red: { label: 'Red', hex: '#ef3340', soft: '#fff0f1', light: '#ffe0e2' },
  blue: { label: 'Blue', hex: '#2760d8', soft: '#eef4ff', light: '#d6e4ff' },
  green: { label: 'Green', hex: '#27b76b', soft: '#eefaf3', light: '#d9f5e4' },
  yellow: { label: 'Yellow', hex: '#f5af18', soft: '#fff9ea', light: '#fff3d0' },
};

export const colorOrder: Color[] = ['blue', 'red', 'green', 'yellow'];
export const playerNumber: Record<Color, number> = { blue: 1, red: 2, green: 3, yellow: 4 };
export const slotColor: Record<number, Color> = { 1: 'blue', 2: 'red', 3: 'green', 4: 'yellow' };

export const startIndices: Record<Color, number> = { blue: 0, red: 13, green: 26, yellow: 39 };

export const trackCoords: Array<[number, number]> = [
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
];

export const homeStretchCoords: Record<Color, Array<[number, number]>> = {
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

export const safeCellIndices: Set<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function initialPawns(): Pawns {
  return { red: [-1, -1, -1, -1], blue: [-1, -1, -1, -1], green: [-1, -1, -1, -1], yellow: [-1, -1, -1, -1] };
}

export function getLegalPawns(color: Color, pawns: Pawns, dice: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < 4; i++) {
    const pos = pawns[color][i];
    if (pos === 56) continue;
    if (pos === -1) { if (dice === 6) result.push(i); }
    else if (pos + dice <= 56) result.push(i);
  }
  return result;
}

export function checkCapture(color: Color, pawnIndex: number, diceValue: number, pawns: Pawns): boolean {
  const pos = pawns[color][pawnIndex];
  const newPos = pos === -1 ? 0 : pos + diceValue;
  if (newPos < 0 || newPos > 50) return false;
  const absPos = (startIndices[color] + newPos) % 52;
  if (safeCellIndices.has(absPos)) return false;
  for (const otherColor of colorOrder) {
    if (otherColor === color) continue;
    for (let i = 0; i < 4; i++) {
      const otherPos = pawns[otherColor][i];
      if (otherPos >= 0 && otherPos <= 50) {
        if ((startIndices[otherColor] + otherPos) % 52 === absPos) return true;
      }
    }
  }
  return false;
}

export function movePawn(color: Color, pawnIndex: number, diceValue: number, pawns: Pawns): Pawns {
  const newPawns: Pawns = { red: [...pawns.red], blue: [...pawns.blue], green: [...pawns.green], yellow: [...pawns.yellow] };
  const pos = newPawns[color][pawnIndex];
  newPawns[color][pawnIndex] = pos === -1 ? 0 : pos + diceValue;
  const newPos = newPawns[color][pawnIndex];
  if (newPos >= 0 && newPos <= 50) {
    const absPos = (startIndices[color] + newPos) % 52;
    if (!safeCellIndices.has(absPos)) {
      for (const otherColor of colorOrder) {
        if (otherColor === color) continue;
        for (let i = 0; i < 4; i++) {
          const otherPos = newPawns[otherColor][i];
          if (otherPos >= 0 && otherPos <= 50) {
            if ((startIndices[otherColor] + otherPos) % 52 === absPos) {
              newPawns[otherColor][i] = -1;
            }
          }
        }
      }
    }
  }
  return newPawns;
}

export function hasWon(color: Color, pawns: Pawns): boolean {
  return pawns[color].every((pos) => pos === 56);
}

export function getProgress(color: Color, pawns: Pawns): number {
  const total = pawns[color].reduce((sum, pos) => sum + (pos === -1 ? 0 : pos + 1), 0);
  return Math.min(100, Math.round((total / (4 * 57)) * 100));
}

export function getNextTurn(current: Color, active: Color[]): Color {
  const idx = active.indexOf(current);
  return active[(idx + 1) % active.length];
}

export function getPawnGridPos(color: Color, pos: number): [number, number] | null {
  if (pos === -1) return null;
  if (pos <= 50) return trackCoords[(startIndices[color] + pos) % 52];
  if (pos <= 55) return homeStretchCoords[color][pos - 51];
  return [7, 7];
}

export function getTrackStartColor(index: number): Color | null {
  if (index === 0) return 'blue';
  if (index === 13) return 'red';
  if (index === 26) return 'green';
  if (index === 39) return 'yellow';
  return null;
}

export function chooseComputerMove(color: Color, pawns: Pawns, dice: number, legalPawns: number[]): number {
  for (const idx of legalPawns) { if (checkCapture(color, idx, dice, pawns)) return idx; }
  for (const idx of legalPawns) { if (pawns[color][idx] + dice === 56) return idx; }
  if (dice === 6) { const base = legalPawns.find((i) => pawns[color][i] === -1); if (base !== undefined) return base; }
  return legalPawns.reduce((best, cur) => (pawns[color][cur] > pawns[color][best] ? cur : best));
}

export type RoomState = {
  hostName: string;
  turn: Color;
  dice: number;
  phase: GamePhase;
  pawns: Pawns;
  legalPawns: number[];
  slots: Record<number, string | null>;
};
