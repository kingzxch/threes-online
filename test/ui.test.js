import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('face-up UI accepts the playing status while the player's layer is up',()=>{
  assert.match(html,/if\(state\.status!==['"]playing['"]\|\|myPhase!==['"]up['"]\|\|state\.turn!==state\.players\.findIndex\(p=>p\.id===s\.id\)\)return;/);
  assert.doesNotMatch(html,/if\(state\.phase!==['"]playing['"]\|\|myPhase!==['"]up['"]\|\|state\.turn!==state\.players\.findIndex\(p=>p\.id===s\.id\)\)return;/);
});

test('face-up cards use pointer interaction and the server face-up action',()=>{
  assert.match(html,/addEventListener\('pointerup'/);
  assert.match(html,/s\.emit\('playFaceUp',\{cardId:c\.id\}\)/);
});
