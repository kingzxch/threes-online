import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('face-up cards use the original direct click path and normal play action',()=>{
  assert.match(html,/document\.querySelectorAll\('#face \.card'\)/);
  assert.match(html,/el\.onclick=\(\)=>setupOrPlayUp\(c\)/);
  assert.match(html,/if\(state\.phase!=='setup'\)s\.emit\('play',\{cardIds:\[c\.id\]\}\)/);
  assert.doesNotMatch(html,/playFaceUpAtIndex/);
  assert.doesNotMatch(html,/touchend/);
});

test('face-up setup handler still swaps hand and face-up cards',()=>{
  assert.match(html,/s\.emit\('swap',\{handId:setupSelected\.id,upId:c\.id\}\)/);
});
