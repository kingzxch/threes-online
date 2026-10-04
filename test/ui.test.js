import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test("face-up UI checks playing status and the player's actual up layer",()=>{
  assert.match(html,/state\.status!==['\"]playing['\"]\|\|myPhase!==['\"]up['\"]\|\|state\.turn!==myIndexNow/);
  assert.doesNotMatch(html,/state\.phase!==['\"]playing['\"]\|\|myPhase!==['\"]up['\"]\|\|state\.turn/);
});

test('face-up cards have iPhone touch, pointer and click fallbacks',()=>{
  assert.match(html,/addEventListener\('touchend',fire/);
  assert.match(html,/addEventListener\('pointerup',e=>\{if\(e\.pointerType!==['\"]touch['\"]\)fire\(e\);\}/);
  assert.match(html,/addEventListener\('click',e=>fire\(e\)/);
  assert.match(html,/s\.emit\('playFaceUp',\{cardId:c\.id\}\)/);
});

test('face-up interaction prevents duplicate touch-plus-click submissions',()=>{
  assert.match(html,/now-firedAt<450/);
});
