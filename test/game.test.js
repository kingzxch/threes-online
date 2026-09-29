import test from "node:test";
import assert from "node:assert/strict";
import {newRoom,addPlayer,startGame,lockSetup,claimStart,play,playFaceUp,pickup,flipDown,jumpIn,handleDisconnectState,rematch} from "../server/game.js";
import {applyCards} from "../server/rules.js";

const C=(rank,suit="♠",color=suit==="♥"||suit==="♦"?"red":"black")=>({id:`${rank}${suit}`,rank,suit,color});
function room(players=3){const g=newRoom();for(let i=0;i<players;i++)addPlayer(g,`p${i}`,`P${i+1}`);g.status="playing";g.phase="hand";g.deck=[];return g;}

function give(g,pi,cards){g.players[pi].hand=cards;}



test("setup cannot be locked before the host starts the game",()=>{
  const g=newRoom();addPlayer(g,"p0","P1");addPlayer(g,"p1","P2");
  assert.throws(()=>lockSetup(g,0),/Setup is not open yet/);
  startGame(g,0);
  assert.equal(g.status,"setup");assert.equal(g.phase,"setup");
  assert.equal(g.players[0].hand.length,3);assert.equal(g.players[0].up.length,3);assert.equal(g.players[0].down.length,3);
});

test("starting card is actually played and can include same-rank cards",()=>{
  const g=room(2);g.phase="start";g.startClaim={rank:"3",color:"black",ids:["p0"]};
  give(g,0,[C("3","♠","black"),C("3","♥","red"),C("9")]);
  give(g,1,[C("4","♠","black")]);
  claimStart(g,0,["3♠","3♥"]);
  assert.equal(g.pile.length,2);
  assert.equal(g.players[0].hand.length,1);
  assert.equal(g.lastPlayed.rank,"3");
  assert.equal(g.turn,1);
});

test("10 bombs and lets the bomber continue",()=>{
  const g=room(2);g.pile=[C("9")];g.effectiveRank="9";give(g,0,[C("10")]);
  play(g,0,["10♠"]);
  assert.equal(g.pile.length,0);assert.equal(g.turn,0);
});

test("pickup is rejected when the player has a playable card",()=>{
  const g=room(2);g.turn=0;g.effectiveRank="5";g.pile=[C("5")];give(g,0,[C("7")]);
  assert.throws(()=>pickup(g,0),/playable card/);
  assert.equal(g.pile.length,1);
});

test("pickup resets the pile and passes the turn",()=>{
  const g=room(2);g.pile=[C("9")];g.effectiveRank="9";give(g,0,[C("4")]);
  pickup(g,0);
  assert.equal(g.pile.length,0);assert.equal(g.players[0].hand.length,2);assert.equal(g.turn,1);assert.equal(g.effectiveRank,null);
});

test("face-down unplayable card is picked up",()=>{
  const g=room(2);g.phase="down";g.turn=0;g.effectiveRank="9";g.pile=[C("9","♥")];
  g.players[0].down=[C("4")];g.players[0].hand=[];
  flipDown(g,0);
  assert.equal(g.players[0].hand.length,2);assert.equal(g.pile.length,0);assert.equal(g.turn,1);assert.equal(g.phase,"hand");
});



test("face-up play remains valid after a bomb and allows the next face-up 10",()=>{
  const g=room(2);g.deck=[];g.phase="up";g.turn=0;g.pile=[C("A")];g.effectiveRank="A";
  g.players[0].hand=[];g.players[0].up=[C("10","♠"),C("10","♥")];g.players[0].down=[C("K")];
  playFaceUp(g,0,0);
  assert.equal(g.pile.length,0);assert.equal(g.turn,0);assert.equal(g.phase,"up");
  playFaceUp(g,0,0);
  assert.equal(g.pile.length,0);assert.equal(g.players[0].up.length,0);assert.equal(g.turn,0);assert.equal(g.phase,"down");
});

test("pickup advances directly to the next player's actual phase",()=>{
  const g=room(2);g.deck=[];g.turn=0;g.phase="up";g.pile=[C("9")];g.effectiveRank="9";
  g.players[0].hand=[];g.players[0].up=[C("4")];g.players[1].hand=[];g.players[1].up=[];g.players[1].down=[C("Q")];
  pickup(g,0);
  assert.equal(g.turn,1);assert.equal(g.phase,"down");
});

test("jump-in preserves the scheduled turn",()=>{
  const g=room(3);g.turn=1;g.effectiveRank="8";g.pile=[C("8","♠")];g.lastPlayed=C("8","♠");
  give(g,2,[C("8","♥")]);
  jumpIn(g,2,["8♥"]);
  assert.equal(g.turn,1);assert.equal(g.pendingJumpSkips,1);
  assert.equal(g.pile.at(-1).rank,"8");
});

test("jump-in with a fourth matching card bombs",()=>{
  const g=room(3);g.turn=1;g.effectiveRank="7";g.pile=[C("7","♠"),C("7","♥"),C("7","♦")];g.lastPlayed=C("7","♦");
  give(g,2,[C("7","♣")]);
  jumpIn(g,2,["7♣"]);
  assert.equal(g.pile.length,0);assert.equal(g.turn,2);
});


test("jump-in is unavailable in a two-player game",()=>{
  const g=room(2);g.turn=0;g.effectiveRank="4";g.pile=[C("4")];g.lastPlayed=C("4");give(g,1,[C("4","♥")]);
  assert.throws(()=>jumpIn(g,1,["4♥"]),/3 or more players/);
});

test("two jump-in 8s stack and are resolved from the scheduled turn",()=>{
  const g=room(4);g.turn=1;g.effectiveRank="8";g.pile=[C("7"),C("8")];g.lastPlayed=C("8");
  give(g,0,[C("8","♠")]);give(g,2,[C("8","♥"),C("A")]);give(g,3,[C("8","♦"),C("K")]);
  // Scheduled player is P2. P1 and P3/P4 are allowed to race in with exact 8s.
  jumpIn(g,2,["8♥"]);
  assert.equal(g.turn,1);
  assert.equal(g.pendingJumpSkips,1);
  jumpIn(g,3,["8♦"]);
  assert.equal(g.turn,1);
  assert.equal(g.pendingJumpSkips,2);
  give(g,1,[C("9"),C("A")]);
  play(g,1,["9♠"]);
  assert.equal(g.pendingJumpSkips,0);
  assert.equal(g.turn,0);
});

test("two-player 8 returns the turn to the same player",()=>{
  const g=room(2);g.turn=0;g.effectiveRank="7";g.pile=[C("7")];g.lastPlayed=C("7");give(g,0,[C("8")]);
  play(g,0,["8♠"]);
  assert.equal(g.turn,0);
});


test("pickup clears stale jump-in state",()=>{
  const g=room(3);g.turn=0;g.effectiveRank="8";g.pile=[C("8")];g.lastPlayed=C("8");g.pendingJumpSkips=2;give(g,0,[C("4")]);
  pickup(g,0);
  assert.equal(g.lastPlayed,null);
  assert.equal(g.pendingJumpSkips,0);
});

test("face-down failure clears stale jump-in state",()=>{
  const g=room(3);g.phase="down";g.turn=0;g.effectiveRank="9";g.pile=[C("9","♥")];g.lastPlayed=C("9","♥");g.pendingJumpSkips=1;
  g.players[0].down=[C("4")];g.players[0].hand=[];
  flipDown(g,0);
  assert.equal(g.lastPlayed,null);
  assert.equal(g.pendingJumpSkips,0);
});


test("jump-in cannot change the global phase for the scheduled player",()=>{
  const g=room(3);g.deck=[];g.phase="hand";g.turn=1;g.effectiveRank="8";g.pile=[C("8")];g.lastPlayed=C("8");
  g.players[2].hand=[C("8","♥")];g.players[2].up=[C("9","♥")];g.players[2].down=[];
  jumpIn(g,2,["8♥"]);
  assert.equal(g.status,"playing");
  assert.equal(g.phase,"hand");
  assert.equal(g.turn,1);
});


test("after a face-down success, the next player uses their actual available phase",()=>{
  const g=room(2);g.deck=[];g.phase="down";g.turn=0;g.effectiveRank="4";g.pile=[C("4")];
  g.players[0].down=[C("5"),C("A")];g.players[0].hand=[];
  g.players[1].hand=[C("7")];g.players[1].up=[C("9")];g.players[1].down=[C("A")];
  flipDown(g,0);
  assert.equal(g.turn,1);
  assert.equal(g.phase,"hand");
});

test("after a face-down success, a player with no hand uses face-up cards next",()=>{
  const g=room(2);g.deck=[];g.phase="down";g.turn=0;g.effectiveRank="4";g.pile=[C("4")];
  g.players[0].down=[C("5"),C("A")];g.players[0].hand=[];
  g.players[1].hand=[];g.players[1].up=[C("9")];g.players[1].down=[C("A")];
  flipDown(g,0);
  assert.equal(g.turn,1);
  assert.equal(g.phase,"up");
});

test("face-up card plays by position when the hand is empty",()=>{
  const g=room(2);g.deck=[];g.phase="up";g.turn=0;g.pile=[C("9")];g.effectiveRank="9";
  g.players[0].hand=[];g.players[0].up=[C("J"),C("K"),C("A")];g.players[0].down=[C("Q")];
  playFaceUp(g,0,0);
  assert.equal(g.pile.at(-1).rank,"J");
  assert.equal(g.players[0].up.length,2);
  assert.equal(g.phase,"down");
  assert.equal(g.turn,1);
});

test("face-up 10 bombs a higher top card",()=>{
  const g=room(2);g.deck=[];g.phase="up";g.turn=0;g.pile=[C("A")];g.effectiveRank="A";
  g.players[0].hand=[];g.players[0].up=[C("10")];g.players[0].down=[];
  playFaceUp(g,0,0);
  assert.equal(g.pile.length,0);
  assert.equal(g.status,"finished");
});

test("bombing from face-up cards keeps the bomber's turn and advances their layer correctly",()=>{
  const g=room(2);g.deck=[];g.phase="up";g.turn=0;g.pile=[C("9")];g.effectiveRank="9";
  g.players[0].hand=[];g.players[0].up=[C("10")];g.players[0].down=[C("A")];
  play(g,0,["10♠"]);
  assert.equal(g.turn,0);
  assert.equal(g.phase,"down");
});

test("7 glass does not release the seven restriction",()=>{
  const g=room(2);g.effectiveRank="7";g.lowSeven=true;g.pile=[C("7")];g.players[0].hand=[C("6")];
  play(g,0,["6♠"]);
  assert.equal(g.effectiveRank,"7");
  assert.equal(g.lowSeven,true);
});

test("7, 6, 10 is illegal because 6 is glass",()=>{
  const g=room(2);g.effectiveRank="7";g.lowSeven=true;g.pile=[C("7")];g.players[0].hand=[C("10")];
  assert.throws(()=>play(g,0,["10♠"]),/cannot be played/);
});

test("7, 2, 10 allows the next player to bomb after reset",()=>{
  const g=room(2);g.effectiveRank="7";g.lowSeven=true;g.pile=[C("7")];g.players[0].hand=[C("2")];g.players[0].up=[C("A")];g.players[1].hand=[C("10")];
  play(g,0,["2♠"]);
  assert.equal(g.effectiveRank,null);
  assert.equal(g.turn,1);
  play(g,1,["10♠"]);
  assert.equal(g.pile.length,0);
  assert.equal(g.turn,1);
});

test("8, 6, 8 preserves the 8 restriction and the second 8 adds its skip",()=>{
  const g={effectiveRank:"4",lowSeven:false,pile:[C("4")],skipCount:0};
  let r=applyCards(g,[C("8","♠")]);
  assert.equal(r.skipCount,1);assert.equal(g.effectiveRank,"8");
  r=applyCards(g,[C("6","♠")]);
  assert.equal(g.effectiveRank,"8");assert.equal(r.skipCount,0);
  r=applyCards(g,[C("8","♥")]);
  assert.equal(r.skipCount,1);assert.equal(g.effectiveRank,"8");
});


test("bomb clears last-played so an empty pile cannot be jump-in target",()=>{
  const g=room(3);g.turn=0;g.effectiveRank="9";g.pile=[C("9")];give(g,0,[C("10"),C("4")]);give(g,1,[C("10","♥")]);
  play(g,0,["10♠"]);
  assert.equal(g.pile.length,0);
  assert.equal(g.lastPlayed,null);
  assert.throws(()=>jumpIn(g,1,["10♥"]),/Only the exact card just played/);
});

test("four-of-a-kind bomb also leaves no jump-in target",()=>{
  const g=room(3);g.turn=0;g.effectiveRank="6";g.pile=[C("7","♠"),C("7","♥"),C("7","♦")];give(g,0,[C("7","♣")]);give(g,1,[C("7","♠")]);
  play(g,0,["7♣"]);
  assert.equal(g.pile.length,0);
  assert.equal(g.lastPlayed,null);
});


test("disconnecting active player advances to the next connected player",()=>{
  const g=room(3);g.turn=0;g.phase="hand";g.players[0].connected=false;g.players[1].hand=[C("4")];
  handleDisconnectState(g,0);
  assert.equal(g.turn,1);
  assert.equal(g.phase,"hand");
});

test("disconnect skips over another disconnected player",()=>{
  const g=room(4);g.turn=0;g.phase="hand";g.players[0].connected=false;g.players[1].connected=false;
  handleDisconnectState(g,0);
  assert.equal(g.turn,2);
});


test("host can reset a finished game for a rematch",()=>{
  const g=room(2);g.status="finished";g.phase="finished";g.winner=0;g.hostId="p0";
  g.players[0].hand=[C("A")];g.players[0].up=[C("K")];g.players[0].down=[C("Q")];
  rematch(g,0);
  assert.equal(g.status,"setup");assert.equal(g.phase,"setup");assert.equal(g.winner,null);
  assert.equal(g.players[0].hand.length,0);assert.equal(g.players[1].setupDone,false);
});


test("two-player 8 plus 8 keeps the turn with the same player",()=>{
  const g=room(2);g.turn=0;g.effectiveRank="7";g.pile=[C("7")];g.lastPlayed=C("7");give(g,0,[C("8","♠"),C("8","♥")]);
  play(g,0,["8♠","8♥"]);
  assert.equal(g.turn,0);
});

test("face-up card can be played from the player's actual layer even if global phase is stale",()=>{
  const g=room(2);g.deck=[];g.phase="hand";g.turn=0;g.effectiveRank="4";g.pile=[C("4")];
  g.players[0].hand=[];g.players[0].up=[C("5")];g.players[0].down=[C("A")];
  play(g,0,["5♠"]);
  assert.equal(g.players[0].up.length,0);
  assert.equal(g.pile.at(-1).rank,"5");
  assert.equal(g.turn,1);
});

test("10 bombs from face-up cards on a high rank",()=>{
  const g=room(2);g.deck=[];g.phase="up";g.turn=0;g.effectiveRank="A";g.pile=[C("A")];
  g.players[0].hand=[];g.players[0].up=[C("10")];g.players[0].down=[C("K")];
  play(g,0,["10♠"]);
  assert.equal(g.pile.length,0);
  assert.equal(g.turn,0);
});
