import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('face-up UI highlights cards only when it is the player\'s actual up turn',()=>{
  assert.match(html,/if\(myIndex!==state\.turn\)return false;if\(myPhase!==['"]up['"]\)return false/);
});

test('face-up cards use the known-working direct click path',()=>{
  assert.ok(html.includes("querySelectorAll('#face .card')"));
  assert.match(html,/el\.onclick=\(\)=>setupOrPlayUp\(c\)/);
  assert.ok(html.includes("s.emit('playFaceUp',{index:youNow.up.findIndex(x=>x.id===c.id)})"));
});

test('face-up action does not require a separate iPhone-specific event layer',()=>{
  assert.doesNotMatch(html,/addEventListener\(['"]touchend/);
  assert.doesNotMatch(html,/function bindFaceUpCard/);
  assert.doesNotMatch(html,/face-card/);
});

test('face-up interaction keeps setup swaps separate from playing',()=>{
  assert.match(html,/if\(state\.phase===['"]setup['"]&&setupSelected\)\{s\.emit\(['"]swap['"]/);
  assert.match(html,/if\(myPhase===['"]up['"]\)s\.emit\(['"]playFaceUp['"]/);
});
