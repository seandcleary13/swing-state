import { useState, useEffect, useCallback } from "react";

// ─── STATES ──────────────────────────────────────────────────────────────────
const STATES = [
  { name: "Pennsylvania", abbr: "PA", ev: 19 },
  { name: "Georgia",      abbr: "GA", ev: 16 },
  { name: "N. Carolina",  abbr: "NC", ev: 16 },
  { name: "Michigan",     abbr: "MI", ev: 15 },
  { name: "Arizona",      abbr: "AZ", ev: 11 },
  { name: "Wisconsin",    abbr: "WI", ev: 10 },
  { name: "Nevada",       abbr: "NV", ev: 6  },
];
const TOTAL_EV = STATES.reduce((s, st) => s + st.ev, 0); // 93

// ─── DECK ────────────────────────────────────────────────────────────────────
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const RANK_VAL = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function buildDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, value: RANK_VAL[rank], id: `${rank}${suit}` });
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── HAND EVALUATION ─────────────────────────────────────────────────────────
function evalFormation(cards) {
  if (cards.length < 3) return { rank: -1, name: "—", score: -1 };
  const vals = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const flush = suits.every(s => s === suits[0]);
  const [v1, v2, v3] = vals;
  const three = v1 === v2 && v2 === v3;
  const pair = v1 === v2 || v2 === v3;
  const allUnique = !three && !pair;
  const straight = allUnique && v1 - v2 === 1 && v2 - v3 === 1;
  const score = v1 * 10000 + v2 * 100 + v3;
  if (flush && straight) return { rank: 6, name: "Straight Flush", score: score + 600000 };
  if (three)             return { rank: 5, name: "Three of a Kind", score: score + 500000 };
  if (flush)             return { rank: 4, name: "Flush",           score: score + 400000 };
  if (straight)          return { rank: 3, name: "Straight",        score: score + 300000 };
  if (pair)              return { rank: 2, name: "Pair",            score: score + 200000 };
  return                        { rank: 1, name: "High Card",       score: score + 100000 };
}

function stateWinner(playerCards, aiCards) {
  if (playerCards.length < 3 || aiCards.length < 3) return null;
  const p = evalFormation(playerCards);
  const a = evalFormation(aiCards);
  if (p.score > a.score) return "player";
  if (a.score > p.score) return "ai";
  return "tie";
}

// ─── AI ──────────────────────────────────────────────────────────────────────
function scoreCardInCol(card, colCards) {
  const combined = [...colCards, card];
  if (combined.length === 3) return evalFormation(combined).score;
  let bonus = 0;
  const vals = combined.map(c => c.value);
  const suits = combined.map(c => c.suit);
  const valCounts = vals.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
  const maxCount = Math.max(...Object.values(valCounts));
  if (maxCount === 2) bonus += 30000;
  if (maxCount === 3) bonus += 50000;
  if (suits.every(s => s === suits[0])) bonus += 20000;
  const sv = [...vals].sort((a, b) => a - b);
  if (sv[sv.length - 1] - sv[0] <= 2 && new Set(vals).size === vals.length) bonus += 15000;
  bonus += card.value * 100;
  return bonus;
}

function getAIMove(aiHand, aiCols, playerCols, evWeights) {
  let bestScore = -Infinity;
  let bestCard = 0;
  let bestCol = -1;
  for (let ci = 0; ci < STATES.length; ci++) {
    if (aiCols[ci].length >= 3) continue;
    const colAlreadyLost = aiCols[ci].length === 3 && stateWinner(playerCols[ci], aiCols[ci]) === "player";
    const evMult = 1 + evWeights[ci] / 20; // weight higher-EV states
    for (let hi = 0; hi < aiHand.length; hi++) {
      const card = aiHand[hi];
      let score = scoreCardInCol(card, aiCols[ci]) * evMult;
      if (playerCols[ci].length === 2) score += evalFormation(playerCols[ci]).score * 0.4;
      if (aiCols[ci].length === 2)     score += evalFormation([...aiCols[ci], card]).score * 0.6;
      if (colAlreadyLost) score *= 0.3;
      if (score > bestScore) { bestScore = score; bestCard = hi; bestCol = ci; }
    }
  }
  if (bestCol === -1) bestCol = STATES.findIndex((_, i) => aiCols[i].length < 3);
  return { cardIndex: bestCard, columnIndex: bestCol };
}

// ─── CARD ────────────────────────────────────────────────────────────────────
function Card({ card, onClick, selected, small }) {
  const red = card && (card.suit === "♥" || card.suit === "♦");
  const w = small ? "2.6rem" : "3.4rem";
  const h = small ? "3.8rem" : "5rem";

  if (!card) return (
    <div style={{ width: w, height: h, minWidth: w, minHeight: h }}
      className="rounded border-2 border-dashed border-gray-700 bg-gray-900 opacity-30" />
  );

  return (
    <div onClick={onClick}
      style={{ width: w, height: h, minWidth: w, minHeight: h }}
      className={`rounded border-2 flex flex-col justify-between p-1 transition-all duration-150 select-none
        ${onClick ? "cursor-pointer hover:scale-105 hover:-translate-y-1" : "cursor-default"}
        ${selected ? "border-yellow-300 shadow-lg shadow-yellow-400/50 scale-105 -translate-y-1" : "border-gray-500"}
        ${red ? "bg-gradient-to-b from-red-950 to-gray-900 text-red-400" : "bg-gradient-to-b from-slate-800 to-gray-950 text-blue-200"}`}>
      <div className="font-black leading-none" style={{ fontSize: small ? "0.7rem" : "0.9rem" }}>{card.rank}</div>
      <div className="text-center leading-none" style={{ fontSize: small ? "1.4rem" : "1.8rem" }}>{card.suit}</div>
      <div className="font-black leading-none self-end rotate-180" style={{ fontSize: small ? "0.7rem" : "0.9rem" }}>{card.rank}</div>
    </div>
  );
}

// ─── STATE COLUMN ─────────────────────────────────────────────────────────────
function StateColumn({ state, playerCards, aiCards, onClick, selected, winner }) {
  const playerHand = evalFormation(playerCards);
  const aiHand = evalFormation(aiCards);
  const canPlace = onClick && playerCards.length < 3;

  const borderColor = winner === "player" ? "#3b82f6" :
                      winner === "ai"     ? "#ef4444" :
                      winner === "tie"    ? "#6b7280" :
                      canPlace            ? "#eab308" : "#374151";

  const bgColor = winner === "player" ? "rgba(59,130,246,0.12)" :
                  winner === "ai"     ? "rgba(239,68,68,0.12)"  :
                  "rgba(15,23,42,0.6)";

  return (
    <div onClick={canPlace ? onClick : undefined}
      className="flex flex-col items-center rounded-xl transition-all duration-300"
      style={{ border: `2px solid ${borderColor}`, background: bgColor,
               cursor: canPlace ? "pointer" : "default", padding: "6px 4px", gap: "4px" }}>

      {/* State label */}
      <div className="text-center leading-tight">
        <div className="font-black text-sm tracking-wider" style={{ color: winner === "player" ? "#93c5fd" : winner === "ai" ? "#fca5a5" : "#e2e8f0" }}>
          {state.abbr}
        </div>
        <div className="text-yellow-400 font-bold text-xs">{state.ev} EV</div>
      </div>

      {/* AI cards (top) */}
      <div className="flex flex-col gap-1">
        {[2,1,0].map(i => (
          <Card key={i} card={aiCards[i] || null} small />
        ))}
      </div>

      {/* Divider */}
      <div className="w-full h-px my-1" style={{ background: borderColor, opacity: 0.5 }} />

      {/* Player cards (bottom) */}
      <div className="flex flex-col gap-1">
        {[0,1,2].map(i => (
          <Card key={i} card={playerCards[i] || null} small />
        ))}
      </div>

      {/* Hand labels */}
      {(playerCards.length === 3 || aiCards.length === 3) && (
        <div className="text-center mt-1" style={{ fontSize: "0.6rem", lineHeight: 1.2 }}>
          {aiCards.length === 3 && (
            <div style={{ color: winner === "ai" ? "#fca5a5" : "#6b7280" }}>{aiHand.name}</div>
          )}
          {playerCards.length === 3 && (
            <div style={{ color: winner === "player" ? "#93c5fd" : "#6b7280" }}>{playerHand.name}</div>
          )}
        </div>
      )}

      {/* Winner badge */}
      {winner && (
        <div className="text-xs font-bold px-1 rounded"
          style={{ background: winner === "player" ? "#1d4ed8" : winner === "ai" ? "#991b1b" : "#374151",
                   color: winner === "tie" ? "#9ca3af" : "white", fontSize: "0.6rem" }}>
          {winner === "player" ? "YOU" : winner === "ai" ? "OPP" : "TIE"}
        </div>
      )}
    </div>
  );
}

// ─── EV BAR ──────────────────────────────────────────────────────────────────
function EVBar({ playerEV, aiEV }) {
  const total = TOTAL_EV;
  const pPct = (playerEV / total) * 100;
  const aPct = (aiEV / total) * 100;
  const needed = Math.ceil(total / 2) + 1;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1 font-bold">
        <span style={{ color: "#60a5fa" }}>YOU: {playerEV} EV</span>
        <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>Need {needed} to win</span>
        <span style={{ color: "#f87171" }}>OPP: {aiEV} EV</span>
      </div>
      <div className="w-full rounded-full overflow-hidden flex" style={{ height: "10px", background: "#1f2937" }}>
        <div style={{ width: `${pPct}%`, background: "linear-gradient(90deg,#1d4ed8,#3b82f6)", transition: "width 0.5s" }} />
        <div style={{ width: `${aPct}%`, background: "linear-gradient(90deg,#ef4444,#991b1b)", marginLeft: "auto", transition: "width 0.5s" }} />
      </div>
      {/* 47 EV marker */}
      <div className="relative w-full" style={{ height: "8px" }}>
        <div style={{ position: "absolute", left: `${(needed/total)*100}%`, top: 0, width: "2px", height: "8px", background: "#fbbf24", transform: "translateX(-50%)" }} />
      </div>
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function SwingState() {
  const NUM = STATES.length;
  const [deck, setDeck] = useState([]);
  const [playerHand, setPlayerHand] = useState([]);
  const [aiHand, setAiHand] = useState([]);
  const [playerCols, setPlayerCols] = useState(Array(NUM).fill(null).map(() => []));
  const [aiCols, setAiCols]         = useState(Array(NUM).fill(null).map(() => []));
  const [selected, setSelected] = useState(null);
  const [log, setLog] = useState([]);
  const [gameOver, setGameOver] = useState(null); // null | { winner, playerEV, aiEV }
  const [wins, setWins] = useState({ player: 0, ai: 0 });
  const [tab, setTab] = useState('game');

  const addLog = (msg) => setLog(l => [msg, ...l].slice(0, 5));

  const startGame = useCallback(() => {
    const d = shuffle(buildDeck());
    setPlayerHand(d.slice(0, 5));
    setAiHand(d.slice(5, 10));
    setDeck(d.slice(10));
    setPlayerCols(Array(NUM).fill(null).map(() => []));
    setAiCols(Array(NUM).fill(null).map(() => []));
    setSelected(null);
    setGameOver(null);
    setLog(["Campaign begins. Select a card then choose a state."]);
  }, [NUM]);

  useEffect(() => { startGame(); }, [startGame]);

  const calcEV = (cols, side) =>
    STATES.reduce((sum, st, i) => {
      const w = stateWinner(
        side === "player" ? cols[i] : playerCols[i],
        side === "player" ? aiCols[i] : cols[i]
      );
      return sum + (w === side ? st.ev : 0);
    }, 0);

  const checkGameOver = useCallback((pCols, aCols) => {
    const allDone = pCols.every(c => c.length === 3) && aCols.every(c => c.length === 3);
    if (!allDone) return false;

    const playerEV = STATES.reduce((sum, st, i) => {
      const w = stateWinner(pCols[i], aCols[i]);
      return sum + (w === "player" ? st.ev : 0);
    }, 0);
    const aiEV = STATES.reduce((sum, st, i) => {
      const w = stateWinner(pCols[i], aCols[i]);
      return sum + (w === "ai" ? st.ev : 0);
    }, 0);

    const winner = playerEV > aiEV ? "player" : aiEV > playerEV ? "ai" : "tie";
    setGameOver({ winner, playerEV, aiEV });
    if (winner !== "tie") setWins(w => ({ ...w, [winner]: w[winner] + 1 }));
    return true;
  }, []);

  const placeCard = useCallback((colIndex) => {
    if (selected === null || gameOver) return;
    if (playerCols[colIndex].length >= 3) return;

    const card = playerHand[selected];
    const newHand = playerHand.filter((_, i) => i !== selected);
    const newCols = playerCols.map((c, i) => i === colIndex ? [...c, card] : c);

    let newDeck = deck;
    let newPlayerHand = newHand;
    if (newDeck.length > 0) {
      const [drawn, ...rest] = newDeck;
      newDeck = rest;
      newPlayerHand = [...newHand, drawn];
    }

    setPlayerHand(newPlayerHand);
    setDeck(newDeck);
    setPlayerCols(newCols);
    setSelected(null);
    addLog(`You played ${card.rank}${card.suit} → ${STATES[colIndex].name}`);

    if (checkGameOver(newCols, aiCols)) return;

    // AI move — weight by EV
    const evWeights = STATES.map(s => s.ev);
    const { cardIndex, columnIndex: aiCol } = getAIMove(aiHand, aiCols, newCols, evWeights);
    const aiCard = aiHand[cardIndex];
    const newAiHand = aiHand.filter((_, i) => i !== cardIndex);
    const newAiCols = aiCols.map((c, i) => i === aiCol ? [...c, aiCard] : c);

    let finalAiHand = newAiHand;
    if (newDeck.length > 0) {
      const [drawn, ...rest] = newDeck;
      newDeck = rest;
      finalAiHand = [...newAiHand, drawn];
    }

    setAiHand(finalAiHand);
    setDeck(newDeck);
    setAiCols(newAiCols);
    addLog(`Opponent played to ${STATES[aiCol].name}`);

    checkGameOver(newCols, newAiCols);
  }, [selected, gameOver, playerHand, playerCols, aiCols, aiHand, deck, checkGameOver]);

  // Live EV tally
  const livePlayerEV = STATES.reduce((sum, st, i) => {
    const w = stateWinner(playerCols[i], aiCols[i]);
    return sum + (w === "player" ? st.ev : 0);
  }, 0);
  const liveAiEV = STATES.reduce((sum, st, i) => {
    const w = stateWinner(playerCols[i], aiCols[i]);
    return sum + (w === "ai" ? st.ev : 0);
  }, 0);

  const colWinners = STATES.map((_, i) => stateWinner(playerCols[i], aiCols[i]));

  return (
    <div className="min-h-screen flex flex-col items-center"
      style={{ fontFamily: "'Georgia', serif", background: "linear-gradient(180deg, #0a0f1e 0%, #060d1a 60%, #0a0f1e 100%)" }}>

      {/* Stars background */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{ width: Math.random() > 0.8 ? 2 : 1, height: Math.random() > 0.8 ? 2 : 1,
                     top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, opacity: Math.random() * 0.5 + 0.1 }} />
        ))}
      </div>

      <div className="relative w-full max-w-3xl px-3 flex flex-col gap-3 py-4" style={{ zIndex: 1 }}>

        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="text-2xl">🇺🇸</div>
            <h1 className="text-3xl font-black tracking-widest" style={{ color: "#f1f5f9", letterSpacing: "0.15em", textShadow: "0 0 30px rgba(59,130,246,0.4)" }}>
              SWING STATE
            </h1>
            <div className="text-2xl">🇺🇸</div>
          </div>
          <p className="text-xs tracking-widest" style={{ color: "#64748b" }}>ELECTORAL CARD BATTLE</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: "#1e293b" }}>
          {["game", "rules"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm font-black tracking-widest transition-all duration-200"
              style={{
                background: tab === t ? "linear-gradient(135deg,#1d4ed8,#1e40af)" : "rgba(15,23,42,0.8)",
                color: tab === t ? "#f1f5f9" : "#475569",
                letterSpacing: "0.1em"
              }}>
              {t === "game" ? "🗳 PLAY" : "📋 RULES"}
            </button>
          ))}
        </div>

        {tab === 'game' && <>
        {/* Win counter */}
        <div className="flex justify-center gap-8 text-center">
          <div>
            <div className="text-2xl font-black" style={{ color: "#60a5fa" }}>{wins.player}</div>
            <div className="text-xs" style={{ color: "#475569" }}>YOUR WINS</div>
          </div>
          <div style={{ color: "#334155", alignSelf: "center" }}>—</div>
          <div>
            <div className="text-2xl font-black" style={{ color: "#f87171" }}>{wins.ai}</div>
            <div className="text-xs" style={{ color: "#475569" }}>OPP WINS</div>
          </div>
        </div>

        {/* EV bar */}
        <EVBar playerEV={livePlayerEV} aiEV={liveAiEV} />

        {/* Game over */}
        {gameOver && (
          <div className="rounded-xl px-4 py-3 text-center border"
            style={{
              background: gameOver.winner === "player" ? "rgba(29,78,216,0.3)" : gameOver.winner === "ai" ? "rgba(153,27,27,0.3)" : "rgba(55,65,81,0.3)",
              borderColor: gameOver.winner === "player" ? "#3b82f6" : gameOver.winner === "ai" ? "#ef4444" : "#6b7280"
            }}>
            <div className="text-lg font-black mb-1" style={{ color: gameOver.winner === "player" ? "#93c5fd" : gameOver.winner === "ai" ? "#fca5a5" : "#d1d5db" }}>
              {gameOver.winner === "player" ? "🎉 You Win the Election!" : gameOver.winner === "ai" ? "💀 You Lost the Election" : "🤝 Electoral Tie"}
            </div>
            <div className="text-sm mb-2" style={{ color: "#94a3b8" }}>
              You: {gameOver.playerEV} EV · Opponent: {gameOver.aiEV} EV
            </div>
            <button onClick={startGame}
              className="px-5 py-2 rounded-lg font-black text-sm transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", color: "white" }}>
              RUN AGAIN
            </button>
          </div>
        )}

        {/* Battlefield - 7 state columns */}
        <div className="flex gap-1 justify-center flex-wrap">
          {STATES.map((state, i) => (
            <StateColumn key={i}
              state={state}
              playerCards={playerCols[i]}
              aiCards={aiCols[i]}
              winner={colWinners[i]}
              onClick={selected !== null && !gameOver ? () => placeCard(i) : null} />
          ))}
        </div>

        {/* Instruction */}
        <div className="text-center text-xs" style={{ color: "#64748b" }}>
          {selected !== null ? "👆 Tap a state to deploy your card" : "Select a card from your hand below"}
        </div>

        {/* Hand */}
        <div>
          <div className="text-xs font-bold tracking-widest mb-2 text-center" style={{ color: "#475569" }}>
            YOUR HAND · {playerHand.length} cards · Deck: {deck.length}
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {playerHand.map((card, i) => (
              <Card key={card.id} card={card} selected={selected === i}
                onClick={!gameOver ? () => setSelected(selected === i ? null : i) : undefined} />
            ))}
          </div>
        </div>

        {/* Log */}
        <div className="rounded-xl p-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid #1e293b", minHeight: "4rem" }}>
          {log.map((l, i) => (
            <div key={i} className="text-xs" style={{ color: i === 0 ? "#cbd5e1" : "#334155" }}>{l}</div>
          ))}
        </div>

        </>}

        {/* Rules Tab */}
        {tab === 'rules' && (
          <div className="flex flex-col gap-4 pb-6">

            <div className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b" }}>
              <div className="text-sm font-black tracking-widest mb-3" style={{ color: "#60a5fa" }}>🎯 OBJECTIVE</div>
              <p className="text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
                Win the most Electoral Votes (EV) across 7 battleground states. There are 93 total electoral votes up for grabs. The candidate with the most EV at the end wins the election. You do not need a majority — just more than your opponent.
              </p>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b" }}>
              <div className="text-sm font-black tracking-widest mb-3" style={{ color: "#60a5fa" }}>🃏 HOW TO PLAY</div>
              <div className="flex flex-col gap-2 text-sm" style={{ color: "#94a3b8" }}>
                <div className="flex gap-2"><span style={{ color: "#fbbf24" }}>1.</span><span>You start with 5 cards. After each card you play, you draw a new one from the deck to keep your hand at 5.</span></div>
                <div className="flex gap-2"><span style={{ color: "#fbbf24" }}>2.</span><span>Select a card from your hand, then tap a state to place it there. Your cards appear on the bottom half of each state column.</span></div>
                <div className="flex gap-2"><span style={{ color: "#fbbf24" }}>3.</span><span>Each state holds 3 cards per side. Once both sides have 3 cards, the state is decided by whoever has the stronger 3-card hand.</span></div>
                <div className="flex gap-2"><span style={{ color: "#fbbf24" }}>4.</span><span>Your opponent plays automatically after each of your turns. The game ends when all 7 states are filled.</span></div>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b" }}>
              <div className="text-sm font-black tracking-widest mb-3" style={{ color: "#60a5fa" }}>♠ HAND RANKINGS</div>
              <div className="flex flex-col gap-2">
                {[
                  { rank: "Straight Flush", desc: "3 consecutive cards, all same suit", example: "7♠ 8♠ 9♠", color: "#fbbf24" },
                  { rank: "Three of a Kind", desc: "3 cards of the same rank", example: "K♠ K♥ K♦", color: "#a78bfa" },
                  { rank: "Flush", desc: "3 cards of the same suit", example: "2♣ 7♣ J♣", color: "#34d399" },
                  { rank: "Straight", desc: "3 consecutive cards, mixed suits", example: "5♠ 6♥ 7♦", color: "#60a5fa" },
                  { rank: "Pair", desc: "2 cards of the same rank", example: "Q♠ Q♦ 4♥", color: "#f87171" },
                  { rank: "High Card", desc: "None of the above — highest card wins", example: "2♠ 7♥ J♦", color: "#94a3b8" },
                ].map((h, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(30,41,59,0.6)" }}>
                    <div className="text-xs font-black w-5 text-center" style={{ color: "#475569" }}>{6 - i}</div>
                    <div className="flex-1">
                      <div className="text-xs font-black" style={{ color: h.color }}>{h.rank}</div>
                      <div className="text-xs" style={{ color: "#64748b" }}>{h.desc}</div>
                    </div>
                    <div className="text-xs font-mono" style={{ color: "#475569" }}>{h.example}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b" }}>
              <div className="text-sm font-black tracking-widest mb-3" style={{ color: "#60a5fa" }}>🗺 THE 7 STATES</div>
              <div className="flex flex-col gap-1">
                {STATES.map((s, i) => (
                  <div key={i} className="flex justify-between items-center px-3 py-1 rounded-lg" style={{ background: "rgba(30,41,59,0.6)" }}>
                    <div className="text-sm font-bold" style={{ color: "#e2e8f0" }}>{s.name}</div>
                    <div className="text-sm font-black" style={{ color: "#fbbf24" }}>{s.ev} EV</div>
                  </div>
                ))}
                <div className="flex justify-between items-center px-3 py-1 mt-1 rounded-lg" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid #1d4ed8" }}>
                  <div className="text-xs font-black" style={{ color: "#60a5fa" }}>TOTAL</div>
                  <div className="text-sm font-black" style={{ color: "#60a5fa" }}>93 EV</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #fbbf24" }}>
              <div className="text-sm font-black tracking-widest mb-3" style={{ color: "#fbbf24" }}>💡 TIPS FOR BEGINNERS</div>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="text-lg">🏆</div>
                  <div>
                    <div className="text-xs font-black mb-1" style={{ color: "#e2e8f0" }}>Chase big states early</div>
                    <div className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>Pennsylvania (19 EV) and Georgia (16 EV) together are worth more than the bottom four states combined. Commit strong cards to those columns before the opponent locks them up.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="text-lg">🎯</div>
                  <div>
                    <div className="text-xs font-black mb-1" style={{ color: "#e2e8f0" }}>Build toward a hand, don't just dump cards</div>
                    <div className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>If your first card in a state is a heart, your second card in that state should also be a heart if possible — you're one card away from a flush. Spreading random cards across all 7 states early leaves you with weak high-card hands everywhere.</div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="text-lg">🚫</div>
                  <div>
                    <div className="text-xs font-black mb-1" style={{ color: "#e2e8f0" }}>Know when to walk away</div>
                    <div className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>If the opponent has a strong two-card start in a low-value state like Nevada (6 EV), don't waste a good card trying to contest it. Redirect that card to a state you can still win. Cutting your losses is better strategy than fighting for 6 EV.</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
