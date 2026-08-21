"use client";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "🎯 Objective",
    body: "Control more of the 5 towns than the Coalition by the end of Turn 6. A town is controlled by whichever side's unit last stood on it. If both sides hold the same number of towns, whoever has more surviving units wins; a full tie is a draw.",
  },
  {
    title: "🪖 Deployment",
    body: "Place your 8 units on the highlighted western hexes before Turn 1. Choose a unit from the tray, then click a deployment hex. Once all 8 are placed, the campaign begins.",
  },
  {
    title: "🐎 1. Cavalry Moves",
    body: "Cavalry moves first, alone. Only your Cavalry units can move this phase — Infantry and Artillery hold their positions. Movement is based on the unit's Move value and the terrain cost of each hex it crosses; roads are fast (1 hex per move point). Units can't stack — one per hex, friend or foe. A unit that ends its move next to an enemy is in that enemy's Zone of Control and stops there.",
  },
  {
    title: "⚔ 2. Announce Attacks",
    body: "Every unit — Cavalry, Infantry, and Artillery — may attack an adjacent enemy. Select one of your units and click an adjacent enemy to announce the attack; it resolves immediately. The odds are your Attack value against the enemy's Defense value (plus a terrain bonus if they're on a hill, in a forest, or in a town). A die is rolled against the Combat Results Table: Attacker Eliminated, Defender Retreats, Exchange (both destroyed), Defender Eliminated, or No Effect. A unit that can't retreat is eliminated instead.",
  },
  {
    title: "🚶 3. All Units Move",
    body: "Every unit — including Cavalry a second time — may move once more, repositioning after the fighting. This is the only movement Infantry and Artillery get each turn; Cavalry gets this move on top of its earlier advance, giving it two moves in a single turn. Once you end this phase, it becomes the Coalition's turn.",
  },
  {
    title: "🗺 Terrain",
    body: "Open Field: no penalty. Forest & Hill: +2 defense bonus, costs 2 movement points to enter. Town: +2 defense bonus, an objective. Marsh: +1 defense bonus, costs 3 movement points.",
  },
  {
    title: "🧭 Unit Types",
    body: "Cavalry (5 ATK / 3 DEF / 8 MOV) are the fastest unit on the field — they screen ahead, then strike and reposition. Infantry (4 ATK / 4 DEF / 4 MOV) are the balanced backbone of the army. Artillery (5 ATK / 2 DEF / 3 MOV) hits hardest but is fragile if caught alone.",
  },
];

export default function RulesPanel() {
  return (
    <div className="flex flex-col gap-3 pb-6">
      {SECTIONS.map((s) => (
        <div key={s.title} className="rounded-lg border border-[#3a2f1c] bg-[#17130c] px-4 py-3">
          <div className="text-sm font-black text-[#f4d35e] mb-1">{s.title}</div>
          <p className="text-sm leading-relaxed text-[#cbbf9c]">{s.body}</p>
        </div>
      ))}
    </div>
  );
}
