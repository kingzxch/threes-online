import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('face-up cards are rendered as normal cards with a direct onclick handler',()=>{
  assert.ok(html.includes("document.querySelectorAll('#face .card').forEach((el,i)=>"));
  assert.ok(!html.includes('window.playFaceUpCard'));
});

test('face-up tap uses the known-working numeric index socket path',()=>{
  assert.ok(html.includes("s.emit('playFaceUp',{index})"));
  assert.ok(html.includes('const index=youNow?.up?.findIndex(x=>x.id===c.id)'));
});

test('face-up play remains separate from setup swapping',()=>{
  assert.ok(html.includes("if(state.phase==='setup'&&setupSelected){s.emit('swap',{handId:setupSelected.id,upId:c.id});setupSelected=null;return;}"));
});

test("face-up cards are highlighted only on the player's actual turn/layer",()=>{
  assert.match(html,/if\(myIndex!==state\.turn\)return false;if\(myPhase!==['"]up['"]\)return false/);
  assert.ok(html.includes("if(facePlayable(c))el.classList.add('playable')"));
});

test('face-up cards use a real click listener that calls the index action',()=>{
  assert.ok(html.includes("el.addEventListener('click',()=>playFaceUpAtIndex(i)"));
  assert.ok(html.includes("el.addEventListener('touchend',e=>{e.preventDefault();playFaceUpAtIndex(i)}"));
  assert.ok(html.includes("function playFaceUpAtIndex(index)"));
  assert.ok(html.includes("s.emit('playFaceUp',{index})"));
});
