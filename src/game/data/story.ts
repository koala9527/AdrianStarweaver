/**
 * Story Background and Narrative Data
 * 艾德里安·星织 (Adrian Starweaver) - Purple Vine Crisis
 */

export interface StoryNarration {
  id: string;
  text: string;
  duration: number; // milliseconds
}

export interface MissionStory {
  missionId: number;
  objective: string;
  timeLimit: number; // seconds
  narrationAfter: StoryNarration;
}

// Game Background
export const GAME_BACKGROUND = {
  title: '艾德里安·星织',
  subtitle: 'ADRIAN STARWEAVER',
  world: '艾瑟拉大陆',
  crisis: '紫藤之祸',
  protagonist: {
    name: '艾德里安·星织',
    title: '紫藤守夜人',
    backstory: '三年前献祭右手封印黑暗魔法的织法者，如今是大陆最后的希望。',
  },
};

// Mission Story Flow (5 missions, 5 minutes total)
export const MISSION_STORIES: MissionStory[] = [
  {
    missionId: 1,
    objective: '击杀10只史莱姆',
    timeLimit: 50,
    narrationAfter: {
      id: 'mission1_complete',
      text: '你在被紫藤侵蚀的森林河岸缓缓醒来,三年前那场惨烈的紫藤源头勘探伏击仍历历在目,为了遏制紫藤核心的扩散,你被迫献祭自己的右手,以自身星织之力为引,绑定了部分黑暗魔法能量,才勉强阻止了灾难的进一步蔓延。如今,右臂的符文锁链依旧滚烫,它既是封印你体内黑暗魔法的唯一枷锁,也是你操控净化法术的力量源泉,每一次动用力量,都要承受黑暗魔法的反噬,一旦锁链崩解,你将彻底被黑暗侵蚀。',
      duration: 35000,
    },
  },
  {
    missionId: 2,
    objective: '击杀8只骷髅',
    timeLimit: 45,
    narrationAfter: {
      id: 'mission2_complete',
      text: '清理完石桥两侧的骷髅,你能清晰感受到周围的紫色藤蔓仍在疯狂蔓延,它们缠绕着石桥的桥墩,侵蚀着岸边的植被,河水也因藤蔓的污染变得浑浊。就在这时,你的右臂突然失控,黑暗魔法短暂爆发,符文锁链上出现了一道细微的裂痕,剧烈的反噬痛感让你瞬间清醒,你明白,想要活下去、想要拯救这片大陆,必须找到能净化邪恶魔法与自身的方法,而幸存的织法者们,或许掌握着关键线索。',
      duration: 35000,
    },
  },
  {
    missionId: 3,
    objective: '击杀5只水鬼',
    timeLimit: 50,
    narrationAfter: {
      id: 'mission3_complete',
      text: '击败从河流中爬出的水鬼后,你收到了幸存织法者的隐秘传讯,他们告诉你,能净化邪恶魔法的星核石板,被一名内鬼偷走并拆分为碎片,藏匿在大陆各条河岸与石桥附近,那不仅是遏制紫藤蔓延的唯一希望,更是你净化右臂、摆脱黑暗反噬的关键。更令人震惊的是,这名内鬼与散播邪恶魔法的黑暗势力早有勾结,三年前的勘探伏击,根本不是意外,而是内鬼故意泄露了你的行动路线,目的就是让你被黑暗魔法侵蚀,成为他们掌控大陆的棋子。',
      duration: 40000,
    },
  },
  {
    missionId: 4,
    objective: '击杀12只史莱姆和6只骷髅',
    timeLimit: 60,
    narrationAfter: {
      id: 'mission4_complete',
      text: '一路清理怪物、积累经验,你的法术等级不断提升,已经能熟练操控多种净化法术。此时,织法者们传来了更关键的消息:那名内鬼,竟是你曾经最敬重的导师莫甘。当年他因魔法实验失败,被黑暗魔法的力量诱惑,转而投靠黑暗势力,他计划在星辰交汇之日,用星核石板的力量彻底释放邪恶魔法,让紫色巨植覆盖整个大陆的河流与石桥,而你的右臂,正是激活这份邪恶力量的关键钥匙。如今,莫甘已带着星核石板碎片抵达星纹石桥,那里是星辰之力最集中的地方,也是他实施阴谋的最终地点,你必须尽快赶到,阻止他的恶行。',
      duration: 35000,
    },
  },
  {
    missionId: 5,
    objective: '击杀邪恶魔法核心',
    timeLimit: 70,
    narrationAfter: {
      id: 'mission5_complete',
      text: '', // Will trigger ending instead
      duration: 0,
    },
  },
];

// Ending Narrations
export const ENDINGS = {
  normal: {
    id: 'normal_ending',
    text: '你激活了星核石板的净化之力,彻底清除了大陆上的邪恶魔法,紫色巨植逐渐枯萎,缠绕石桥与河流的藤蔓慢慢退散,浑浊的河水恢复澄澈,布满藤蔓的石桥重归整洁,艾瑟拉大陆重新恢复了往日的生机。你的右臂化为布满星纹的净化手臂,既能操控星辰法术,也能施展强大的净化之力,你选择继续沿着大陆的河流与石桥游走,清理残留的被侵蚀怪物与枯萎藤蔓,默默守护着这片你用力量与牺牲换来的净土,成为了真正的紫藤守夜人。',
    duration: 30000,
  },
  hidden: {
    id: 'hidden_ending',
    text: '你在清理怪物的过程中,集齐了所有隐藏星纹碎片,不仅借助星核石板彻底净化了大陆的邪恶魔法,还找到了净化自身的方法,恢复了正常的手臂。你将星核石板安放在星纹石桥中央,守护着大陆的星辰之力与河网石桥,随后隐居在河岸林间,偶尔现身帮助那些陷入紫藤残留危机的人们,用自己的力量,默默守护着艾瑟拉大陆的和平与平衡。',
    duration: 30000,
  },
};

// Opening Narration (displayed at game start)
export const OPENING_NARRATION: StoryNarration = {
  id: 'opening',
  text: '艾瑟拉大陆，星辰之力孕育万物的古老土地。三年前，一场名为"紫藤之祸"的浩劫降临——邪恶魔法化为紫色巨藤，吞噬河流，缠绕石桥，将无数生灵扭曲为嗜血怪物。你，艾德里安·星织，曾是最年轻的织法者。为封印紫藤核心，你献祭了自己的右手，以星织之力锁住体内的黑暗魔法。如今，右臂上的符文锁链灼热如初，每一次施法都伴随着黑暗的反噬。但你别无选择——紫藤再度苏醒，而你是这片大陆最后的守夜人...',
  duration: 25000,
};
