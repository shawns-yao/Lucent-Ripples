// Display presets leave saved birth dates and persistent animal identities intact.
export const SEASON_PROFILES=Object.freeze({
  spring:{index:0,fish:32,leafScale:.67,bloomScale:.5,bloomStage:.15,leafTint:0xd5ffad,grassScale:.64,grassBlades:3,pollen:12},
  summer:{index:1,fish:44,leafScale:1,bloomScale:1,bloomStage:2,leafTint:0xffffff,grassScale:1,grassBlades:5,pollen:27},
  autumn:{index:2,fish:28,leafScale:.88,bloomScale:0,bloomStage:2,leafTint:0xffbb66,grassScale:.8,grassBlades:4,pollen:0},
  winter:{index:3,fish:10,leafScale:0,bloomScale:0,bloomStage:0,leafTint:0xb4a186,grassScale:.5,grassBlades:2,pollen:0},
});
export const seasonProfile=season=>SEASON_PROFILES[season]||SEASON_PROFILES.summer;
