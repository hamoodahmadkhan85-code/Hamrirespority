import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowLeft, BookOpen, Bot, ChevronRight, CircleHelp, Copy, Globe2, KeyRound, Moon, Pencil,
  Settings, Shield, Sparkles, Smartphone, SlidersHorizontal, Sun, Trophy,
  Users, UserRound, CircleUserRound, Volume2, VolumeX, X, Zap,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { ref, set, onValue, off, get } from 'firebase/database';
import {
  colors, colorOrder, slotColor, initialPawns, getLegalPawns,
  movePawn, hasWon, getNextTurn, getProgress, chooseComputerMove,
  trackCoords, homeStretchCoords, safeCellIndices, getTrackStartColor,
  type Color, type Pawns, type GamePhase, type GameMode, type RoomState,
} from '@/lib/ludo';
import { DiceDots } from '@/components/DiceDots';

type Mode = 'home' | 'game';
type Modal = 'settings' | 'friends' | 'computer' | 'pass' | 'online' | null;
type MatrixState = 'full' | 'minimized';
type Theme = 'light' | 'dark';

function App() {
  const [mode, setMode] = useState<Mode>('home');
  const [modal, setModal] = useState<Modal>(null);
  const [name, setName] = useState('Faaa');
  const [gender, setGender] = useState('Male');
  const [speed, setSpeed] = useState('Normal');
  const [sound, setSound] = useState(true);
  const [theme, setTheme] = useState<Theme>('light');
  const [secretVisible, setSecretVisible] = useState(false);
  const [password, setPassword] = useState('');
  const [matrix, setMatrix] = useState(false);
  const [matrixState, setMatrixState] = useState<MatrixState>('full');
  const [helpVisible, setHelpVisible] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [forcedDice, setForcedDice] = useState(0);
  const helpClickTimer = useRef<number | null>(null);
  const helpClickCount = useRef(0);

  const [roomCode, setRoomCode] = useState('');
  const [roomStatus, setRoomStatus] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [mySlot, setMySlot] = useState<number | null>(null);
  const [roomPlayers, setRoomPlayers] = useState<Record<number, string | null>>({ 1: null, 2: null, 3: null, 4: null });
  const roomRefKey = useRef<string | null>(null);

  const [computerStep, setComputerStep] = useState(1);
  const [playerColor, setPlayerColor] = useState<Color>('blue');
  const [opponents, setOpponents] = useState(2);
  const [computerColors, setComputerColors] = useState<Color[]>(['red', 'yellow']);
  const [passPlayers, setPassPlayers] = useState<Color[]>(['red', 'yellow']);

  // Game state
  const [gameMode, setGameMode] = useState<GameMode>('pass');
  const [activeColors, setActiveColors] = useState<Color[]>(colorOrder);
  const [turn, setTurn] = useState<Color>('blue');
  const [dice, setDice] = useState<number>(0);
  const [rolling, setRolling] = useState(false);
  const [phase, setPhase] = useState<GamePhase>('roll');
  const [pawns, setPawns] = useState<Pawns>(initialPawns);
  const [legalPawns, setLegalPawns] = useState<number[]>([]);
  const [winner, setWinner] = useState<Color | null>(null);
  const [diceAnim, setDiceAnim] = useState(false);

  const [unlimited, setUnlimited] = useState(false);
  const [applyMe, setApplyMe] = useState(true);
  const [applyOpponents, setApplyOpponents] = useState(false);
  const [drag, setDrag] = useState(false);
  const [hDrag, setHDrag] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);
  const hIconRef = useRef<HTMLDivElement>(null);
  const matrixDragData = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const hIconDragData = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const dragMoved = useRef(false);

  // Online matchmaking
  const [matchTimer, setMatchTimer] = useState(0);
  const [matchPlayers, setMatchPlayers] = useState(1);
  const matchTimerRef = useRef<number | null>(null);

  // Smooth drag: direct DOM transform manipulation (no React re-renders per move)
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const d = matrixDragData.current; if (!d) return;
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
      const el = matrixRef.current; if (el) el.style.transform = `translate3d(${d.origX + dx}px, ${d.origY + dy}px, 0)`;
    };
    const up = () => { matrixDragData.current = null; setDrag(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [drag]);

  useEffect(() => {
    if (!hDrag) return;
    const move = (event: PointerEvent) => {
      const d = hIconDragData.current; if (!d) return;
      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
      const el = hIconRef.current; if (el) el.style.transform = `translate3d(${d.origX + dx}px, ${d.origY + dy}px, 0)`;
    };
    const up = () => { hIconDragData.current = null; setHDrag(false); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [hDrag]);

  // Firebase room subscription
  useEffect(() => {
    if (!db || !roomRefKey.current) return;
    const roomRef = ref(db, `rooms/${roomRefKey.current}`);
    const handler = (snapshot: { val: () => RoomState | null }) => {
      const data = snapshot.val();
      if (!data) return;
      if (data.turn) setTurn(data.turn);
      if (data.dice !== undefined) setDice(data.dice);
      if (data.phase) setPhase(data.phase);
      if (data.pawns) setPawns(data.pawns);
      if (data.legalPawns) setLegalPawns(data.legalPawns);
      if (data.slots) setRoomPlayers(data.slots);
    };
    onValue(roomRef, handler);
    return () => off(roomRef, 'value', handler);
  }, [roomRefKey.current]);

  const pushRoomState = useCallback((partial: Partial<RoomState>) => {
    if (!db || !roomRefKey.current) return;
    set(ref(db, `rooms/${roomRefKey.current}`), {
      hostName: name,
      turn,
      dice,
      phase,
      pawns,
      legalPawns,
      slots: roomPlayers,
      ...partial,
    }).catch(() => {});
  }, [name, turn, dice, phase, pawns, legalPawns, roomPlayers]);

  const startGame = (selected: Color[], mode: GameMode) => {
    setGameMode(mode);
    setActiveColors(selected);
    setTurn(selected[0] ?? 'blue');
    const fresh = initialPawns();
    setPawns(fresh);
    setDice(0);
    setPhase('roll');
    setLegalPawns([]);
    setWinner(null);
    setMode('game');
    setModal(null);
  };

  const computeDice = useCallback((): number => {
    const isMyTurn = mySlot ? slotColor[mySlot] === turn : true;
    const targetMe = matrix && applyMe && isMyTurn;
    const targetOpp = matrix && applyOpponents && !isMyTurn;
    if (matrix && (targetMe || targetOpp)) {
      if (unlimited) return 6;
      if (forcedDice > 0) {
        const result = forcedDice;
        setForcedDice(0);
        return result;
      }
    }
    return Math.floor(Math.random() * 6) + 1;
  }, [matrix, applyMe, applyOpponents, unlimited, forcedDice, turn, mySlot]);

  const rollDice = useCallback(() => {
    if (rolling || phase !== 'roll' || winner) return;
    if (!activeColors.includes(turn)) return;
    setRolling(true);
    setDiceAnim(true);
    let animCount = 0;
    const animTimer = setInterval(() => {
      setDice(Math.floor(Math.random() * 6) + 1);
      animCount++;
      if (animCount >= 6) {
        clearInterval(animTimer);
        setDiceAnim(false);
        const result = computeDice();
        setDice(result);
        const legal = getLegalPawns(turn, pawns, result);
        setLegalPawns(legal);
        if (legal.length === 0) {
          window.setTimeout(() => {
            const isExtra = result === 6;
            const next = isExtra ? turn : getNextTurn(turn, activeColors);
            setTurn(next);
            setDice(0);
            setPhase('roll');
            setRolling(false);
            if (roomRefKey.current) pushRoomState({ turn: next, dice: 0, phase: 'roll' as GamePhase, legalPawns: [] });
          }, 1200);
        } else {
          setRolling(false);
          setPhase('move');
          if (roomRefKey.current) pushRoomState({ dice: result, phase: 'move' as GamePhase, legalPawns: legal });
        }
      }
    }, 80);
  }, [rolling, phase, winner, turn, pawns, activeColors, computeDice, pushRoomState]);

  const movePawnByPlayer = useCallback((color: Color, pawnIndex: number) => {
    if (phase !== 'move' || color !== turn || rolling) return;
    if (!activeColors.includes(color)) return;
    if (!legalPawns.includes(pawnIndex)) return;
    const newPawns = movePawn(color, pawnIndex, dice, pawns);
    setPawns(newPawns);
    setPhase('roll');
    setDice(0);
    setLegalPawns([]);
    if (hasWon(color, newPawns)) {
      setWinner(color);
      return;
    }
    const isExtraTurn = dice === 6;
    const next = isExtraTurn ? turn : getNextTurn(turn, activeColors);
    setTurn(next);
    if (roomRefKey.current) pushRoomState({ pawns: newPawns, phase: 'roll' as GamePhase, dice: 0, legalPawns: [], turn: next });
  }, [phase, turn, rolling, legalPawns, dice, pawns, activeColors, pushRoomState]);

  // Computer bot: auto-roll and auto-move
  useEffect(() => {
    if (mode !== 'game' || winner) return;
    if (gameMode !== 'computer') return;
    if (!computerColors.includes(turn)) return;

    if (phase === 'roll' && !rolling) {
      const timer = window.setTimeout(() => rollDice(), 700);
      return () => clearTimeout(timer);
    }
    if (phase === 'move' && legalPawns.length > 0 && !rolling) {
      const timer = window.setTimeout(() => {
        const choice = chooseComputerMove(turn, pawns, dice, legalPawns);
        movePawnByPlayer(turn, choice);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [mode, gameMode, turn, phase, rolling, legalPawns, dice, pawns, winner, computerColors, rollDice, movePawnByPlayer]);

  const showFriends = () => { setModal('friends'); setRoomStatus(''); setRoomCode(''); };

  const createRoom = () => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setRoomCode(code);
    setIsHost(true);
    setMySlot(1);
    setRoomPlayers({ 1: name, 2: null, 3: null, 4: null });
    setRoomStatus('Room created · share the code with friends');
    if (db) {
      roomRefKey.current = code;
      const fresh = initialPawns();
      set(ref(db, `rooms/${code}`), {
        hostName: name, turn: 'blue' as Color, dice: 0, phase: 'roll' as GamePhase,
        pawns: fresh, legalPawns: [], slots: { 1: name, 2: null, 3: null, 4: null },
      }).catch(() => setRoomStatus('Room created locally · online sync unavailable'));
    } else {
      setRoomStatus('Room created · online sync needs Firebase config');
    }
  };

  const joinRoom = async () => {
    if (roomCode.length !== 6) return;
    if (!db) { setRoomStatus('Cannot connect · Firebase not configured'); return; }
    roomRefKey.current = roomCode;
    const roomRef = ref(db, `rooms/${roomCode}`);
    try {
      const snapshot = await get(roomRef);
      const data = snapshot.val() as RoomState | null;
      if (!data) { setRoomStatus('Invalid Room Code'); return; }
      const slots = data.slots ?? { 1: null, 2: null, 3: null, 4: null };
      let assignedSlot: number | null = null;
      for (let i = 1; i <= 4; i++) { if (!slots[i]) { assignedSlot = i; slots[i] = name; break; } }
      if (!assignedSlot) { setRoomStatus('Room Full'); return; }
      setIsHost(false);
      setMySlot(assignedSlot);
      setRoomPlayers(slots);
      setRoomStatus(`Joined as ${colors[slotColor[assignedSlot]].label}`);
      set(ref(db, `rooms/${roomCode}/slots/${assignedSlot}`), name).catch(() => {});
    } catch { setRoomStatus('Connection error'); }
  };

  const handleHelpClick = () => {
    helpClickCount.current += 1;
    const count = helpClickCount.current;

    if (count >= 2) {
      if (helpClickTimer.current) { clearTimeout(helpClickTimer.current); helpClickTimer.current = null; }
      helpClickCount.current = 0;
      setSecretVisible(true);
      return;
    }
  };

  const verifyPassword = () => {
    if (password === '12157') { setMatrix(true); setMatrixState('full'); setModal(null); setPassword(''); setSecretVisible(false); setPasswordError(false); }
    else { setPasswordError(true); setPassword(''); window.setTimeout(() => setPasswordError(false), 1500); }
  };

  const startMatchmaking = () => {
    setModal('online');
    setMatchTimer(20);
    setMatchPlayers(1);
    matchTimerRef.current = window.setInterval(() => {
      setMatchTimer((prev) => {
        if (prev <= 1) {
          if (matchTimerRef.current) { clearInterval(matchTimerRef.current); matchTimerRef.current = null; }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (modal !== 'online' || matchTimer === 0) return;
    const fakeJoin = window.setTimeout(() => {
      setMatchPlayers((p) => Math.min(p + 1, 4));
    }, 5000 + Math.random() * 8000);
    return () => clearTimeout(fakeJoin);
  }, [modal, matchTimer]);

  const finishMatchmaking = () => {
    if (matchTimerRef.current) { clearInterval(matchTimerRef.current); matchTimerRef.current = null; }
    const botNames = ['Ahmed', 'Hamza', 'Zayd', 'Omar', 'Bilal', 'Ali', 'Hassan', 'Usman'];
    const needed = 4 - matchPlayers;
    const bots: string[] = [];
    const pool = [...botNames];
    for (let i = 0; i < needed; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      bots.push(pool.splice(idx, 1)[0]);
    }
    const allNames = [name, ...bots];
    const activeSlots = allNames.length;
    const selected = colorOrder.slice(0, activeSlots);
    const botColors = selected.slice(1);
    setComputerColors(botColors);
    setPlayerColor('blue');
    setMySlot(1);
    startGame(selected, 'computer');
  };

  useEffect(() => {
    if (modal === 'online' && matchTimer === 0) finishMatchmaking();
  }, [modal, matchTimer]);

  const cancelMatchmaking = () => {
    if (matchTimerRef.current) { clearInterval(matchTimerRef.current); matchTimerRef.current = null; }
    setModal(null);
    setMatchTimer(0);
  };

  const startRoomGame = () => { startGame(colorOrder, 'friends'); if (roomRefKey.current) pushRoomState({ turn: 'blue' }); };
  const exitGame = () => { if (roomRefKey.current && db) set(ref(db, `rooms/${roomRefKey.current}`), null).catch(() => {}); roomRefKey.current = null; setMode('home'); setWinner(null); };

  const playerLabel = (color: Color) => {
    if (gameMode === 'computer') {
      if (color === playerColor) return 'Player 1';
      const computerIndex = computerColors.indexOf(color);
      return computerIndex >= 0 ? `Computer ${computerIndex + 1}` : `${colors[color].label} Player`;
    }
    return color === slotColor[mySlot ?? 0] && mySlot ? name : `${colors[color].label} Player`;
  };

  return (
    <main className={`app-shell theme-${theme}`}>
      {mode === 'home' ? (
        <section className="home-screen">
          <div className="home-glow glow-one" /><div className="home-glow glow-two" />
          <header className="home-header"><div className="brand-mark"><Sparkles size={16} /></div><span className="header-brand">HAMOOD LUDO</span><button className="icon-button" onClick={() => setModal('settings')} aria-label="Open settings"><Settings size={21} /></button></header>
          <div className="hero-copy"><div className="eyebrow">THE CLASSIC · REIMAGINED</div><h1><span className="title-gradient">HAMOOD</span><br /><em>LUDO</em></h1><p>Roll your way to victory.</p></div>
          <div className="profile-panel"><label>ENTER PROFILE NAME</label><div className="input-wrap"><Pencil size={15} /><input value={name} onChange={(event) => setName(event.target.value)} /></div><label>SELECT GENDER</label><div className="gender-grid">{['Male', 'Female'].map((value) => <button key={value} className={gender === value ? 'choice active' : 'choice'} onClick={() => setGender(value)}>{value}</button>)}</div></div>
          <div className="mode-list">
            <ModeButton icon={<Globe2 />} title="Play Online" subtitle="Find players around the world" onClick={startMatchmaking} />
            <ModeButton icon={<Users />} title="Play with Friends" subtitle="Create or join a private room" onClick={showFriends} />
            <ModeButton icon={<Smartphone />} title="Pass & Play" subtitle="Share one screen with friends" onClick={() => setModal('pass')} />
            <ModeButton icon={<Bot />} title="Play with Computer" subtitle="Practice against smart bots" onClick={() => { setComputerStep(1); setModal('computer'); }} />
          </div>
          <div className="home-footer"><span><Shield size={14} /> Fair play, always</span><button onClick={() => setModal('settings')}><SlidersHorizontal size={14} /> Game settings</button></div>
        </section>
      ) : (
        <GameBoard
          name={name}
          gender={gender}
          turn={turn}
          dice={dice}
          rolling={rolling}
          phase={phase}
          pawns={pawns}
          legalPawns={legalPawns}
          activeColors={activeColors}
          winner={winner}
          playerLabel={playerLabel}
          gameMode={gameMode}
          computerColors={computerColors}
          playerColor={playerColor}
          onRoll={rollDice}
          onMovePawn={movePawnByPlayer}
          onBack={exitGame}
          onSettings={() => setModal('settings')}
          diceAnim={diceAnim}
        />
      )}

      {modal === 'settings' && <SettingsModal name={name} setName={setName} gender={gender} setGender={setGender} speed={speed} setSpeed={setSpeed} sound={sound} setSound={setSound} theme={theme} setTheme={setTheme} secretVisible={secretVisible} setSecretVisible={setSecretVisible} password={password} setPassword={setPassword} onVerify={verifyPassword} onRules={() => { setModal(null); setHelpVisible(true); }} onHelpClick={handleHelpClick} onClose={() => setModal(null)} passwordError={passwordError} />}
      {modal === 'friends' && <FriendsModal roomCode={roomCode} setRoomCode={setRoomCode} roomStatus={roomStatus} roomPlayers={roomPlayers} isHost={isHost} onCreate={createRoom} onJoin={joinRoom} onStart={startRoomGame} onClose={() => setModal(null)} />}
      {modal === 'pass' && <PassModal selected={passPlayers} setSelected={setPassPlayers} onStart={() => startGame(passPlayers, 'pass')} onClose={() => setModal(null)} />}
      {modal === 'computer' && <ComputerModal step={computerStep} setStep={setComputerStep} playerColor={playerColor} setPlayerColor={setPlayerColor} opponents={opponents} setOpponents={setOpponents} selected={computerColors} setSelected={setComputerColors} onStart={() => startGame([playerColor, ...computerColors], 'computer')} onClose={() => setModal(null)} />}
      {modal === 'online' && <OnlineModal timer={matchTimer} players={matchPlayers} onCancel={cancelMatchmaking} onForceStart={finishMatchmaking} onClose={() => setModal(null)} />}
      {helpVisible && <RulesModal onClose={() => setHelpVisible(false)} />}

      {mode === 'game' && matrix && matrixState === 'full' && (
        <MatrixPanel matrixRef={matrixRef} startMatrixDrag={(e) => { const el = matrixRef.current; const rect = el?.getBoundingClientRect(); const t = el?.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/); matrixDragData.current = { startX: e.clientX, startY: e.clientY, origX: t ? +t[1] : 0, origY: t ? +t[2] : 0 }; dragMoved.current = false; if (rect && !t) el!.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`; setDrag(true); }} onClose={() => setMatrix(false)} onMinimize={() => setMatrixState('minimized')} forcedDice={forcedDice} setForcedDice={setForcedDice} unlimited={unlimited} setUnlimited={setUnlimited} applyMe={applyMe} setApplyMe={setApplyMe} applyOpponents={applyOpponents} setApplyOpponents={setApplyOpponents} />
      )}
      {mode === 'game' && matrix && matrixState === 'minimized' && (
        <MatrixHIcon hIconRef={hIconRef} startHDrag={(e) => { const el = hIconRef.current; const rect = el?.getBoundingClientRect(); const t = el?.style.transform.match(/translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/); hIconDragData.current = { startX: e.clientX, startY: e.clientY, origX: t ? +t[1] : 0, origY: t ? +t[2] : 0 }; dragMoved.current = false; if (rect && !t) el!.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`; setHDrag(true); }} onOpen={() => { if (!dragMoved.current) setMatrixState('full'); }} />
      )}
    </main>
  );
}

function ModeButton({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return <button className="mode-button" onClick={onClick}><span className="mode-icon">{icon}</span><span><strong>{title}</strong><small>{subtitle}</small></span><ChevronRight size={18} /></button>;
}

function SettingsModal(props: { name: string; setName: (v: string) => void; gender: string; setGender: (v: string) => void; speed: string; setSpeed: (v: string) => void; sound: boolean; setSound: (v: boolean) => void; theme: Theme; setTheme: (v: Theme) => void; secretVisible: boolean; setSecretVisible: (v: boolean) => void; password: string; setPassword: (v: string) => void; onVerify: () => void; onRules: () => void; onHelpClick: () => void; onClose: () => void; passwordError: boolean }) {
  const passwordRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (props.secretVisible) passwordRef.current?.focus(); }, [props.secretVisible]);
  return <ModalFrame title="GAME SETTINGS" onClose={props.onClose}><label>EDIT PROFILE NAME</label><div className="input-wrap"><Pencil size={15} /><input value={props.name} onChange={(event) => props.setName(event.target.value)} /></div><label>CHANGE GENDER</label><div className="gender-grid">{['Male', 'Female'].map((value) => <button key={value} className={props.gender === value ? 'choice active' : 'choice'} onClick={() => props.setGender(value)}>{value}</button>)}</div><button className="primary-button">Save Profile</button><label>GAME SPEED</label><div className="speed-grid">{['Normal', 'Fast', 'Turbo'].map((value) => <button key={value} className={props.speed === value ? 'choice active' : 'choice'} onClick={() => props.setSpeed(value)}>{value}</button>)}</div><button className="setting-row" onClick={() => props.setSound(!props.sound)}><span>{props.sound ? <Volume2 size={17} /> : <VolumeX size={17} />} Sound Effects</span><Toggle active={props.sound} /></button><button className="setting-row" onClick={() => props.setTheme(props.theme === 'light' ? 'dark' : 'light')}><span>{props.theme === 'light' ? <Sun size={17} /> : <Moon size={17} />} Theme · {props.theme === 'light' ? 'Light Mode' : 'Dark Mode'}</span><Toggle active={props.theme === 'dark'} /></button><button className="guide-button" onClick={props.onRules}><BookOpen size={17} /> Rules & Regulations</button><button className="guide-button" onClick={props.onHelpClick}><CircleHelp size={17} /> Help & Guide</button>{props.secretVisible && <div className="secret-area"><div className="input-wrap"><KeyRound size={15} /><input ref={passwordRef} type="password" maxLength={5} placeholder="Enter 5-digit passcode" value={props.password} onChange={(event) => props.setPassword(event.target.value.replace(/\D/g, ''))} onKeyDown={(event) => { if (event.key === 'Enter') props.onVerify(); }} /></div>{props.passwordError && <p className="password-error">wrong password</p>}<button className="primary-button" onClick={props.onVerify}>Verify</button></div>}</ModalFrame>;
}

function FriendsModal({ roomCode, setRoomCode, roomStatus, roomPlayers, isHost, onCreate, onJoin, onStart, onClose }: { roomCode: string; setRoomCode: (v: string) => void; roomStatus: string; roomPlayers: Record<number, string | null>; isHost: boolean; onCreate: () => void; onJoin: () => void; onStart: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const slotsFilled = Object.values(roomPlayers).filter(Boolean).length;
  const copyCode = () => { navigator.clipboard?.writeText(roomCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return <ModalFrame title="PLAY WITH FRIENDS" onClose={onClose}><div className="connection-pill"><span className="pulse-dot" /> Cross-city rooms are live</div><button className="room-action" onClick={onCreate}><span className="room-icon">#</span><span><b>Create Room</b><small>Host a private game · you are Blue</small></span><ChevronRight size={17} /></button><div className="or-line"><span>OR</span></div><div className="room-input"><KeyRound size={17} /><input maxLength={6} placeholder="Enter 6-digit room code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, ''))} /><button onClick={onJoin}>Join</button></div>{roomCode && <div className="room-code"><span>{isHost ? 'YOUR ROOM CODE' : 'ROOM CODE'}</span><div className="room-code-row"><strong>{roomCode}</strong><button className="copy-button" onClick={copyCode} aria-label="Copy room code"><Copy size={16} />{copied ? 'Copied' : 'Copy'}</button></div><small>{roomStatus || 'Share this code with friends'}</small><div className="room-slots">{[1, 2, 3, 4].map((slot) => <i key={slot} className={roomPlayers[slot] ? 'filled' : ''}>{roomPlayers[slot] ? roomPlayers[slot] : `Slot ${slot}`}</i>)}</div><button className="primary-button" disabled={slotsFilled < 2 && isHost} onClick={onStart}>{isHost ? 'Start Game' : 'Waiting for host...'}</button></div>}</ModalFrame>;
}

function PassModal({ selected, setSelected, onStart, onClose }: { selected: Color[]; setSelected: (v: Color[]) => void; onStart: () => void; onClose: () => void }) {
  const toggle = (color: Color) => setSelected(selected.includes(color) ? selected.filter((item) => item !== color) : [...selected, color]);
  return <ModalFrame title="PASS & PLAY" onClose={onClose}><p className="modal-intro">Choose the players sharing this screen.</p><div className="color-options">{colorOrder.map((color) => <button key={color} style={{ '--tone': colors[color].hex, '--soft': colors[color].soft } as React.CSSProperties} className={selected.includes(color) ? 'color-option selected' : 'color-option'} onClick={() => toggle(color)}><span>{colors[color].label}</span><span className="radio-dot" /></button>)}</div><p className="selection-note">{selected.length} players selected · tap to toggle</p><button className="primary-button" disabled={selected.length < 2} onClick={onStart}>Start Pass & Play</button></ModalFrame>;
}

function ComputerModal({ step, setStep, playerColor, setPlayerColor, opponents, setOpponents, selected, setSelected, onStart, onClose }: { step: number; setStep: (v: number) => void; playerColor: Color; setPlayerColor: (v: Color) => void; opponents: number; setOpponents: (v: number) => void; selected: Color[]; setSelected: (v: Color[]) => void; onStart: () => void; onClose: () => void }) {
  const toggle = (color: Color) => setSelected(selected.includes(color) ? selected.filter((item) => item !== color) : selected.length < opponents ? [...selected, color] : selected);
  return <ModalFrame title={`PLAY WITH COMPUTER · STEP ${step} OF 3`} onClose={onClose}>{step === 1 && <><h3>Choose Your Color</h3><div className="color-options two-col">{colorOrder.map((color) => <button key={color} style={{ '--tone': colors[color].hex, '--soft': colors[color].soft } as React.CSSProperties} className={playerColor === color ? 'color-option selected' : 'color-option'} onClick={() => setPlayerColor(color)}><span>{colors[color].label}</span><span className="radio-dot" /></button>)}</div><button className="primary-button" onClick={() => setStep(2)}>Continue</button></>}{step === 2 && <><h3>How many computer opponents?</h3><div className="number-options">{[1, 2, 3].map((value) => <button key={value} className={opponents === value ? 'number-choice selected' : 'number-choice'} onClick={() => { setOpponents(value); setSelected([]); setStep(3); }}>{value}</button>)}</div><button className="text-button" onClick={() => setStep(1)}>Back</button></>}{step === 3 && <><h3>Select Computer Colors</h3><div className="color-options two-col">{colorOrder.filter((color) => color !== playerColor).map((color) => <button key={color} style={{ '--tone': colors[color].hex, '--soft': colors[color].soft } as React.CSSProperties} className={selected.includes(color) ? 'color-option selected' : 'color-option'} onClick={() => toggle(color)}><span>{colors[color].label}</span><span className="radio-dot" /></button>)}</div><p className="selection-note">Pick {opponents} colors · {selected.length}/{opponents}</p><button className="primary-button" disabled={selected.length !== opponents} onClick={onStart}>Start Game</button><button className="text-button" onClick={() => setStep(2)}>Back</button></>}</ModalFrame>;
}

function ModalFrame({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop"><section className="modal-card"><div className="modal-title"><span>{title}</span><button onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</section></div>; }
function Toggle({ active }: { active: boolean }) { return <span className={active ? 'toggle active' : 'toggle'}><i /></span>; }

function GameBoard({ name, gender, turn, dice, rolling, phase, pawns, legalPawns, activeColors, winner, playerLabel, gameMode, computerColors, playerColor, onRoll, onMovePawn, onBack, onSettings, diceAnim }: {
  name: string; gender: string; turn: Color; dice: number; rolling: boolean; phase: GamePhase; pawns: Pawns; legalPawns: number[]; activeColors: Color[]; winner: Color | null;
  playerLabel: (color: Color) => string; gameMode: GameMode; computerColors: Color[]; playerColor: Color; onRoll: () => void; onMovePawn: (color: Color, pawnIndex: number) => void; onBack: () => void; onSettings: () => void; diceAnim: boolean;
}) {
  if (winner) {
    return (
      <section className="game-screen winner-screen">
        <div className="winner-card">
          <Trophy size={48} style={{ color: colors[winner].hex }} />
          <h2>{playerLabel(winner)} Wins!</h2>
          <p>Congratulations on completing the journey</p>
          <button className="primary-button" onClick={onBack}>Back to Menu</button>
        </div>
      </section>
    );
  }
  const progressMap = activeColors.reduce((acc, c) => { acc[c] = getProgress(c, pawns); return acc; }, {} as Record<Color, number>);
  const topColor = activeColors[1] ?? activeColors[0] ?? 'red';
  const bottomLeftColor = activeColors[0] ?? 'blue';
  const bottomRightColor = activeColors[2] ?? activeColors[1] ?? 'yellow';
  const isComputer = (color: Color) => gameMode === 'computer' && color !== playerColor;
  return (
    <section className="game-screen">
      <header className="game-header">
        <button className="round-button" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="header-center"><span className="header-title">HAMOOD LUDO</span><div className="turn-banner" style={{ background: colors[turn].soft, color: colors[turn].hex }}><span className="turn-pulse" style={{ background: colors[turn].hex }} />{playerLabel(turn)}'S Turn</div></div>
        <button className="round-button" onClick={onSettings}><Settings size={20} /></button>
      </header>

      <div className="game-layout">
        {activeColors.includes('red') && <div className="corner-player corner-red"><PlayerCard color="red" name={playerLabel('red')} progress={progressMap.red} active={turn === 'red'} icon={isComputer('red') ? 'computer' : 'person'} gender={gender} dice={turn === 'red' ? dice : undefined} onDice={() => phase === 'roll' && !rolling && onRoll()} rolling={turn === 'red' && (rolling || diceAnim)} /></div>}
        {activeColors.includes('green') && <div className="corner-player corner-green"><PlayerCard color="green" name={playerLabel('green')} progress={progressMap.green} active={turn === 'green'} icon={isComputer('green') ? 'computer' : 'person'} gender={gender} dice={turn === 'green' ? dice : undefined} onDice={() => phase === 'roll' && !rolling && onRoll()} rolling={turn === 'green' && (rolling || diceAnim)} /></div>}
        {activeColors.includes('blue') && <div className="corner-player corner-blue"><PlayerCard color="blue" name={playerLabel('blue')} progress={progressMap.blue} active={turn === 'blue'} icon={isComputer('blue') ? 'computer' : 'person'} gender={gender} dice={turn === 'blue' ? dice : undefined} onDice={() => phase === 'roll' && !rolling && onRoll()} rolling={turn === 'blue' && (rolling || diceAnim)} /></div>}
        {activeColors.includes('yellow') && <div className="corner-player corner-yellow"><PlayerCard color="yellow" name={playerLabel('yellow')} progress={progressMap.yellow} active={turn === 'yellow'} icon={isComputer('yellow') ? 'computer' : 'person'} gender={gender} dice={turn === 'yellow' ? dice : undefined} onDice={() => phase === 'roll' && !rolling && onRoll()} rolling={turn === 'yellow' && (rolling || diceAnim)} /></div>}
        <LudoBoard pawns={pawns} turn={turn} activeColors={activeColors} legalPawns={legalPawns} phase={phase} onPawnClick={(pawnIndex) => onMovePawn(turn, pawnIndex)} />
        {phase === 'move' && <p className="move-hint">Tap a highlighted pawn to move it</p>}
      </div>

      <div className="rule-hint"><Sparkles size={14} /> {gameMode === 'computer' ? 'Bots play automatically · tap your dice & pawns' : 'Roll a 6 to release a pawn · roll again on a 6'}</div>
    </section>
  );
}

function PlayerCard({ color, name, progress, active, icon, gender, dice, onDice, rolling }: { color: Color; name: string; progress: number; active: boolean; icon: 'person' | 'computer'; gender?: string; dice?: number; onDice?: () => void; rolling?: boolean }) {
  const avatar = icon === 'computer' ? <Bot size={20} strokeWidth={2.5} /> : gender === 'Female' ? <CircleUserRound size={20} strokeWidth={2.5} /> : <UserRound size={20} strokeWidth={2.5} />;
  return <div className={active ? 'corner-card active' : 'corner-card'} style={{ '--tone': colors[color].hex, '--soft': colors[color].soft } as React.CSSProperties}><div className="corner-avatar" style={{ background: colors[color].hex }}>{avatar}</div><div className="corner-info"><strong>{name}</strong><span>{progress}%</span></div><div className="corner-profile-icon" style={{ color: colors[color].hex }}>{avatar}</div>{dice !== undefined && <button className={`card-dice ${rolling ? 'rolling' : ''}`} onClick={onDice} aria-label="Roll dice">{rolling ? '···' : (dice === 0 ? 'ROLL' : <DiceDots value={dice} color={colors[color].hex} />)}</button>}</div>;
}

function LudoBoard({ pawns, turn, activeColors, legalPawns, phase, onPawnClick }: { pawns: Pawns; turn: Color; activeColors: Color[]; legalPawns: number[]; phase: GamePhase; onPawnClick: (pawnIndex: number) => void }) {
  const activeSet = new Set(activeColors);
  const trackSet = new Set(trackCoords.map(([r, c]) => `${r},${c}`));
  const stretchSet = new Set<string>();
  for (const color of colorOrder) homeStretchCoords[color].forEach(([r, c]) => stretchSet.add(`${r},${c}`));
  const cellColor: Record<string, Color> = {};
  const cellSafe = new Set<string>();
  for (let i = 0; i < 52; i++) {
    const [r, c] = trackCoords[i]; cellColor[`${r},${c}`] = getTrackStartColor(i) ?? cellColor[`${r},${c}`];
    if (safeCellIndices.has(i)) cellSafe.add(`${r},${c}`);
  }
  const stretchColor: Record<string, Color> = {};
  for (const color of colorOrder) homeStretchCoords[color].forEach(([r, c]) => { stretchColor[`${r},${c}`] = color; });
  const allPawnsOnBoard: Array<{ color: Color; index: number; row: number; col: number }> = [];
  for (const color of colorOrder) {
    pawns[color].forEach((pos, index) => {
      if (pos === -1) return;
      const coord = pos === 56 ? [7, 7] : getPawnCoord(color, pos);
      if (coord) allPawnsOnBoard.push({ color, index, row: coord[0], col: coord[1] });
    });
  }
  return (
    <div className="ludo-board">
      <div className={`home-zone zone-red ${activeSet.has('red') ? '' : 'vacant'}`}><PawnBase color="red" active={activeSet.has('red')} pawns={pawns} turn={turn} legalPawns={legalPawns} phase={phase} onPawnClick={onPawnClick} /></div>
      <div className={`home-zone zone-green ${activeSet.has('green') ? '' : 'vacant'}`}><PawnBase color="green" active={activeSet.has('green')} pawns={pawns} turn={turn} legalPawns={legalPawns} phase={phase} onPawnClick={onPawnClick} /></div>
      <div className={`home-zone zone-blue ${activeSet.has('blue') ? '' : 'vacant'}`}><PawnBase color="blue" active={activeSet.has('blue')} pawns={pawns} turn={turn} legalPawns={legalPawns} phase={phase} onPawnClick={onPawnClick} /></div>
      <div className={`home-zone zone-yellow ${activeSet.has('yellow') ? '' : 'vacant'}`}><PawnBase color="yellow" active={activeSet.has('yellow')} pawns={pawns} turn={turn} legalPawns={legalPawns} phase={phase} onPawnClick={onPawnClick} /></div>
      <div className="board-grid">
        {Array.from({ length: 15 * 15 }).map((_, idx) => {
          const row = Math.floor(idx / 15); const col = idx % 15; const key = `${row},${col}`;
          const isTrack = trackSet.has(key);
          const isStretch = stretchSet.has(key);
          const isCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;
          if (!isTrack && !isStretch && !isCenter) return null;
          const startColor = cellColor[key];
          const stretchCol = stretchColor[key];
          const isSafe = cellSafe.has(key);
          const pawnsHere = allPawnsOnBoard.filter((p) => p.row === row && p.col === col);
          const classes = ['grid-cell'];
          if (isTrack) classes.push('track-cell');
          if (isStretch) classes.push('stretch-cell');
          if (isSafe) classes.push('safe-cell');
          if (startColor) classes.push(`start-${startColor}`);
          const bgStyle: React.CSSProperties = stretchCol ? { background: colors[stretchCol].light } : startColor ? { background: colors[startColor].light } : {};
          return <div key={idx} className={classes.join(' ')} style={{ gridRow: row + 1, gridColumn: col + 1, ...bgStyle }}>{isSafe && <span className="star">★</span>}{pawnsHere.length > 0 && pawnsHere.map((p) => {
            const isLegalPawn = turn === p.color && phase === 'move' && legalPawns.includes(p.index);
            return <div key={`${p.color}-${p.index}`} className={`board-pawn ${isLegalPawn ? 'legal' : ''}`} style={{ background: colors[p.color].hex, '--glow': colors[p.color].hex } as React.CSSProperties} onClick={() => isLegalPawn && onPawnClick(p.index)}>{pawnsHere.length > 1 && <span>{pawnsHere.length}</span>}</div>;
          })}</div>;
        })}
        <div className="center-triangle" />
      </div>
    </div>
  );
}

function getPawnCoord(color: Color, pos: number): [number, number] | null {
  if (pos <= 50) {
    const startIdx = { blue: 0, red: 13, green: 26, yellow: 39 }[color];
    return trackCoords[(startIdx + pos) % 52];
  }
  if (pos <= 55) return homeStretchCoords[color][pos - 51];
  return [7, 7];
}

function PawnBase({ color, active, pawns, turn, legalPawns, phase, onPawnClick }: { color: Color; active: boolean; pawns: Pawns; turn: Color; legalPawns: number[]; phase: GamePhase; onPawnClick: (pawnIndex: number) => void }) {
  if (!active) return <div className="vacant-base">VACANT</div>;
  const basePawns = pawns[color].map((pos, index) => ({ pos, index })).filter((p) => p.pos === -1);
  return (
    <div className="pawn-base">
      {basePawns.map((p) => {
        const isLegal = turn === color && phase === 'move' && legalPawns.includes(p.index);
        return <div key={p.index} className={`base-pawn ${isLegal ? 'legal' : ''}`} style={{ background: colors[color].hex, '--glow': colors[color].hex } as React.CSSProperties} onClick={() => isLegal && onPawnClick(p.index)} />;
      })}
    </div>
  );
}

function MatrixPanel({ matrixRef, startMatrixDrag, onClose, onMinimize, forcedDice, setForcedDice, unlimited, setUnlimited, applyMe, setApplyMe, applyOpponents, setApplyOpponents }: { matrixRef: React.RefObject<HTMLDivElement>; startMatrixDrag: (event: ReactPointerEvent<HTMLDivElement>) => void; onClose: () => void; onMinimize: () => void; forcedDice: number; setForcedDice: (v: number) => void; unlimited: boolean; setUnlimited: (v: boolean) => void; applyMe: boolean; setApplyMe: (v: boolean) => void; applyOpponents: boolean; setApplyOpponents: (v: boolean) => void }) {
  return <div ref={matrixRef} className="matrix-panel" onClick={(event) => { const target = event.target as HTMLElement; if (!target.closest('button')) onMinimize(); }}><div className="matrix-header" onPointerDown={startMatrixDrag}><span className="drag-handle">:::</span><strong>MATRIX</strong><button onClick={onClose} aria-label="Close matrix"><X size={17} /></button></div><div className="matrix-body"><div className="matrix-numbers">{[1, 2, 3, 4, 5, 6].map((value) => <button key={value} className={forcedDice === value ? 'selected' : ''} onClick={() => setForcedDice(forcedDice === value ? 0 : value)}>{value}</button>)}</div><button className={unlimited ? 'matrix-action active' : 'matrix-action'} onClick={() => setUnlimited(!unlimited)}><Zap size={15} /> Unlimited 6 <Toggle active={unlimited} /></button><MatrixToggle label="Apply to Me" active={applyMe} setActive={setApplyMe} /><MatrixToggle label="Apply to Opponents" active={applyOpponents} setActive={setApplyOpponents} /><p className="matrix-hint">Tap empty space to minimize</p></div></div>;
}

function MatrixHIcon({ hIconRef, startHDrag, onOpen }: { hIconRef: React.RefObject<HTMLDivElement>; startHDrag: (event: ReactPointerEvent<HTMLDivElement>) => void; onOpen: () => void }) {
  return <div ref={hIconRef} className="matrix-h-icon" onPointerDown={startHDrag} onClick={onOpen}><span>H</span></div>;
}

function MatrixToggle({ label, active, setActive }: { label: string; active: boolean; setActive: (v: boolean) => void }) { return <button className="matrix-toggle" onClick={() => setActive(!active)}><span>{label}</span><Toggle active={active} /></button>; }

function OnlineModal({ timer, players, onCancel, onForceStart, onClose }: { timer: number; players: number; onCancel: () => void; onForceStart: () => void; onClose: () => void }) {
  const slots = [1, 2, 3, 4];
  return <ModalFrame title="FINDING PLAYERS" onClose={onClose}><div className="matchmaking-timer">{timer > 0 ? `${timer}s` : 'Matching...'}</div><div className="matchmaking-bar"><div className="matchmaking-fill" style={{ width: `${((20 - timer) / 20) * 100}%` }} /></div><p className="modal-intro">Scanning for real players · bots fill empty slots after 20s</p><div className="room-slots">{slots.map((slot) => <i key={slot} className={slot <= players ? 'filled' : ''}>{slot <= players ? (slot === 1 ? 'You' : 'Player joined') : 'Searching...'}</i>)}</div><p className="selection-note">{players}/4 players found</p>{players >= 2 && <button className="primary-button" onClick={onForceStart}>Start Now ({players} players)</button>}<button className="text-button" onClick={onCancel}>Cancel</button></ModalFrame>;
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return <ModalFrame title="RULES & REGULATIONS" onClose={onClose}><div className="rules-content"><ol><li><strong>GAME OVERVIEW:</strong> The game is played by 2 to 4 players, each starting with 4 tokens in their colored Home Yard.</li><li><strong>STARTING THE GAME:</strong> A player must roll a 6 to release a token from the Home Yard onto the starting track.</li><li><strong>DICE ROLLING & SIXES:</strong> Rolling a 6 grants an extra turn.</li><li><strong>UNLIMITED SIX OPTION:</strong> Special rule option where continuous sixes can be enabled.</li><li><strong>MOVEMENT & PATHWAY:</strong> Tokens move clockwise around the main board circuit according to the exact dice roll.</li><li><strong>SAFE ZONES (STOPS):</strong> There are 8 marked Safe Zones on the board where tokens cannot be captured or cut.</li><li><strong>CAPTURING TOKENS:</strong> Landing on an opponent's token on a standard square sends it back to its Home Yard.</li><li><strong>WINNING THE GAME:</strong> The first player to navigate all 4 tokens into the central Home square wins.</li></ol></div><button className="primary-button" onClick={onClose}>Got it</button></ModalFrame>;
}

export default App;
