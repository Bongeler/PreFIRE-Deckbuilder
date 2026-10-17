const fs = require('fs');

const fallbacksPath = './data/theme-fallbacks.json';
const archetypesPath = './archetype-index.json';

if (!fs.existsSync(fallbacksPath)) {
  console.error("Cannot find theme-fallbacks.json in the current directory.");
  process.exit(1);
}

const fallbacks = JSON.parse(fs.readFileSync(fallbacksPath, 'utf8'));

// Detailed archetypal blueprint profiles
const BLUEPRINTS = {
  "voltron": {
    engine_floor: 22,
    sub_roles: { modifiers: 16, protection: 6, evasion: 4 },
    role_overrides: { board_wipe: 1, ramp: 8, draw: 8 },
    exclusions: ["Aligned Hedron Network", "Wrath of God", "Day of Judgment", "Damnation"]
  },
  "auras": {
    engine_floor: 24,
    sub_roles: { aura_buff: 18, enchantress_draw: 5, protection: 4 },
    role_overrides: { board_wipe: 1, ramp: 8, draw: 6 },
    exclusions: ["Aligned Hedron Network", "Wrath of God", "Day of Judgment"]
  },
  "enchantress": {
    engine_floor: 30,
    sub_roles: { enchantress_draw: 6, global_enchantment: 18, aura_ramp: 6 },
    role_overrides: { ramp: 6, draw: 6, board_wipe: 2 },
    exclusions: ["Aligned Hedron Network"]
  },
  "equipment": {
    engine_floor: 24,
    sub_roles: { equipment: 16, equip_support: 8, protection: 4 },
    role_overrides: { board_wipe: 1, ramp: 8, draw: 8 },
    exclusions: ["Aligned Hedron Network"]
  },
  "aristocrats": {
    engine_floor: 26,
    sub_roles: { sac_outlet: 8, sac_fodder: 10, death_trigger: 8 },
    role_overrides: { ramp: 8, draw: 8, board_wipe: 2 },
    exclusions: ["Rest in Peace", "Leyline of the Void"]
  },
  "spellslinger": {
    engine_floor: 28,
    sub_roles: { cantrip: 10, cost_reducer: 4, spell_payoff: 6, burn_or_tokens: 6 },
    role_overrides: { ramp: 6, board_wipe: 2, draw: 6 },
    exclusions: ["Aligned Hedron Network"]
  },
  "reanimator": {
    engine_floor: 24,
    sub_roles: { discard_outlet: 6, reanimate_spell: 8, reanimate_target: 10 },
    role_overrides: { ramp: 8, draw: 8, board_wipe: 2 },
    exclusions: ["Rest in Peace", "Leyline of the Void"]
  },
  "blink": {
    engine_floor: 24,
    sub_roles: { flicker_engine: 8, etb_value: 16 },
    role_overrides: { ramp: 8, draw: 6, board_wipe: 1 },
    exclusions: ["Torpor Orb", "Hushwing Gryff", "Tocatli Honor Guard"]
  },
  "+1-+1-counters": {
    engine_floor: 26,
    sub_roles: { counter_engine: 14, counter_payoff: 8, proliferate: 4 },
    role_overrides: { ramp: 8, draw: 8, board_wipe: 2 },
    exclusions: ["Solemnity"]
  },
  "tokens": {
    engine_floor: 26,
    sub_roles: { token_producer: 14, anthem_payoff: 8, sac_or_draw: 6 },
    role_overrides: { ramp: 8, draw: 8, board_wipe: 1 },
    exclusions: ["Aligned Hedron Network", "Aether Flash"]
  }
};

let modifiedCount = 0;

Object.keys(fallbacks).forEach(slug => {
  const cleanSlug = slug.toLowerCase().trim();
  const matchedBlueprintKey = Object.keys(BLUEPRINTS).find(k => 
    cleanSlug === k || cleanSlug.includes(k) || k.includes(cleanSlug)
  );

  if (matchedBlueprintKey) {
    const bp = BLUEPRINTS[matchedBlueprintKey];
    fallbacks[slug].blueprint = bp;
    modifiedCount++;
  } else {
    // Generate default structured blueprint based on existing target counts
    const targets = fallbacks[slug].targets || {};
    fallbacks[slug].blueprint = {
      engine_floor: targets.engine || 35,
      sub_roles: {},
      role_overrides: {
        ramp: targets.ramp || 8,
        draw: targets.draw || 8,
        removal_creature: targets.removal_creature || 5,
        removal_noncreature: targets.removal_noncreature || 2,
        board_wipe: targets.board_wipe || 2
      },
      exclusions: ["Aligned Hedron Network"]
    };
    modifiedCount++;
  }
});

fs.writeFileSync(fallbacksPath, JSON.stringify(fallbacks, null, 2), 'utf8');
console.log(`Successfully enriched ${modifiedCount} archetypes in theme-fallbacks.json with blueprint schemas.`);