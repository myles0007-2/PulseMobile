export type ThemeName = 'dark' | 'midnight' | 'forest' | 'rose' | 'slate' | 'amber';

export interface ThemeColors {
  bg: string;
  surface: string;
  card: string;
  border: string;
  primary: string;
  primaryDim: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  overlay: string;
}

export const themes: Record<ThemeName, ThemeColors> = {
  dark: {
    bg: '#0a0a0a', surface: '#141414', card: '#1c1c1c', border: '#2a2a2a',
    primary: '#1db954', primaryDim: '#158a3c',
    text: '#ffffff', textSecondary: '#b3b3b3', textMuted: '#666666',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.7)',
  },
  midnight: {
    bg: '#080c14', surface: '#0f1420', card: '#161d2e', border: '#1e2a40',
    primary: '#5b8af0', primaryDim: '#3a63c8',
    text: '#e8eaf6', textSecondary: '#9aa3bf', textMuted: '#556080',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.75)',
  },
  forest: {
    bg: '#090e0a', surface: '#111810', card: '#182016', border: '#223020',
    primary: '#4caf72', primaryDim: '#357a50',
    text: '#e8f0e9', textSecondary: '#9ab89e', textMuted: '#527055',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.72)',
  },
  rose: {
    bg: '#0e090d', surface: '#1a1018', card: '#221520', border: '#321e2e',
    primary: '#e05a8a', primaryDim: '#a83d66',
    text: '#f5e8f0', textSecondary: '#c09aaf', textMuted: '#7a5568',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.72)',
  },
  slate: {
    bg: '#0b0d10', surface: '#13171e', card: '#1a1f28', border: '#252c38',
    primary: '#7bb8d4', primaryDim: '#4d8fad',
    text: '#dce6ef', textSecondary: '#8fa6b8', textMuted: '#4f6478',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.72)',
  },
  amber: {
    bg: '#0d0a06', surface: '#17120a', card: '#201a0e', border: '#302514',
    primary: '#f0a040', primaryDim: '#c07820',
    text: '#f5ede0', textSecondary: '#c0a882', textMuted: '#7a6040',
    danger: '#e85d5d', overlay: 'rgba(0,0,0,0.72)',
  },
};

export const THEME_LABELS: Record<ThemeName, string> = {
  dark: '⬛ Dark',
  midnight: '🌙 Midnight',
  forest: '🌲 Forest',
  rose: '🌹 Rose',
  slate: '🪨 Slate',
  amber: '🔥 Amber',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, full: 9999 };
export const fontSize = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28, display: 36 };
