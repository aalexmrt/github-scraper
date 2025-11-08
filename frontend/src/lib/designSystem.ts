/**
 * Design System - Consistent spacing, colors, and typography scales
 */

// Spacing Scale (based on 4px unit)
export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem', // 8px
  md: '1rem', // 16px
  lg: '1.5rem', // 24px
  xl: '2rem', // 32px
  '2xl': '2.5rem', // 40px
  '3xl': '3rem', // 48px
  '4xl': '4rem', // 64px
};

// Typography Scale
export const typography = {
  // Page Headings
  h1: 'text-4xl md:text-5xl font-bold leading-tight tracking-tight',
  h2: 'text-3xl font-bold leading-snug tracking-tight',
  h3: 'text-2xl font-semibold leading-snug',
  h4: 'text-xl font-semibold',

  // Body Text
  body: 'text-base leading-relaxed',
  bodySmall: 'text-sm leading-relaxed',
  bodyXs: 'text-xs leading-relaxed',

  // Labels
  label: 'text-sm font-medium',
  labelSmall: 'text-xs font-medium uppercase tracking-wide',
};

// Section Spacing - Use for consistent gaps between major sections
export const sectionSpacing = {
  compact: 'space-y-4', // Tight grouping
  normal: 'space-y-6', // Standard spacing
  relaxed: 'space-y-8', // Generous spacing
  loose: 'space-y-12', // Extra large spacing
};

// Action Button Variants with Colors
export const actionColors = {
  primary: {
    bg: 'bg-blue-600',
    bgHover: 'hover:bg-blue-700',
    text: 'text-white',
    border: 'border-blue-600',
    light: 'bg-blue-50 dark:bg-blue-950/50',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  secondary: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    bgHover: 'hover:bg-gray-200 dark:hover:bg-gray-700',
    text: 'text-gray-900 dark:text-gray-100',
    border: 'border-gray-300 dark:border-gray-600',
    light: 'bg-gray-50 dark:bg-gray-900',
    icon: 'text-gray-600 dark:text-gray-400',
  },
  success: {
    bg: 'bg-green-600',
    bgHover: 'hover:bg-green-700',
    text: 'text-white',
    border: 'border-green-600',
    light: 'bg-green-50 dark:bg-green-950/50',
    icon: 'text-green-600 dark:text-green-400',
  },
  warning: {
    bg: 'bg-amber-600',
    bgHover: 'hover:bg-amber-700',
    text: 'text-white',
    border: 'border-amber-600',
    light: 'bg-amber-50 dark:bg-amber-950/50',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  danger: {
    bg: 'bg-red-600',
    bgHover: 'hover:bg-red-700',
    text: 'text-white',
    border: 'border-red-600',
    light: 'bg-red-50 dark:bg-red-950/50',
    icon: 'text-red-600 dark:text-red-400',
  },
};

// Status Badge Colors
export const statusColors = {
  completed: {
    bg: 'bg-green-100 dark:bg-green-950',
    text: 'text-green-800 dark:text-green-200',
    border: 'border-green-300 dark:border-green-700',
    icon: 'text-green-600 dark:text-green-400',
    label: 'Completed',
  },
  processing: {
    bg: 'bg-blue-100 dark:bg-blue-950',
    text: 'text-blue-800 dark:text-blue-200',
    border: 'border-blue-300 dark:border-blue-700',
    icon: 'text-blue-600 dark:text-blue-400',
    label: 'Processing',
  },
  pending: {
    bg: 'bg-yellow-100 dark:bg-yellow-950',
    text: 'text-yellow-800 dark:text-yellow-200',
    border: 'border-yellow-300 dark:border-yellow-700',
    icon: 'text-yellow-600 dark:text-yellow-400',
    label: 'Pending',
  },
  failed: {
    bg: 'bg-red-100 dark:bg-red-950',
    text: 'text-red-800 dark:text-red-200',
    border: 'border-red-300 dark:border-red-700',
    icon: 'text-red-600 dark:text-red-400',
    label: 'Failed',
  },
};

// Card Variants
export const cardVariants = {
  default:
    'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800',
  elevated:
    'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-md hover:shadow-lg transition-shadow',
  subtle:
    'bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50',
  highlight:
    'bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 border border-blue-200 dark:border-blue-800/50',
};

// Container Widths
export const containers = {
  tight: 'max-w-2xl',
  normal: 'max-w-4xl',
  wide: 'max-w-6xl',
  full: 'w-full',
};

// Border Radius
export const borderRadius = {
  sm: 'rounded-md',
  md: 'rounded-lg',
  lg: 'rounded-xl',
  full: 'rounded-full',
};

// Shadows
export const shadows = {
  xs: 'shadow-sm',
  sm: 'shadow',
  md: 'shadow-md',
  lg: 'shadow-lg',
  xl: 'shadow-xl',
};

// Transitions
export const transitions = {
  fast: 'transition-all duration-150',
  normal: 'transition-all duration-300',
  slow: 'transition-all duration-500',
};
