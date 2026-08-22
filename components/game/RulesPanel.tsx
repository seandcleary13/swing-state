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
    body: "Any unit with a live enemy in range must attack this phase — that's mandatory, not optional. Click an enemy unit to target it, then click any of your own units within range to commit them — pile on several units against one target if you like, their Power adds together. A preview shows the combined odds; click Attack to confirm and roll. Every unit can attack an adjacent enemy; Artillery can also fire from 2 hexes away, or 3 if it's standing on a hill. Units still owing an attack are marked with a dashed red outline, and the phase won't end until every one of them has fought.",
  },
  {
    title: "🎲 Combat Results Table",
    body: "A die is rolled against the combined odds, giving one of six results: Attacker(s) Eliminated, Attacker(s) Retreat, Defender Retreats, Exchange (one unit lost on each side), Defender Eliminated, or No Effect. Odds always round down in the defender's favor — a ratio has to actually clear a threshold to reach the next column (1.8:1 stays 1:1, it doesn't round up to 2:1). Retreats are the most common outcome on both sides of the table — bad odds usually just send the attacker falling back rather than destroying it, and good odds usually push the defender back rather than wiping it out.",
  },
  {
    title: "🏃 Retreats",
    body: "Whichever side owns the retreating unit chooses its path, one hex at a time, up to 3 hexes — you're never forced to use the full distance, and can stop early with the \"Stop Retreating\" button once you've fallen back at least one hex. If there's nowhere at all to go, the unit is eliminated instead. When your own attack forces a Defender Retreat, you get to choose whether the attacking unit advances into the vacated ground or holds its position.",
  },
  {
    title: "🎯 Bombarding Artillery",
    body: "Artillery firing from 2+ hexes away (not adjacent) is never eliminated, traded away in an Exchange, or forced to retreat by its own attack — only the target is at risk. Artillery fighting from an adjacent hex is treated like any other unit and takes its full share of the result.",
  },
  {
    title: "🚶 3. All Units Move",
    body: "Every unit — including Cavalry a second time — may move once more, repositioning after the fighting. This is the only movement Infantry and Artillery get each turn; Cavalry gets this move on top of its earlier advance, giving it two moves in a single turn. Once you end this phase, it becomes the Coalition's turn.",
  },
  {
    title: "🇦🇹 The Coalition's Turn",
    body: "The Coalition plays out its turn step by step — you'll see its cavalry advance, then its attacks resolve one at a time, then its units reposition, each appearing in the log as it happens. Tap \"Skip\" to fast-forward through it. If a Coalition attack forces one of your own units to retreat, play pauses so you can choose that unit's retreat path yourself, just like on your turn.",
  },
  {
    title: "🗺 Terrain",
    body: "Terrain multiplies a defender's Power rather than adding a flat bonus, so it rewards your strongest units the most. Open Field: no change (×1). Forest, Hill & Town: defense ×2. Marsh: defense ×1.5. Forest & Hill cost 2 movement points to enter, Marsh costs 3, Town costs 1 and is an objective.",
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
