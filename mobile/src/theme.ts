import { useColorScheme } from 'react-native';

const light = {
  bg: '#F5F4F8',
  card: '#FFFFFF',
  cardAlt: '#EEEBF7',
  text: '#17161C',
  muted: '#6C6A78',
  border: '#E3E0EC',
  primary: '#6C4CF1',
  primaryText: '#FFFFFF',
  accent: '#FF5C7A',
  success: '#17A066',
  warning: '#C77700',
  danger: '#D93B4A',
  chip: '#EFEBFF',
  chipText: '#4B32C9',
  bubbleMine: '#6C4CF1',
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#FFFFFF',
};

const dark: typeof light = {
  bg: '#0E0D13',
  card: '#1A1922',
  cardAlt: '#24222F',
  text: '#F3F2F7',
  muted: '#A09DAE',
  border: '#2D2B39',
  primary: '#9C86FF',
  primaryText: '#120F24',
  accent: '#FF7A93',
  success: '#3CCB8C',
  warning: '#F0A43A',
  danger: '#FF6B78',
  chip: '#2A2445',
  chipText: '#C9BDFF',
  bubbleMine: '#7B5CFF',
  bubbleMineText: '#FFFFFF',
  bubbleTheirs: '#24222F',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const AVATAR_EMOJI = ['🙂', '😎', '🦊', '🐱', '🐻', '🐼', '🦁', '🐸', '🌸', '🌵', '🍀', '⚡', '🎧', '🎨', '📚', '🏄', '🚲', '🎸'];
export const AVATAR_COLORS = ['#6C4CF1', '#FF5C7A', '#FF9F1C', '#17A066', '#1E88E5', '#00ACC1', '#8E24AA', '#5D4037'];

export const radius = { s: 8, m: 14, l: 20, pill: 999 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
