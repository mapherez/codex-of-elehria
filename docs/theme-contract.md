# Theme contract

Nox Wiki exposes five opaque colors and three font-family stacks. The same resolved palette styles the reader, header, search, Admin and Canvas graph. Layout, spacing, radii, animation, shadows and semantic status seeds remain internal.

## Configure the standalone application

Add an optional `theme` object to your existing `config/site.json` (or the file selected by `SITE_CONFIG_FILE`). Both servers read it at startup and expose the non-sensitive theme through `/api/config`, respecting `basePath`. Restart Public and Admin after changing the site file. Theme changes do not require resetting state, editing Markdown or publishing pages.

Omitting `theme`, or using `"theme": {}`, selects these defaults:

```json
{
  "colors": {
    "background": "#101214",
    "surface": "#15181c",
    "text": "#e7e6e2",
    "accent": "#cfb991",
    "link": "#a9c7ec"
  },
  "fonts": {
    "body": "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif",
    "display": "ui-serif, Georgia, Cambria, \"Times New Roman\", serif",
    "mono": "ui-monospace, SFMono-Regular, Consolas, monospace"
  }
}
```

Change only the accent:

```json
{
  "theme": {
    "colors": { "accent": "#8bc5b1" }
  }
}
```

A complete light theme:

```json
{
  "theme": {
    "colors": {
      "background": "#f5f6f8",
      "surface": "#ffffff",
      "text": "#20242b",
      "accent": "#8c6a32",
      "link": "#315f96"
    },
    "fonts": {
      "body": "system-ui, sans-serif",
      "display": "Georgia, serif",
      "mono": "ui-monospace, Consolas, monospace"
    }
  }
}
```

## Public TypeScript API

Import the component and theme API from `apps/web/src/lib/reader`, or the pure resolver/types from `packages/theme`.

```ts
type ThemeColor = `#${string}`;

interface ThemeColors {
  readonly background: ThemeColor;
  readonly surface: ThemeColor;
  readonly text: ThemeColor;
  readonly accent: ThemeColor;
  readonly link: ThemeColor;
}
interface ThemeFonts {
  readonly body: string;
  readonly display: string;
  readonly mono: string;
}
interface ThemeConfig {
  readonly colors?: Partial<ThemeColors>;
  readonly fonts?: Partial<ThemeFonts>;
}
```

`defaultTheme` is the complete default configuration. `validateTheme(input: unknown)` returns either `{ ok: true, config }` with a complete normalized configuration, or `{ ok: false, issues }`. Each issue contains a field path and a typed code. `resolveTheme(config?: ThemeConfig)` returns `ResolvedTheme` or throws `ThemeValidationError` containing those issues.

The internal type has readonly `colors`, `fonts`, `colorScheme`, `neutralWash`, `neutralWashHover`, `accentWash`, `accentStroke` and `semantic` fields. Washes/strokes store `{ color, alpha }`, retaining the source hue instead of baking in a specific background. Readonly is a TypeScript contract; objects are not frozen at runtime.

### Embedding and overrides

```svelte
<script lang="ts">
  import { CodexReader, createTranslator, type ThemeConfig } from './apps/web/src/lib/reader';
  const t = createTranslator();
  let theme: ThemeConfig = { colors: { accent: '#8bc5b1' } };
</script>

<CodexReader
  apiBase="/codex/api"
  basePath="/codex"
  {t}
  {theme}
  onNavigate={(path, hash) => { /* Update the host router. */ }}
/>
```

A host can pass `siteTheme={config.theme}` from `WikiClient.config()`. Standalone automatically supplies it. Precedence is defaults → inherited instance/site theme → explicit instance override. Colors and fonts merge by known field; a font override replaces its whole stack.

Replacing the reactive `theme` prop replaces the override. Removing a property returns that property to the inherited site/default value. Missing and `undefined` fields inherit. There is no accumulated patch state. Caller objects are never mutated.

Each instance owns a `data-nox-wiki` root, custom properties and Svelte context. CSS selectors are scoped below that root; drawers, search results, rendered Markdown and graphs remain descendants. Theme updates redraw the graph without restarting its layout or resetting zoom. Multiple embedded instances can use different themes.

The standalone root covers at least the full viewport, including space around short pages and wide screens. Its layout reset is enabled only for the standalone mount; no default color/font declarations or theme custom properties are installed on `html`, `:root` or `body`. Native scrollbar gutters and overscroll belong to the document canvas: a managed stylesheet mirrors the resolved background and color scheme only on `html:has(> body > #app > [data-nox-standalone])`. It stops matching when the standalone instance unmounts. Embedded readers do not activate this rule or change the host's theme. This is CSS scoping, not Shadow DOM isolation: host CSS can still intentionally target descendants. Existing modal scroll locking is separate from theme scoping.

If an initial instance theme is invalid, initialization fails. If a later reactive override is invalid, the instance keeps its last valid theme, displays a localized error and calls optional `onThemeError(issues)`. A subsequent valid override clears that error.

## Validation

- Colors accept only trimmed `#RGB` or `#RRGGBB`, normalized to lowercase six-digit RGB. Named colors, alpha, CSS functions and variables are rejected.
- Font stacks accept comma-separated plain family names or quoted names, up to 512 input characters per role. CSS declarations, functions, comments, escapes, control characters and unquoted CSS-wide keywords are rejected.
- If the last family is not a generic family, the resolver appends `sans-serif`, `serif` or `monospace` for the corresponding role. Fonts are not downloaded; the browser uses installed/host-loaded fonts and normal fallbacks.
- Null, empty strings, wrong types and unknown keys are rejected.
- The ordinary public text color must reach 4.5:1 on the neutral surfaces where normal copy is rendered. It is rejected rather than silently changed. Derived foregrounds are adjusted when necessary.
- Validation and resolution use identical pure code on server and browser; no DOM, OS theme preference or CSS feature detection is needed.

## Resolution rules

Let B = background, S = surface, T = text, A = accent and L = link. Opaque mixing uses OKLab with hue-preserving chroma reduction for out-of-gamut colors. Wash composition uses sRGB alpha blending. Contrast is calculated on serialized RGB colors using relative luminance.

`readable(seed, backgrounds, minimum)` keeps an already readable color. Otherwise it searches the two OKLab paths toward black and white, choosing the feasible result with the smallest perceptual displacement. Results are checked after conversion to hex. A role without a feasible shared foreground raises `unresolvableContrast`.

| Public inputs | Resolved role | Derivation |
| --- | --- | --- |
| B, S, T | background, surface, text | Direct aliases |
| B, S | surfaceField | mix(B, S, 75%) |
| S, T | surfaceControl / surfaceHover | mix(S, T, 5% / 10%) |
| S, T | textMuted | readable(mix(S, T, 70%), copy placements, 4.5) |
| S, T | border | mix(S, T, 12%); decorative |
| S, T | borderControl | readable(mix(S, T, 45%), control placements, 3) |
| A | accentFill | Original accent |
| A | accentText | readable(A, brand/action placements, 4.5) |
| A | textOnAccent | Black or white, whichever contrasts more with accentFill |
| L | linkText | readable(L, reader/link placements, 4.5) |
| L, S, T | linkMuted | readable(mix(linkText, textMuted, 40%), base/surface, 4.5) |
| T | neutralWash / neutralWashHover | T at 3/255 / 8/255 alpha |
| A | accentWash | A at 18/255, 22/255, 26/255, 38/255 for subtle, selected, active, hover |
| A | accentStroke | A at 56/255 / 112/255 for normal / strong |
| B | colorScheme | Dark if white contrasts more with B; light otherwise |
| Three font stacks | fonts | Normalized stacks with generic fallback |

Contrast placements are deliberately scoped by role:

- Ordinary/muted copy: B, S, field, control, hover, neutral hover rows on B/S and the selected history row on B.
- Control boundaries: B, S, field, control and hover. These also provide graph edges on S.
- Accent text/focus: B, S, field, control, hover and accent washes on B/S. Accent fill has its own on-accent foreground.
- Primary links: B, S, field and control. Secondary links and normal graph nodes: B/S.
- Semantic text: neutral notice/field/control backgrounds and its own subtle/selected washes on B/S. Semantic indicators: B/S/field, including graph warnings.

The resolver does not require muted text to contrast with accentFill or with unrelated semantic fills. Decorative borders and translucent strokes are not promoted to essential indicators; essential focus/selection/status uses opaque readable roles.

Semantic seeds remain private: success `#a7d3b5`, warning `#c5a273`, danger `#d06d6d`, unchanged `#dcc15b`. Each resolves text at 4.5:1, indicators at 3:1, and uses the shared wash/stroke alpha scale. Diff additions/removals reuse success/danger. Scrim is internally black; overlay/shadow opacity remains a component recipe. No graph-specific public colors or component theme tokens are exposed.
