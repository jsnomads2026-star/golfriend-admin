export const V2Theme = {
  courseGreen: '#123F31', fairway: '#2E6B4D', fairwayLight: '#3D8A62', clubhouseCream: '#F7F3E8', warmWhite: '#FFFCF5', gold: '#B89552', goldHover: '#D4AF37',
  surfaceDark: '#0E1C18', surfacePanel: '#152A22', surfaceCard: '#1A3328', surfaceBorder: '#2A4A3A', surfaceBorderHover: '#3A5A4A', surfaceMuted: '#4A6A5A', surfaceText: '#C8DDD4', surfaceTextMuted: '#7A9A8A',
  surfaceLight: '#FFFCF5', surfaceLightPanel: '#F7F3E8', surfaceLightCard: '#EEE8D5', surfaceLightBorder: '#C8BFA8', surfaceLightText: '#1A2E26', surfaceLightMuted: '#5A7A6A',
  errorRed: '#E53E3E', warningAmber: '#D69E2E', successGreen: '#38A169',
  fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', fontMono: '"JetBrains Mono", "Courier New", monospace',
  radiusSm: '4px', radiusMd: '8px', radiusLg: '12px', radiusXl: '20px', radiusPill: '9999px',
  shadowCard: '0 2px 12px rgba(18, 63, 49, 0.18)', shadowMenu: '0 8px 32px rgba(18, 63, 49, 0.28)',
} as const;
export type V2ThemeType = typeof V2Theme;
