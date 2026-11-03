# AccordOS Design System

AccordOS is a commercial execution desk. It is used by an operator who is moving other people's money, so the interface has one job: make the state of every dollar legible at a glance, and make every irreversible action feel deliberate. The visual language is calm and editorial: warm paper, charcoal ink and one sage accent, with the precision of a trading terminal underneath (tabular figures, mono identifiers, every call traced). The reference point is the restraint of modern developer-infrastructure sites rather than the glow of crypto dashboards.

## 1. Principles

1. **Money has a state, and state has a color.** Every amount on screen carries exactly one lifecycle state (proposed, invoiced, held, captured, paid out, blocked, disputed). The state is shown by a colored dot, a short tag and its position in the chain. Color is never the only signal.
2. **Ink on paper.** The canvas is warm paper (`#FEFCF5`), never pure white; text is warm charcoal, never pure black. Surfaces separate by hairlines and a whisper of shadow, not by heavy borders.
3. **One accent.** Sage green marks focus, progress and the highlighted half of each headline. Primary actions are charcoal pills; everything else is a cream secondary pill.
4. **The AI proposes, the vault disposes.** Agent output is visually distinct (dashed outline, "Proposed" tag) from committed state (solid). Committing requires a visible human action or a policy rule that is named on screen.
5. **Nothing is ever blank.** Every panel has six designed states: ready, loading, empty, error with retry, overflow, and success.
6. **Motion explains causality.** Animation is used only to show that one thing caused another (a payment clears, a gate opens, downstream bars slide). The only ambient motion is the pulsing stream indicator.

## 2. Color tokens

All colors are CSS custom properties on `:root` in `web/src/styles.css`. Light (paper) is the default; a warm charcoal theme is selected with the header toggle, which sets `data-theme="dark"` on `<html>` and is remembered per browser. AG Grid, AG Studio and Bryntum read the same tokens (Bryntum swaps its own light and dark sheets to follow the toggle).

### Neutrals

| Token | Paper | Charcoal | Use |
| --- | --- | --- | --- |
| `--ink-0` | `#FEFCF5` | `#151413` | Canvas |
| `--ink-1` | `#FFFEFB` | `#1C1B19` | Panels and cards |
| `--ink-2` | `#F7F5EE` | `#232220` | Inset wells, inputs, code |
| `--ink-3` | `#EFECE2` | `#2D2B28` | Hover, selected |
| `--line` | ink at 9% | paper at 8% | Hairlines |
| `--line-strong` | ink at 18% | paper at 17% | Emphasised rules |
| `--text-0` | `#3C3A39` | `#F3EFE6` | Primary text |
| `--text-1` | ink at 66% | paper at 68% | Secondary text |
| `--text-2` | ink at 46% | paper at 44% | Labels, axis ticks |

### Accent and money states

| Token | Paper | State |
| --- | --- | --- |
| `--accent` | `#5F8072` | Sage: focus ring, progress, headline highlight |
| `--st-draft` | `#8A847B` | Proposed by an agent |
| `--st-invoiced` | `#B9790C` | Invoice issued, awaiting payment |
| `--st-authorized` | `#2F6FD6` | Funds held (Orders v2 AUTHORIZE) |
| `--st-captured` | `#3F7A5F` | Funds captured or invoice paid |
| `--st-paidout` | `#23807B` | Disbursed to a vendor via Payouts |
| `--st-blocked` | `#D1433B` | Rejected by the firewall or voided |
| `--st-disputed` | `#7A55C9` | Under dispute |

Each state has a `-bg` tint for tags and row fills. Budget categories use ink, sage and sand (`--cat-1..3`), and AG Studio charts use a matching eight-color palette that reads on both themes.

## 3. Typography

- **Sans:** Geist 400/500/600 for UI, prose, headings and large figures (with tabular numerals).
- **Mono:** Geist Mono 400/500 for amounts in tables, IDs, timestamps, latency, API paths, eyebrows and labels.
- **Headlines:** 52px (fluid down to 34px), weight 500, tracking -0.035em, in two tones: the second phrase carries a sage gradient.
- **Eyebrows:** mono, lowercase, slash-prefixed (`/02 procurement channel3 + orders v2`).
- **Scale (px):** 11.5 label, 12.5 meta, 14 body, 15 panel title, 15.5 lede, 30 figure, 46 hero figure.

## 4. Space, shape and depth

- 4px base grid. Panel padding 20px, page gutter 32px (16px on phones), content max width 1360px.
- Radius: 999px on buttons, tags, chips and the stage switcher; 16px on panels; 12-14px on inner cards and inputs.
- Depth: hairline borders plus a soft two-layer card shadow. Floating layers (tour dock, toasts) use one larger shadow. The header and telemetry bar use a light backdrop blur over the paper.
- Buttons: primary is a charcoal gradient pill with an inner top highlight; secondary is a cream gradient pill with a hairline border; ghost has no chrome.

## 5. Layout

```
+-----------------------------------------------------------------------+
| Status strip (sage): Live on PayPal Sandbox | Claude | Channel3  clock |
+-----------------------------------------------------------------------+
| accordos  Client / project                   theme  Reset  Judge tour  |  sticky
+-----------------------------------------------------------------------+
|   ( 01 Tranche | 02 Bake-Off | 03 Schedule | 04 Ledger | 05 Red-Team ) |
|   /eyebrow                                                             |
|   Two-tone headline                                    [stage actions] |
|   Lede                                                                 |
|   Panels on a 12-column grid                                           |
+-----------------------------------------------------------------------+
| Telemetry bar (fixed, expands into the call inspector)                 |
+-----------------------------------------------------------------------+
```

- The stage switcher is a segmented pill control; each stage shows a dot in the furthest money state it has produced.
- The judge tour runs as a floating charcoal dock above the telemetry bar, with a sage progress line and a Stop button.
- Below 1100px panels stack to full width; below 760px gutters drop to 16px, the strip keeps only mode and stream, and the switcher scrolls horizontally. There is no horizontal page scroll; wide tables and the Gantt scroll inside their panel.

## 6. Components

- **Figure:** a large tabular sans number with a mono label above and a muted note below.
- **State tag:** a pill with a colored dot and a sentence-case label on the state's `-bg` tint.
- **Proposal card:** dashed 1px border in `--st-draft`, a "PROPOSAL" tag and a commit button. Committed cards switch to a solid border.
- **Chain:** horizontal sequence of nodes (Client, Escrow, Vendor) joined by sage dashed links that flow when money moves along it.
- **Telemetry row:** method, path, SDK origin (APIMatic SDK, REST, MCP tool, Replay), HTTP status, latency. Clicking expands request and response JSON.
- **Toasts:** bottom-right cards with a status dot, max three, auto-dismiss at 4s; failures use `--st-blocked` and include a retry action.

## 7. Six-state coverage

Every data panel is rendered through one `Panel` contract:

| State | Treatment |
| --- | --- |
| Ready | Content |
| Loading | Skeleton bars at the real content's geometry, 1.2s shimmer using `transform` only |
| Empty | One sentence on what will appear here and the action that produces it |
| Error | The error message, the endpoint that failed, and a Retry button |
| Overflow | Long text truncates with ellipsis and a full-value `title`; long lists cap and show "+N more" |
| Success | Toast plus an inline state change on the affected element |

## 8. Motion and performance

- Durations: 120ms for hover and press, 240ms for state changes, 600ms for causal reflow (Gantt bars sliding after a payment event).
- Easing: `cubic-bezier(0.2, 0, 0, 1)`.
- Only `transform` and `opacity` animate. Animated tracks use `translate3d`, `will-change: transform` and `contain: layout paint`.
- Running clocks and latency counters write to DOM nodes through refs inside `requestAnimationFrame`; they never drive React state.
- `prefers-reduced-motion` turns all causal motion into instant state changes.

## 9. Voice

- Short, declarative, operational. "Hold placed for $4,180.00" not "Great news! Your hold was placed."
- No emojis anywhere in the product or the docs.
- Every agent message names its evidence: which rule, which API response, which number.

## 10. Accessibility

- Text contrast is at least 4.5:1 against its surface; state colors meet 3:1 against `--ink-1` and always come with a text tag.
- Visible focus ring: 2px sage `--accent` outline with 2px offset.
- All interactive controls are real buttons or links, reachable by keyboard, with labels.
