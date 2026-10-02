import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultTheme, mergeThemeConfigs, resolveTheme, resolveThemeLayers, validateTheme, themeStyle, ThemeValidationError, type ThemeConfig } from '../packages/theme';
import { standaloneCanvasStyle } from '../packages/theme/css';
import { contrast, composite, mix } from '../packages/theme/color';

const light: ThemeConfig = {
  colors:{background:'#f5f6f8',surface:'#ffffff',text:'#20242b',accent:'#8c6a32',link:'#315f96'},
  fonts:{body:'system-ui, sans-serif',display:'Georgia, serif',mono:'ui-monospace, Consolas, monospace'}
};
test('defaults are deterministic, copy their inputs, and keep readonly a TypeScript contract', () => {
  const a=resolveTheme(); const b=resolveTheme({});
  assert.deepEqual(a,b); assert.equal(a.colors.background,defaultTheme.colors.background);
  assert.equal(a.colorScheme,'dark'); assert.equal(a.colors.accentFill,defaultTheme.colors.accent);
  assert.deepEqual(resolveThemeLayers(defaultTheme).resolved,a);
  assert.deepEqual(resolveThemeLayers(mergeThemeConfigs({})).resolved,a);
  assert.notEqual(a.fonts,defaultTheme.fonts); assert.equal(Object.isFrozen(a),false);
  assert.equal(a.colors.surfaceField,mix(defaultTheme.colors.background,defaultTheme.colors.surface,.75));
});
test('resolved colors and nested tones are readonly at the TypeScript boundary', () => {
  const resolved=resolveTheme();
  if (false) {
    // @ts-expect-error Public consumers cannot assign to resolved colors.
    resolved.colors.text='#ffffff';
    // @ts-expect-error The readonly contract includes nested wash colors.
    resolved.semantic.danger.wash.subtle.alpha=.5;
    // @ts-expect-error Resolved font roles are readonly too.
    resolved.fonts.body='Arial';
  }
});
test('partial layers merge individual known fields and replacing an override resets omitted fields', () => {
  const site: ThemeConfig={colors:{link:'#acdaff'},fonts:{display:'Georgia'}};
  const override: ThemeConfig={colors:{accent:'#8bc5b1'},fonts:{body:'Arial'}};
  const before=JSON.stringify({site,override});
  const a=resolveThemeLayers(site,override);
  assert.equal(a.config.colors.accent,'#8bc5b1'); assert.equal(a.config.colors.link,'#acdaff');
  assert.equal(a.config.fonts.display,'Georgia, serif'); assert.equal(a.config.fonts.body,'Arial, sans-serif');
  const b=resolveThemeLayers(site,{});
  assert.equal(b.config.colors.accent,defaultTheme.colors.accent); assert.equal(b.config.fonts.body,defaultTheme.fonts.body);
  assert.equal(JSON.stringify({site,override}),before);
});
test('validation canonicalizes opaque hex and font stacks consistently without CSS or DOM APIs', () => {
  const result=validateTheme({colors:{accent:' #AbC '},fonts:{body:'"A Font", Arial',mono:'Consolas',display:'system-ui'}});
  assert.equal(result.ok,true); if(!result.ok)return;
  assert.equal(result.config.colors.accent,'#aabbcc');
  assert.equal(result.config.fonts.body,'"A Font", Arial, sans-serif');
  assert.equal(result.config.fonts.mono,'Consolas, monospace');
  assert.equal(result.config.fonts.display,'system-ui');
  assert.equal(mergeThemeConfigs({colors:{accent:undefined}}).colors.accent,defaultTheme.colors.accent);
});
test('invalid, unknown and injectable fields are rejected with typed issue paths', () => {
  for(const input of [null,[],{radius:4},new Date(),{colors:null},{colors:{accent:null}},{colors:{foo:'#abc'}},
    ...['','#abcd','#11223344','red','var(--accent)','rgb(1 2 3)'].map(accent=>({colors:{accent}})),
    ...['','inherit','Arial; color:red','var(--font)','Arial /* hi */','Arial,','Arial,,serif','-','--','Arial, -','\nArial','Arial\n',' '.repeat(512)+'Arial','A\\B','A\nB','a'.repeat(513)].map(body=>({fonts:{body}})),
    {fonts:{extra:'Arial'}}]) {
    const result=validateTheme(input); assert.equal(result.ok,false,JSON.stringify(input));
  }
  assert.throws(()=>resolveTheme({colors:{accent:'red'}} as unknown as ThemeConfig),ThemeValidationError);
  const bad=validateTheme({colors:{text:'#15181c'}});
  assert.equal(bad.ok,false); if(!bad.ok)assert.deepEqual(bad.issues,[{path:'colors.text',code:'insufficientContrast'}]);
});
test('dark and light roles satisfy contrast on their actual placements, including composited washes', () => {
  for(const input of [{},light,{colors:{accent:'#ffffff',link:'#111111'}}] satisfies ThemeConfig[]) {
    const theme=resolveTheme(input); const c=theme.colors;
    const neutral=[c.background,c.surface,c.surfaceField,c.surfaceControl,c.surfaceHover];
    for(const bg of neutral) { assert.ok(contrast(c.text,bg)>=4.5);assert.ok(contrast(c.textMuted,bg)>=4.5);assert.ok(contrast(c.borderControl,bg)>=3); }
    for(const bg of [c.background,c.surface]) {
      for(const wash of Object.values(theme.accentWash)) assert.ok(contrast(c.accentText,composite(wash,bg))>=4.5);
      for(const wash of [theme.neutralWash,theme.neutralWashHover]) assert.ok(contrast(c.textMuted,composite(wash,bg))>=4.5);
      for(const tone of Object.values(theme.semantic)) {
        assert.ok(contrast(tone.indicator,bg)>=3);
        for(const wash of [tone.wash.subtle,tone.wash.selected]) assert.ok(contrast(tone.text,composite(wash,bg))>=4.5);
      }
    }
    assert.ok(contrast(c.textOnAccent,c.accentFill)>=4.5);
    assert.ok(contrast(c.linkText,c.surfaceField)>=4.5);
    assert.ok(contrast(c.linkMuted,c.surface)>=4.5);
  }
  assert.equal(resolveTheme(light).colorScheme,'light');
});
test('brand fill is not treated as a background for unrelated text roles', () => {
  const theme=resolveTheme({colors:{accent:'#e7e6e2'}});
  // Text uses its own onAccent role here. Requiring ordinary text on accentFill would reject this valid theme.
  assert.equal(contrast(theme.colors.text,theme.colors.accentFill),1);
  assert.ok(contrast(theme.colors.textOnAccent,theme.colors.accentFill)>=4.5);
  assert.equal(theme.accentWash.selected.color,'#e7e6e2');
  assert.equal(theme.accentWash.selected.alpha,22/255);
});
test('a mixed light/dark set of ordinary text surfaces is invalid, while accent/link can be adjusted', () => {
  assert.equal(validateTheme({colors:{background:'#000000',surface:'#ffffff'}}).ok,false);
  const theme=resolveTheme({colors:{accent:'#101214',link:'#15181c'}});
  assert.equal(theme.colors.accentFill,'#101214');
  assert.notEqual(theme.colors.accentText,theme.colors.accentFill);
  assert.notEqual(theme.colors.linkText,'#15181c');
});
test('CSS serialization is instance-ready and shares resolved roles with Canvas', () => {
  const theme=resolveTheme(light); const css=themeStyle(theme);
  assert.ok(css.includes('--nox-link-muted:'+theme.colors.linkMuted));
  assert.ok(css.includes('--nox-warning-indicator:'+theme.semantic.warning.indicator));
  assert.ok(css.includes('--nox-accent-wash-selected:rgb(140 106 50 / '+22/255+')'));
  assert.ok(css.includes('color-scheme:light'));
  assert.ok(!css.includes(':root')); assert.ok(!css.includes('undefined'));
});

test('standalone canvas matches the theme only while the standalone root is present', () => {
  const theme=resolveTheme(light);const css=standaloneCanvasStyle(theme);
  assert.match(css,/^html:has\(> body > #app > \[data-nox-standalone\]\)/);
  assert.ok(css.includes('background-color:'+theme.colors.background));
  assert.ok(css.includes('color-scheme:light'));
  assert.ok(!css.includes('--nox-'));assert.ok(!css.includes('font-family'));
});
