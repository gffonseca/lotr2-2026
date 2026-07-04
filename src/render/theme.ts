/** Paleta e constantes visuais compartilhadas (camada de render). */
export const THEME = {
  bg: 0x14110c,
  panel: 0x231d14,
  gold: 0xd9b25a,
  ink: 0xefe4cf,
  blue: 0x4f7fd0,
  blueDark: 0x2c4f88,
  red: 0xc8553a,
  redDark: 0x7f2f24,
  green: 0x7fae54,
  neutral: 0x8a8172,
  neutralDark: 0x5a5348,
  line: 0x3d3320,
} as const;

export const FACTION_COLOR: Record<string, number> = {
  blue: THEME.blue,
  red: THEME.red,
  green: 0x5aa050,
  neutral: THEME.neutral,
};
export const FACTION_DARK: Record<string, number> = {
  blue: THEME.blueDark,
  red: THEME.redDark,
  green: 0x2f6a2a,
  neutral: THEME.neutralDark,
};
