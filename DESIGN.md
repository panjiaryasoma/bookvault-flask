# BookVault Design Direction

This document records the visual and product-design direction for BookVault. It uses the supplied references as inspiration only. Do not copy layouts, code, brand assets, or proprietary material from any source.

## Goal

BookVault should feel like a clean, serious digital book catalog, not a generic AI dashboard or overdecorated dark theme.

The UI should stay simple enough for a Flask course project, but look more deliberate than a default CRUD screen.

## Reference Roles

### Engineering and product discipline

Use these references for engineering taste, structure, and product credibility, not direct UI copying:

- ECC: planning, verification, and process discipline.
- FreeLLMAPI: API-oriented clarity and endpoint documentation mindset.
- Appwrite, Supabase, PocketBase: backend-product clarity, simple setup language, and developer-facing documentation tone.
- Coolify: self-hosted product clarity and pragmatic dashboard organization.
- n8n: workflow/product clarity and readable navigation patterns.

### UI and interaction direction

Use these references for visual and interface cues:

- ui-ux-pro-max-skill: UI critique checklist and design-quality guardrail.
- Nelson Lee brand-guidelines post: convert brand rules into reusable interface rules.
- 21st.dev Dali template: confident software-studio presentation, but avoid copying the AI-agency aesthetic.
- Watermelon UI: component consistency and dashboard block discipline.
- Motion Primitives: subtle interaction only. No decorative animation for a simple Flask app.
- Bklit: data/card readability and restraint.

## BookVault Visual Positioning

BookVault should be:

- editorial
- academic
- calm
- readable
- slightly premium
- restrained
- clear for evaluators

BookVault should not be:

- neon
- glossy
- animated for no reason
- startup-template heavy
- glassmorphism
- full of gradients
- icon soup
- fake AI product UI

## Palette

Keep the current warm dark-academia palette, but use it with restraint.

```css
--bg: #16130f;
--surface: #211b14;
--surface-soft: #241e17;
--border: #6b4f2a;
--text: #f3ead7;
--muted: #c8bfae;
--accent: #d4af37;
--accent-soft: #b8942e;
--danger: #8b2f2f;
--success: #9be28f;
--warning: #f5c542;
--error: #ff8f8f;
```

Rules:

- Gold is for headings, primary actions, ratings, and selected states.
- Do not make every border, link, and label compete for attention.
- Red is only for destructive actions.
- Keep backgrounds warm and dark.

## Typography

Use Georgia as the main visual identity.

Rules:

- Page titles should feel like book-section headings.
- Metadata should be smaller and muted.
- API Docs can use code blocks, but the rest of the app should feel literary rather than terminal-like.

## Layout Rules

- Keep generous spacing.
- Keep cards readable.
- Avoid dense, tiny CRUD tables unless the page is explicitly admin-focused.
- Forms should feel like editorial panels, not browser defaults.
- Dashboard admin can be data-heavy, but it must stay quiet and structured.

## Component Rules

### Cards

Cards should have:

- dark panel background
- brass border
- low-radius corners
- clear title hierarchy
- enough spacing between metadata, description, and action

### Buttons

Primary button:

- gold background
- dark text
- bold

Secondary button:

- dark background
- brass border
- gold text

Danger button:

- dark red background
- white text

### Forms

Inputs should be consistent across login, register, admin form, filters, and import genre.

Focus state must be visible but not neon.

### Tables

Admin tables should look like a ledger:

- readable rows
- quiet borders
- muted metadata
- destructive actions visually separated

### Animation

Use motion only if it improves comprehension.

For this project, CSS hover/focus states are enough. Do not add animation libraries.

## Implementation Plan

Do not rewrite the entire visual system at once.

Safe order:

1. Keep the existing layout.
2. Normalize CSS variables in `base.css`.
3. Reduce duplicated global CSS from page files.
4. Improve spacing and hierarchy page by page.
5. Test each page manually.
6. Merge only after visual review.

## Visual Review Checklist

Before merging any visual pass:

- Katalog still readable.
- Login/register still centered and clean.
- Admin dashboard still shows stats clearly.
- Table actions still usable.
- Public Books import flow still obvious.
- API Docs still readable.
- 404/500 pages still match the theme.
- No page looks more "AI agency template" than book catalog.

## Important Constraint

BookVault is a Flask UAS project. Do not overbuild it into a React-style product site. The design should improve credibility without distracting from the backend features.
