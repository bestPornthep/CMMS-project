# AI Prompt: Liquid Glass Dark Mode Toggle Component (Angular & Tailwind CSS v4)

## Overview
Act as an expert frontend web developer. Your task is to create a **Dark Mode Toggle Button** component using **Angular** and **Tailwind CSS v4** that features the "Liquid Glass" UI effect (similar to Apple's WWDC 2025 Liquid Glass effect). 

Please base the visual effect on the principles from the article: [Liquid Glass in the Browser: Refraction with CSS and SVG](https://kube.io/blog/liquid-glass-css-svg/).

## Core Requirements
The toggle button should look like a refractive, glassy switch. When interacting with it, the background behind the switch should appear distorted (refracted) as if looking through curved glass.

Please use the following technologies and techniques:
1. **Angular**: 
   - Create a modern standalone Angular component (e.g., `LiquidGlassToggleComponent`).
   - Use Angular Signals (`signal()`) or standard component state to manage the light/dark mode status.
   - Toggle the `dark` class on the `document.documentElement` or `body` to enable Tailwind's dark mode globally.
2. **Tailwind CSS v4**: 
   - Use Tailwind v4 utility classes for layout, sizing, spacing, and transitions.
   - Utilize Tailwind's `dark:` variants to handle the background and text color shifts.
   - Apply the custom SVG backdrop filter using Tailwind's arbitrary values (e.g., `backdrop-filter-[url(#liquid-glass)]`) or a small custom CSS block if preferred.
3. **SVG Filters (The Core Effect)**: 
   - Place a hidden `<svg>` element containing the custom filters in the component's template.
   - Use `<feDisplacementMap>` to create the refraction distortion.
   - Use `<feImage>` and `<feBlend>` for a specular highlight (the shiny edges of the glass).

## Step-by-Step Instructions for the Output

Please provide the complete code separated by file, following these steps:

### 1. The Angular Component Logic (`liquid-glass-toggle.component.ts`)
Write the TypeScript code for the standalone component. It should initialize the theme based on user preference or system default, and provide a toggle method to switch states and update the DOM class.

### 2. The Component Template (`liquid-glass-toggle.component.html`)
- Include the hidden `<svg>` definition for the `#liquid-glass` filter. (*If generating a mathematically perfect displacement map is too complex for this prompt, provide a robust static base64 SVG or a highly tweaked `feTurbulence` / `feColorMatrix` setup that mimics a clear convex lens distortion.*)
- Create a semantic toggle switch using a `<button>` or `<input type="checkbox">` wrapped in a stylized label.
- Apply Tailwind v4 classes for styling the track and the moving thumb. Apply the `backdrop-filter` effect to the track so the background behind it refracts.

### 3. Application Background & Global Styles (`styles.css` / App Wrapper)
- Provide the Tailwind v4 base setup (e.g., `@import "tailwindcss";`).
- Suggest a visually rich background (like a CSS mesh gradient, a grid pattern, or varied shapes) for both light and dark modes. The refraction effect is only visible if the background behind the switch has details to distort.

## Design Constraints
- Make the toggle button relatively large (e.g., `w-24 h-12`) so the liquid glass refraction is easily observable.
- Ensure smooth Tailwind transitions (`transition-all duration-300`) for both the switch thumb movement and the theme color changes.
- Ensure it is fully accessible (ARIA labels, keyboard navigation).

Please output the code blocks clearly so I can copy, paste, and test them directly in my Angular project.
