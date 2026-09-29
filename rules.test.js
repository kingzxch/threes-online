import test from "node:test";
import assert from "node:assert/strict";
import {isPlayable,applyCards,jumpAllowed,nextTurn} from "../server/rules.js";
const C=(rank,suit="♠",color=suit==="♥"||suit==="♦"?"red":"black")=>({id:rank+suit,rank,suit,color});

test("equal and higher cards are legal",()=>{
  const s={effectiveRank:"8",lowSeven:false};
  assert.equal(isPlayable(C("8"),s),true);assert.equal(isPlayable(C("9"),s),true);assert.equal(isPlayable(C("7"),s),false);
});
test("6 is glass",()=>assert.equal(isPlayable(C("6"),{effectiveRank:"A",lowSeven:false}),true));
test("7 means seven or below",()=>{
  const s={effectiveRank:null,lowSeven:false,pile:[],skipCount:0};applyCards(s,[C("7")]);
  assert.equal(isPlayable(C("6"),s),true);assert.equal(isPlayable(C("8"),s),false);
});
test("2 resets",()=>{
  const s={effectiveRank:"7",lowSeven:true,pile:[],skipCount:2};applyCards(s,[C("2")]);
  assert.equal(s.effectiveRank,null);assert.equal(s.lowSeven,false);
});
test("10 cannot be played on effective 7",()=>assert.equal(isPlayable(C("10"),{effectiveRank:"7",lowSeven:true}),false));
test("four of a kind bombs",()=>{
  const s={effectiveRank:"8",lowSeven:false,pile:[C("9","♠"),C("9","♥"),C("9","♦")],skipCount:0};
  const r=applyCards(s,[C("9","♣")]);assert.equal(r.kind,"bomb");
});
test("jump in only matches exact rank",()=>{
  assert.equal(jumpAllowed(C("9"),C("9","♥")),true);assert.equal(jumpAllowed(C("6"),C("9","♥")),false);
});
test("skip math",()=>assert.equal(nextTurn(0,4,2),3));
