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
    title: "🚶 Movement Phase",
    body: "Select one of your units to see every hex it can reach this turn, based on its movement allowance and the terrain cost of each hex it crosses. Roads let units move quickly along them (cost 1 per hex). Units cannot stack — only one unit per hex, friend or foe. A unit that ends its move next to an enemy unit is in that enemy's Zone of Control and stops there, even if it had movement points left.",
  },
  {
    title: "⚔ Combat Phase",
    body: "Select one of your units and click an adjacent enemy to attack. The odds are your Attack value against the enemy's Defense value (plus a terrain bonus if they're on a hill, in a forest, in a town, or across a river). A die is rolled against the Combat Results Table: Attacker Eliminated, Defender Retreats, Exchange (both destroyed), Defender Eliminated, or No Effect. A unit that can't retreat is eliminated instead.",
  },
  {
    title: "🗺 Terrain",
    body: "Open Field: no penalty. Forest & Hill: +2 defense bonus, costs 2 movement points to enter. Town: +2 defense bonus, an objective. River: +1 defense bonus, costs 3 movement points to cross (bridges on the two roads cost only 1). Marsh: +1 defense bonus, costs 3 movement points.",
  },
  {
    title: "🧭 Unit Types",
    body: "Guard Infantry (6-6-4) are your toughest troops. Line Infantry (4-4-4) are the backbone of the army. Light Infantry (3-3-5) skirmish quickly. Heavy Cavalry (5-3-8) hit hard and move fast but defend poorly. Light Cavalry (4-2-9) are the fastest unit on the field, ideal for grabbing undefended towns. Horse Artillery (4-2-6) and Foot Artillery (5-2-3) hit hardest but are fragile if caught alone — numbers read Attack-Defense-Movement.",
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
