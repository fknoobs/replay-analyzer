// RESEARCH ONLY - mapping of command and item types in Company of Heroes replays
// MANUAL RESEARCH - DO NOT DELETE

const UNIT = 0x3; // Might have different subtypes for infantry, vehicles, etc .. did not observe yet
const UNIT_COMMAND = 0x37; // Might have different subtypes .. did not observe yet
const BUILDING = [0x57, 0x64] as const; // T1 / T2, observation post etc .. Sandbags, mines, wire etc ..
const DOCTRINAL = [0x62] as const;
const UPGRADE = [0x34, 0x14] as const; // flamethrower, mp40, but also building upgrades, like sticky bobms, grenades etc ..
const SPECIAL_ABILITY = [0x37, 0x5f] as const;

const MOVE = 0x2d;
const CAPTURE = 0x31;
const RALLY_POINT = 0x0f;
const HALT = 0x2e;
const ATTACK_MOVE = 0x36;
const GROUND_ATTACK = 0x32;
const RETREAT = 0x3f;
const ORDER_UNIT_TO_BUILD = 0x30; // 0x3

// ???

const engineers = 0xa;
