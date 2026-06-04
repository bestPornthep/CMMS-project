---
name: Industrial Precision
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#42474d'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#73777e'
  outline-variant: '#c2c7ce'
  surface-tint: '#3f6182'
  primary: '#00182b'
  on-primary: '#ffffff'
  primary-container: '#002d4b'
  on-primary-container: '#7395b8'
  inverse-primary: '#a7caef'
  secondary: '#b71229'
  on-secondary: '#ffffff'
  secondary-container: '#db323e'
  on-secondary-container: '#fffbff'
  tertiary: '#141718'
  on-tertiary: '#ffffff'
  tertiary-container: '#292b2c'
  on-tertiary-container: '#909293'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cee5ff'
  primary-fixed-dim: '#a7caef'
  on-primary-fixed: '#001d33'
  on-primary-fixed-variant: '#264969'
  secondary-fixed: '#ffdad8'
  secondary-fixed-dim: '#ffb3b0'
  on-secondary-fixed: '#410006'
  on-secondary-fixed-variant: '#93001b'
  tertiary-fixed: '#e1e2e3'
  tertiary-fixed-dim: '#c5c7c8'
  on-tertiary-fixed: '#191c1d'
  on-tertiary-fixed-variant: '#454748'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
  deep-navy: '#002D4B'
  precision-red: '#AF0824'
  industrial-gray: '#E5E6E7'
  ink-black: '#1A1A1A'
typography:
  headline-xl:
    fontFamily: IBM Plex Sans
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base-unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 64px
  max-width: 1280px
---

## Brand & Style
This design system is engineered for the industrial and electronics manufacturing sector, emphasizing reliability, technical precision, and global authority. The aesthetic is rooted in **Corporate Modernism**, utilizing a structured grid and a high-contrast palette to convey a sense of "built-to-last" quality. 

The target audience consists of B2B partners, engineers, and stakeholders who value stability and technological sophistication. Visuals should be clean and purposeful, avoiding decorative excess in favor of functional clarity. The UI should evoke a feeling of professional confidence and meticulous craftsmanship.

## Colors
The color palette is anchored by **Deep Navy**, representing stability and corporate heritage. **Precision Red** is used sparingly as a high-visibility accent for calls-to-action, critical alerts, and brand emphasis. 

- **Primary (Deep Navy):** Use for headers, primary buttons, and navigational elements.
- **Secondary (Precision Red):** Reserved for interactive highlights and status indicators.
- **Neutral (Ink Black & Industrial Gray):** Ink Black is the standard for body text to ensure maximum legibility, while Industrial Gray serves as a subtle background for sectioning content and UI containers.
- **White:** Used generously to provide "breathing room" and maintain a professional, airy feel despite the heavy primary colors.

## Typography
The typography utilizes **IBM Plex Sans**, a typeface designed to reflect the relationship between mankind and machines. Its engineered details and neutral-yet-friendly tone perfectly match the industrial focus of this design system.

- **Headlines:** Set in Bold or Semi-Bold weights with slightly tightened letter-spacing for a commanding, professional presence.
- **Body Text:** Prioritizes readability with a 1.5x line height and standard weight.
- **Labels:** Use uppercase styling and increased letter spacing to differentiate metadata, categories, and small utility text from body content.
- **Scale:** On mobile devices, large display headings should scale down to prevent excessive wrapping while maintaining hierarchy.

## Layout & Spacing
This design system employs a **Fixed Grid** model for desktop and a **Fluid Grid** for mobile. The layout is built on an 8px base unit to ensure consistent vertical rhythm and component alignment.

- **Desktop (1024px+):** 12-column grid with a 1280px max-width. Use 24px gutters. Content is centered with wide margins to focus the eye on the central narrative.
- **Tablet (768px - 1023px):** 8-column grid with 24px margins. Elements should stack logically, moving from multi-column cards to single-column lists.
- **Mobile (Up to 767px):** 4-column grid with 16px margins. Padding is reduced to maximize screen real estate.
- **Spacing Rhythm:** Use increments of 8px (8, 16, 24, 32, 48, 64) for all paddings and margins to create a mathematically sound visual balance.

## Elevation & Depth
Depth in this design system is primarily conveyed through **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows. This maintains a flat, engineered aesthetic that feels modern and lightweight.

- **Surface Levels:** The primary background is White. Secondary containers (like cards or sidebars) use Industrial Gray (#E5E6E7) or subtle 1px borders in the same color to define boundaries.
- **Interactive Depth:** Only use shadows for "floating" elements like dropdown menus, modals, or tooltips. These shadows should be extremely diffused (15-20px blur) with low opacity (10%) to avoid looking "heavy."
- **Focus States:** Elements like input fields should use a 2px Deep Navy border when focused, ensuring a clear "mechanical" change in state.

## Shapes
The shape language is **Soft (0.25rem)**. While sharp corners feel overly aggressive, excessive rounding feels too consumer-focused. A subtle 4px radius on buttons, inputs, and cards provides a modern touch while retaining a professional, structural appearance. 

- **Standard Radius:** 4px (0.25rem) for most UI elements.
- **Large Radius:** 8px (0.5rem) for major containers or cards.
- **Icons:** Should follow a linear, 2px stroke weight style with the same subtle corner rounding to match the typography and UI components.

## Components
- **Buttons:** Primary buttons are solid Deep Navy with white text. Secondary buttons are outlined (Deep Navy border). Ghost buttons are reserved for tertiary actions. All buttons use 16px horizontal and 12px vertical padding.
- **Inputs:** Use a 1px border in Industrial Gray. On hover, the border darkens; on focus, it becomes Deep Navy. Labels always sit above the input field in the Label-MD type style.
- **Cards:** Cards should have a 1px Industrial Gray border and no shadow. On hover, a card may lift slightly with a very soft ambient shadow to indicate interactivity.
- **Chips/Badges:** Use solid Industrial Gray for neutral states and Deep Navy for active/selected states. If indicating an "Error" or "Urgent" status, use Precision Red.
- **Lists:** Use 1px Industrial Gray horizontal dividers between list items. High-density information should utilize the Caption or Body-MD text styles to maintain clarity.
- **Data Tables:** Crucial for industrial contexts. Use alternating row colors (White and Industrial Gray) with bolded Deep Navy headers for high legibility in complex data sets.