# BookVault Design Direction

This document records the visual direction for BookVault after reviewing the supplied references and the Afterlife AI interface.

The goal is not to copy any reference. The goal is to translate useful design principles into a BookVault-specific Flask catalog UI.

BookVault should feel like a restrained digital book archive: readable, warm, practical, and deliberate. It should not become an AI agency landing page, a neon dashboard, or a fake enterprise console.

---

## 1. Product truth

BookVault is a small back-end coursework project with:

- local book catalog;
- user registration and login;
- user favorites;
- admin CRUD;
- Open Library import;
- REST API documentation;
- Postman-tested API endpoints.

The design must serve those features. It must not visually pretend that BookVault is an autonomous AI product, a complex analytics platform, or a production SaaS suite.

The interface should communicate:

- catalog clarity;
- admin control;
- readable forms;
- reliable API documentation;
- simple book discovery;
- dark academic tone.

---

## 2. Reference interpretation

### 2.1 References to use for engineering taste

Use these as discipline references, not visual templates:

- ECC: planning, verification, and process discipline.
- FreeLLMAPI: API-oriented clarity and endpoint documentation mindset.
- Appwrite / Supabase / PocketBase: setup clarity, simple backend-product language, and developer-facing documentation.
- Coolify / n8n: practical dashboard organization and workflow clarity.

### 2.2 References to use for interface taste

Use these as loose UI taste references, not direct layouts:

- ui-ux-pro-max-skill: design-review discipline and avoiding generic AI slop.
- Nelson Lee brand-guideline article: turning brand rules into reusable UI constraints.
- 21st.dev Dali template: strong hierarchy and polished composition, but do not copy the AI agency look.
- Watermelon UI: restrained components and spacing.
- Motion Primitives: purposeful microinteraction only.
- Bklit: editorial dark interface mood.
- Afterlife AI: operational-editorial restraint, warm charcoal palette, large serif moments, ruled sections, and evidence-like information grouping.

### 2.3 What not to copy from Afterlife AI

Do not copy:

- the exact hero layout;
- the huge `Give surplus inventory...` statement style;
- the `SYSTEM READY` operator-console language;
- the single linear decision-workspace structure;
- the XLSX dropzone pattern;
- the rescue workflow numbering;
- report-ledger sections;
- claim-boundary language specific to inventory rescue planning.

Afterlife AI is a decision-support workspace. BookVault is a book catalog and CRUD/API project. Borrow the restraint, not the product identity.

---

## 3. BookVault visual thesis

BookVault uses an **Academic Archive** visual language.

The interface should feel like:

- a curated digital shelf;
- an old reading room translated into a web app;
- a practical admin catalog;
- a small but polished Flask project.

It should not feel like:

- a chatbot;
- an AI dashboard;
- a crypto interface;
- a landing page template;
- a noisy SaaS admin panel;
- a plain default CRUD app.

Visual identity comes from:

1. warm dark background;
2. serif headings used selectively;
3. sans-serif or system UI for controls if added later;
4. strong spacing;
5. low-radius borders;
6. quiet brass accents;
7. book-cover-led visual rhythm;
8. forms and tables that feel deliberate.

---

## 4. Color direction

Keep the current warm dark theme, but reduce gold overload.

Recommended tokens:

```css
:root {
    --canvas: #10110E;
    --surface: #171813;
    --surface-raised: #1E2019;
    --border: #35372D;
    --border-strong: #4A4B3D;
    --text-primary: #EEECE4;
    --text-secondary: #B1AEA4;
    --text-tertiary: #7F7D74;
    --accent: #B8A767;
    --accent-hover: #D0BC78;
    --danger: #B8756D;
    --success: #819A79;
    --warning: #C29A62;
}
```

Usage rules:

- Background should be charcoal, not pure black.
- Main text should be ivory, not pure white.
- Brass is for active controls, section labels, ratings, and important links.
- Do not make every title, border, button, and label bright gold.
- Danger actions stay muted red, not neon red.
- Success states use olive, not bright green.

---

## 5. Typography direction

BookVault can keep Georgia because it fits the book theme.

Use serif for:

- main page headings;
- book titles;
- empty/error page title moments.

Use simpler interface styling for:

- forms;
- buttons;
- tables;
- metadata;
- API docs.

Avoid making every UI element look like a poster. A catalog still needs interface clarity, because apparently users enjoy being able to read things.

Recommended hierarchy:

```css
h1: clamp(34px, 5vw, 64px);
h2: 24px - 34px;
h3: 18px - 22px;
body: 16px;
metadata: 13px - 15px;
```

---

## 6. Layout direction

Do not turn BookVault into a giant single-page marketing composition.

BookVault should stay page-based:

- `/` catalog;
- `/book/<id>` detail;
- `/login` user login;
- `/register` user register;
- `/user/dashboard` favorite dashboard;
- `/admin/login` admin login;
- `/admin` admin dashboard;
- `/admin/book/add` and edit form;
- `/public-books` Open Library import;
- `/api/docs` technical documentation;
- error pages.

Use the Afterlife-style editorial restraint only as texture:

- cleaner header rhythm;
- stronger section spacing;
- fewer nested cards;
- calmer borders;
- less decorative gold.

---

## 7. Component direction

### 7.1 Header

Keep headers simple.

Allowed:

- compact title;
- short supporting subtitle;
- small navigation links.

Avoid:

- giant hero on every page;
- fake system status;
- product claims that do not fit BookVault.

### 7.2 Catalog cards

Catalog cards should behave like book entries, not KPI cards.

Prioritize:

1. cover / placeholder;
2. title;
3. author;
4. genre/year;
5. rating;
6. action link/favorite.

Card style should be quiet:

- low-radius border;
- warm surface;
- no heavy shadow;
- no hover glow;
- cover remains the visual anchor.

### 7.3 Forms

Forms should be calm and readable.

Use:

- clear labels;
- full-width inputs where useful;
- visible focus;
- consistent button placement.

Do not use Afterlife's underline worksheet controls everywhere. BookVault forms are ordinary app forms, not an operator worksheet.

### 7.4 Admin table

Admin dashboard should feel like a ledger/catalog index.

Use:

- readable row spacing;
- muted borders;
- clear action links;
- restrained delete button;
- no decorative chart overload.

The existing genre chart is acceptable if it stays quiet.

### 7.5 API Docs

API docs should lean more developer-documentation than visual showcase.

Use:

- endpoint tables;
- method labels;
- code blocks;
- API key notes;
- error response examples.

Do not over-style API docs until they become harder to scan. That would be very on-brand for humanity, but still bad.

---

## 8. Motion direction

Motion is optional and should remain minimal.

Allowed:

- button hover transition;
- link hover transition;
- subtle card border change;
- focus states.

Avoid:

- animated hero text;
- glowing cards;
- parallax;
- magnetic cursor;
- text scramble;
- infinite ambient animation;
- motion that makes screenshots look worse.

Respect reduced-motion if motion is ever added.

---

## 9. Anti-slop rules

Do not add:

- generic AI wording;
- fake insights;
- floating chatbot bubble;
- neon or purple gradients;
- glassmorphism;
- giant rounded bento cards;
- random icons;
- emoji inside UI;
- decorative charts;
- excessive shadows;
- every element in gold;
- untested CSS rewrites across all pages.

Use:

- spacing;
- hierarchy;
- readable forms;
- quiet borders;
- restrained palette;
- page-by-page visual checks.

---

## 10. Safe implementation plan

Do not change every CSS file at once again.

Use this order:

1. Create a preview branch.
2. Change only the catalog page first: `base.css` + `index.css`.
3. Review screenshots before touching other pages.
4. Then adjust login/register together.
5. Then admin dashboard.
6. Then public books.
7. Then API docs and error pages.
8. Merge only after screenshots look better than the current app.

Visual work must improve screenshots, not just sound correct in Markdown. A brutal standard, apparently.

---

## 11. Acceptance checklist

Before merging any visual pass:

- [ ] Main branch remains stable.
- [ ] Only one page group is changed per commit.
- [ ] Catalog still feels like BookVault, not Afterlife AI.
- [ ] Typography is readable.
- [ ] Brass accent is restrained.
- [ ] Forms remain easy to use.
- [ ] Admin table remains practical.
- [ ] API docs remain scannable.
- [ ] 404 page still matches the app.
- [ ] No unsupported product claims are introduced.
- [ ] No new frontend dependency is added only for aesthetics.
- [ ] Screenshots are compared before and after.

---

## 12. Source hierarchy

When references conflict, use this priority:

1. BookVault assignment requirements.
2. Current working Flask app behavior.
3. BookVault user/admin/API feature truth.
4. Existing BookVault visual identity.
5. This design direction.
6. External references.
7. Afterlife AI visual system.

External inspiration must never override what BookVault actually is.
