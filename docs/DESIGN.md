# OutboundEngine — Design System

**Status:** authoritative. If code and this document disagree, the code is wrong.

## Why this document exists

The previous `globals.css` carried a machine-generated Material-3 token set under a
comment claiming it was "GitHub Primer Dark", plus a `/* Legacy variable mappings */`
block aliasing an even older system. Two design languages, neither committed to.
That is why the UI read as incoherent — not because any single screen was badly
built, but because no screen agreed with another on what a surface or an accent was.

The rule that prevents a repeat: **one token layer, no aliases, no second system.**

## Who this is for

A sales/growth operator who lives in this tool for hours: importing leads, reading
research, approving AI-written drafts. That implies:

- **Density over decoration.** They scan tables of 500 leads, not a marketing page.
- **Legibility is the feature.** Long reading sessions; contrast and type scale matter more than flourish.
- **Status must be unambiguous.** "Sent", "failed", "awaiting review" have to be distinguishable at a glance, and not by hue alone.
- **Calm.** Nothing animates unless it communicates state. No decorative motion.

## Identity

Dark, neutral, one accent. Restrained and utilitarian — closer to Linear or Vercel
than to Material. The interface recedes; the lead data and the email copy are the
only things that should attract the eye.

## Tokens

One neutral ramp, one accent, four semantic statuses. Small enough to memorise,
which is what makes it enforceable.

### Surfaces & text — neutral ramp, slight cool cast

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0B0D10` | app background |
| `--surface` | `#131619` | cards, panels |
| `--surface-raised` | `#1A1E23` | popovers, modals, hover |
| `--border` | `#252A31` | dividers, input borders |
| `--border-strong` | `#353B44` | focus rings, emphasised edges |
| `--text` | `#E6E9ED` | primary text |
| `--text-muted` | `#9BA3AE` | secondary text, labels |
| `--text-subtle` | `#6B737E` | placeholders, disabled |

### Accent — exactly one

| Token | Value | Use |
|---|---|---|
| `--accent` | `#4C8DFF` | primary action, active nav, focus |
| `--accent-hover` | `#6BA1FF` | hover state |
| `--accent-subtle` | `#4C8DFF1A` | selected row, accent-tinted fill |
| `--on-accent` | `#0B0D10` | text on accent fill |

### Semantic status

| Token | Value | Meaning |
|---|---|---|
| `--success` | `#3FB950` | sent, delivered, approved |
| `--warning` | `#D29922` | awaiting review, throttled |
| `--danger` | `#F85149` | failed, bounced, unsubscribed |
| `--info` | `#58A6FF` | researching, generating, in progress |

Each has a `-subtle` variant at ~12% alpha for badge and row backgrounds.

**Status is never encoded by colour alone** — every status badge carries a text
label. Colour is reinforcement, not the signal. This is both an accessibility
requirement and a practical one: these states drive real sending decisions.

### Type

`DM Sans` for UI, `JetBrains Mono` for email bodies, URLs, and IDs — both already
loaded by the current build, so this is not a new dependency.

| Token | Size / line-height | Use |
|---|---|---|
| `--text-xs` | 11 / 16, +0.05em, 600 | table headers, overline labels |
| `--text-sm` | 13 / 18 | table cells, secondary UI |
| `--text-base` | 14 / 20 | body default |
| `--text-lg` | 16 / 24, 500 | card titles |
| `--text-xl` | 20 / 28, 600 | page headings |
| `--text-2xl` | 28 / 36, 600 | page titles |

### Spacing & radius

4px base unit: `4 / 8 / 12 / 16 / 24 / 32 / 48`.

Radius: `--radius-sm: 4px` (badges, inputs), `--radius: 8px` (cards, buttons),
`--radius-lg: 12px` (modals). No fully-rounded surfaces except avatars.

## Rules

1. **No hardcoded colour values in components.** The previous UI had 37 hex literals
   across three pages, which is how tokens silently stop meaning anything. Enforced
   by the Phase 3 grep check.
2. **No inline `style={{}}`** except for genuinely dynamic values (a computed bar
   width). Never for colour, spacing, or type.
3. **No second token system.** If something is unrepresentable here, extend this
   file — do not add a parallel set of variables.
4. **Contrast floor: WCAG AA.** 4.5:1 for body text, 3:1 for large text and UI
   boundaries. `--text-subtle` is the lightest permitted on `--bg`; do not go lighter.
5. **Motion is state, not decoration.** Transitions ≤150ms, on `opacity` and
   `transform` only. Honour `prefers-reduced-motion`.
6. **Every list has three states**: loading (skeleton), empty (explains what to do
   next), error (says what failed and offers a retry). The current UI ships loading
   states but is inconsistent about the other two.

## Primitives

Built once, in `src/components/ui/`, consuming tokens only:

`Button` (primary / secondary / ghost / danger) · `Card` · `Badge` (the four
semantic statuses) · `Input` · `Select` · `Table` · `Spinner` · `EmptyState` ·
`ErrorState` · `Modal`

Pages compose these. A page that needs a one-off visual treatment is a signal the
primitive is missing — add it here rather than inlining an exception.
