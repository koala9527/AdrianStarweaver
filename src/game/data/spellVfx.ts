/** Per-spell visual configuration */
export interface SpellVfxConfig {
  projectileColor: number;
  trailColor: number;
  hitColor: number;
  hitParticleCount: number;
  hitSparkSize: number;
  screenShake: number;
  critScreenShake: number;
  icon: string;
  iconColor: number;
}

export const SPELL_VFX: Record<string, SpellVfxConfig> = {
  arcane_missile: {
    projectileColor: 0x44ddff,
    trailColor: 0x2288cc,
    hitColor: 0x66eeff,
    hitParticleCount: 5,
    hitSparkSize: 2,
    screenShake: 1.5,
    critScreenShake: 4,
    icon: '✦',
    iconColor: 0x44ddff,
  },
  fire_nova: {
    projectileColor: 0xff6622,
    trailColor: 0xcc3300,
    hitColor: 0xffaa33,
    hitParticleCount: 8,
    hitSparkSize: 3,
    screenShake: 3,
    critScreenShake: 6,
    icon: '🔥',
    iconColor: 0xff6622,
  },
  ice_shard: {
    projectileColor: 0x88ccff,
    trailColor: 0x4488cc,
    hitColor: 0xaaddff,
    hitParticleCount: 4,
    hitSparkSize: 2,
    screenShake: 1,
    critScreenShake: 3,
    icon: '❄',
    iconColor: 0x88ccff,
  },
  lightning_chain: {
    projectileColor: 0xffee44,
    trailColor: 0xccaa00,
    hitColor: 0xffffaa,
    hitParticleCount: 6,
    hitSparkSize: 3,
    screenShake: 2,
    critScreenShake: 5,
    icon: '⚡',
    iconColor: 0xffee44,
  },
  void_field: {
    projectileColor: 0xaa44ff,
    trailColor: 0x6622aa,
    hitColor: 0xcc88ff,
    hitParticleCount: 10,
    hitSparkSize: 4,
    screenShake: 4,
    critScreenShake: 8,
    icon: '🌀',
    iconColor: 0xaa44ff,
  },
  arcane_familiar: {
    projectileColor: 0x44ffcc,
    trailColor: 0x22aa88,
    hitColor: 0x88ffdd,
    hitParticleCount: 3,
    hitSparkSize: 2,
    screenShake: 0.8,
    critScreenShake: 2,
    icon: '👁',
    iconColor: 0x44ffcc,
  },
  star_beam: {
    projectileColor: 0xccaaff,
    trailColor: 0x8866cc,
    hitColor: 0xddbbff,
    hitParticleCount: 6,
    hitSparkSize: 3,
    screenShake: 2,
    critScreenShake: 5,
    icon: '🌠',
    iconColor: 0xccaaff,
  },
  flame_whirl: {
    projectileColor: 0xff8833,
    trailColor: 0xcc4400,
    hitColor: 0xffaa44,
    hitParticleCount: 8,
    hitSparkSize: 3,
    screenShake: 2.5,
    critScreenShake: 5,
    icon: '🌪',
    iconColor: 0xff8833,
  },
};
