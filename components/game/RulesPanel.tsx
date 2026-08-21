"use client";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "🎯 Objective — Attacker vs. Defender",
    body: "France is the Attacker; the Coalition is the Defender and starts the campaign already holding all 5 towns. France must capture every single town before Turn 6 ends, or wipe out the Coalition army outright — either one is an immediate breakthrough. The Coalition doesn't need to retake anything: if it still holds even one town when the clock runs out (or if France's army is destroyed first), the Coalition has held out and wins.",
  },
  {
    title: "🪖 Deployment",
    body: "Place your 9 units on the highlighted western hexes before Turn 1. Choose a unit from the tray, then click a deployment hex. Once all 9 are placed, the campaign begins — the Coalition is already dug in across the map to the east.",
  },
  {
    title: "🐎 1. Cavalry Moves",
    body: "Cavalry moves first, alone. Only your Cavalry units can move this phase — Infantry and Artillery hold their positions. Movement is based on the unit's Move value and the terrain cost of each hex it crosses; roads are fast (1 hex per move point). Units can't stack — one per hex, friend or foe. A unit that ends its move next to an enemy is in that enemy's Zone of Control and stops there.",
  },
  {
    title: "⚔ 2. Announce Attacks",
    body: "Click an enemy unit to target it, then click any of your own units within range to commit them — you can pile on several units against one target before rolling. Their Power adds together. A preview shows the combined odds; click Attack to confirm and roll. Every unit can attack an adjacent enemy; Artillery can also fire from 2 hexes away, or 3 if it's standing on a hill. Each unit has a single Power value that works as both its attack and its defense, plus a terrain bonus for the defender if it's on a hill, in a forest, or in a town.",
  },
  {
    title: "🎲 Combat Results Table",
    body: "A die is rolled against the combined odds: Attacker(s) Eliminated, Defender Retreats, Exchange (one unit lost on each side), Defender Eliminated, or No Effect. Retreats are the most common outcome — the table favors the defender slightly, so even good odds often just push the defender back rather than destroying it. A defender that retreats falls back 2 hexes; if it has nowhere to go, it's eliminated instead. When a defender retreats, one of the attacking units that was directly adjacent to it (the strongest one, if more than one qualifies) advances into the ground it just vacated.",
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
    body: "Each unit's numbers read Power-Movement. Cavalry (3 Power / 5 Movement) are fast scouts and skirmishers. Heavy Cavalry (6 Power / 5 Movement) hit just as hard as Artillery but keep Cavalry's speed and get the two-move cavalry phases — a battering ram for the Attacker. Infantry (4 Power / 4 Movement) are the balanced backbone of the army. Artillery (5 Power / 3 Movement) hits hard but is slow to reposition.",
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
