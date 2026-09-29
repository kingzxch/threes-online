import {randomBytes} from "node:crypto";
import {applyCards,isPlayable,jumpAllowed,nextTurn,startOrderCards} from "./rules.js";

const suits=[["♠","black"],["♥","red"],["♦","red"],["♣","black"]];
const ranks=["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

function makeDeck(){
  const d=[];
  for(const [s,color] of suits) for(const rank of ranks)
    d.push({id:randomBytes(6).toString("hex"),rank,suit:s,color});
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}
  return d;
}

export function newRoom(){
  return {
    id:randomBytes(3).toString("hex").toUpperCase(),
    status:"waiting",
    players:[],
    deck:[],
    pile:[],
    effectiveRank:null,
    lowSeven:false,
    skipCount:0,
    pendingJumpSkips:0,
    turn:0,
    phase:"setup",
    lastPlayed:null,
    setupLocked:false,
    startClaimed:false,
    events:[],
    winner:null,
    hostId:null
  };
}

function publicPlayer(p,i){return {id:p.id,name:p.name,index:i,total:p.hand.length+p.up.length+p.down.length,connected:p.connected!==false};}

export function publicState(g,viewer){
  return {
    room:g.id,status:g.status,phase:g.phase,turn:g.turn,hostId:g.hostId,
    effectiveRank:g.effectiveRank,lowSeven:g.lowSeven,
    pendingJumpSkips:g.pendingJumpSkips||0,
    startClaim:g.startClaim||null,
    pile:g.pile.map(c=>({rank:c.rank,suit:c.suit,color:c.color})),
    lastPlayed:g.lastPlayed?{rank:g.lastPlayed.rank,suit:g.lastPlayed.suit,color:g.lastPlayed.color}:null,
    players:g.players.map(publicPlayer),
    you:g.players[viewer]?{
      hand:g.players[viewer].hand,
      up:g.players[viewer].up,
      downCount:g.players[viewer].down.length
    }:null,
    event:g.events.at(-1)||null,
    winner:g.winner
  };
}

function log(g,text){g.events.push({text,at:Date.now()});if(g.events.length>30)g.events.shift();}

export function addPlayer(g,id,name){
  if(g.status!=="waiting") throw Error("Game already started.");
  if(g.players.length>=4) throw Error("Room is full.");
  const clean=(name||"Player").trim().slice(0,18)||"Player";
  g.players.push({id,name:clean,reconnectToken:randomBytes(18).toString("hex"),connected:true,hand:[],up:[],down:[],setupDone:false});
  if(!g.hostId)g.hostId=id;
  return g.players.length-1;
}

function deal(g){
  g.deck=makeDeck();
  for(const p of g.players){
    for(let i=0;i<3;i++)p.down.push(g.deck.pop());
    for(let i=0;i<3;i++)p.up.push(g.deck.pop());
    for(let i=0;i<3;i++)p.hand.push(g.deck.pop());
  }
}

export function startGame(g,pi){
  if(g.status!=="waiting") throw Error("The game has already started.");
  if(g.players[pi]?.id!==g.hostId) throw Error("Only the room host can start the game.");
  if(g.players.length<2) throw Error("Need at least 2 players.");
  if(g.players.some(p=>p.connected===false)) throw Error("Everyone needs to be connected before starting.");
  deal(g);g.status="setup";g.phase="setup";
  log(g,"Cards dealt. Swap your hand with your face-up cards, then lock setup.");
}

export function swap(g,pi,handId,upId){
  if(g.status!=="setup")throw Error("Setup is closed.");
  const p=g.players[pi];const h=p.hand.findIndex(c=>c.id===handId),u=p.up.findIndex(c=>c.id===upId);
  if(h<0||u<0)throw Error("Card not found.");
  [p.hand[h],p.up[u]]=[p.up[u],p.hand[h]];
}

export function lockSetup(g,pi){
  const p=g.players[pi];p.setupDone=true;
  if(g.players.every(x=>x.setupDone)) begin(g);
}

function begin(g){
  g.status="playing";g.phase="hand";
  const order=startOrderCards();let chosen=null;
  for(const [rank,color] of order){
    const candidates=g.players.filter(p=>p.hand.some(c=>c.rank===rank&&c.color===color));
    if(candidates.length){chosen={rank,color,ids:candidates.map(p=>p.id)};break;}
  }
  if(chosen){
    // Deterministic online resolution: first player to claim the matching start card wins.
    g.startClaim=chosen;g.startClaimed=false;g.phase="start";
    log(g,`Starting card: ${chosen.color} ${chosen.rank}.`);
  }else{g.turn=0;g.phase="hand";log(g,"No starting card matched; first player starts.");}
}

export function claimStart(g,pi,cardIds){
  if(g.phase!=="start")throw Error("Starting card is not being claimed.");
  const p=g.players[pi];
  if(p?.connected===false) throw Error("Reconnect before claiming the starting card.");
  if(g.startClaimed)throw Error("Start already claimed.");
  if(!Array.isArray(cardIds)||!cardIds.length)throw Error("Choose your starting card.");
  if(!g.startClaim.ids.includes(p.id))throw Error("You don't hold the starting card.");

  const cards=cardIds.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean);
  if(cards.length!==cardIds.length)throw Error("Card not found.");
  if(!cards.every(c=>c.rank===g.startClaim.rank))throw Error("Your opening cards must have the same rank.");
  if(!cards.some(c=>c.rank===g.startClaim.rank&&c.color===g.startClaim.color))
    throw Error("You must play the actual starting card.");

  // The first player does not merely claim the starter: the opening card(s)
  // are actually played, just as in the physical game. Online, the server's
  // receipt order resolves the race between eligible players.
  const result=applyCards(g,cards);
  if(!result.ok)throw Error(result.reason);
  for(const c of cards)p.hand.splice(p.hand.findIndex(x=>x.id===c.id),1);
  g.startClaimed=true;
  g.lastPlayed=cards.at(-1);
  log(g,`${p.name} started with ${cards.map(c=>c.rank).join(" + ")}.`);

  if(result.kind==="bomb"){
    g.pile=[];g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.lastPlayed=null;
    g.turn=pi;
    draw3(g,p);
    if(finishCheck(g,pi))return;
    g.phase=phaseForPlayer(g,pi);
    return;
  }

  draw3(g,p);
  if(finishCheck(g,pi))return;
  g.turn=nextTurn(pi,g.players.length,result.skipCount||0);
  g.phase=phaseForPlayer(g,g.turn);
}

function draw3(g,p){while(g.deck.length&&p.hand.length<3)p.hand.push(g.deck.pop());}

function phaseForPlayer(g,pi){
  const p=g.players[pi];
  if(!p) return "hand";
  if(g.deck.length>0 || p.hand.length>0) return "hand";
  if(p.up.length>0) return "up";
  return "down";
}

function finishCheck(g,pi){
  const p=g.players[pi];
  if(p.hand.length===0&&p.up.length===0&&p.down.length===0){g.winner=pi;g.status="finished";g.phase="finished";log(g,`${p.name} wins!`);return true;}
  if(g.deck.length===0&&p.hand.length===0)g.phase=p.up.length?"up":"down";
  return false;
}

export function play(g,pi,cardIds){
  if(!Array.isArray(cardIds)||!cardIds.length)throw Error("Choose at least one card.");
  if(g.status!=="playing")throw Error("Game is not active.");
  if(g.turn!==pi)throw Error("Not your turn.");
  if(!["hand","up"].includes(g.phase))throw Error("Use the face-down action.");
  const p=g.players[pi];
  const source=g.phase==="hand"?p.hand:p.up;
  const cards=cardIds.map(id=>source.find(c=>c.id===id)).filter(Boolean);
  if(cards.length!==cardIds.length)throw Error("Card not found.");
  if(g.phase==="up"&&cards.length>1)throw Error("Face-up cards are played one at a time.");
  const result=applyCards(g,cards);if(!result.ok)throw Error(result.reason);
  for(const c of cards)source.splice(source.findIndex(x=>x.id===c.id),1);
  g.lastPlayed=cards.at(-1);log(g,`${p.name} played ${cards.map(c=>c.rank).join(" + ")}.`);
  if(result.kind==="bomb"){
    g.pile=[];g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.lastPlayed=null;g.turn=pi;
    draw3(g,p);if(finishCheck(g,pi))return;g.phase=phaseForPlayer(g,pi);return;
  }
  draw3(g,p);if(finishCheck(g,pi))return;
  const skips=(result.skipCount||0)+g.pendingJumpSkips;
  g.pendingJumpSkips=0;
  g.turn=nextTurn(pi,g.players.length,skips);g.phase=phaseForPlayer(g,g.turn);
}

export function pickup(g,pi){
  if(g.turn!==pi)throw Error("Not your turn.");
  if(!g.pile.length)throw Error("Pile is empty.");
  const p=g.players[pi];p.hand.push(...g.pile);g.pile=[];g.lastPlayed=null;g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.pendingJumpSkips=0;
  log(g,`${p.name} picked up the pile.`);
  g.turn=nextTurn(pi,g.players.length,0);g.phase="hand";
}

export function flipDown(g,pi){
  if(g.turn!==pi||g.phase!=="down")throw Error("Not your face-down turn.");
  const p=g.players[pi];if(!p.down.length){finishCheck(g,pi);return;}
  const c=p.down.shift();g.lastPlayed=c;log(g,`${p.name} flipped a ${c.rank}${c.suit}.`);
  if(!isPlayable(c,g)){
    p.hand.push(c,...g.pile);g.pile=[];g.lastPlayed=null;g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.pendingJumpSkips=0;
    g.turn=nextTurn(pi,g.players.length,0);g.phase="hand";return;
  }
  const result=applyCards(g,[c]);
  if(result.kind==="bomb"){g.pile=[];g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.turn=pi;}
  else {g.turn=nextTurn(pi,g.players.length,result.skipCount||0);}
  if(finishCheck(g,pi))return;
  g.phase=phaseForPlayer(g,g.turn);
}

export function handleDisconnectState(g,pi){
  if(!g.players[pi]) return;
  if(g.status!=="playing" || g.turn!==pi) return;
  const n=g.players.length;
  if(n<=1) return;
  for(let step=1;step<=n;step++){
    const candidate=(pi+step)%n;
    if(g.players[candidate]?.connected!==false){
      g.turn=candidate;
      g.phase=phaseForPlayer(g,candidate);
      log(g,`${g.players[pi].name} disconnected; turn moved on.`);
      return;
    }
  }
}

export function jumpIn(g,pi,cardIds){
  if(!Array.isArray(cardIds)||!cardIds.length)throw Error("Choose at least one card to jump in.");
  if(g.status!=="playing")throw Error("Game is not active.");
  if(g.players.length<3)throw Error("Jump-in is only available with 3 or more players.");
  const p=g.players[pi];const cards=cardIds.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean);
  if(!cards.length||!cards.every(c=>c.rank===cards[0].rank))throw Error("Jump-in cards must match.");
  if(!jumpAllowed(cards[0],g.lastPlayed))throw Error("Only the exact card just played can jump in.");
  const result=applyCards(g,cards);if(!result.ok)throw Error(result.reason);
  for(const c of cards)p.hand.splice(p.hand.findIndex(x=>x.id===c.id),1);
  g.lastPlayed=cards.at(-1);log(g,`${p.name} jumped in with ${cards.map(c=>c.rank).join(" + ")}.`);
  if(result.kind==="bomb"){g.pile=[];g.effectiveRank=null;g.lowSeven=false;g.skipCount=0;g.lastPlayed=null;g.turn=pi;draw3(g,p);if(finishCheck(g,pi))return;g.phase=phaseForPlayer(g,pi);return;}
  draw3(g,p);
  // A jump-in does not steal the scheduled turn. Its power effect (especially 8)
  // is added to the pile state, and the normal turn owner remains the scheduled player.
  if(result.skipCount)g.pendingJumpSkips=(g.pendingJumpSkips||0)+result.skipCount;
  // A jump-in never changes the scheduled turn, so do not advance the global
  // phase based on the jumper's private card count. Only a true win ends here.
  const jumper=g.players[pi];
  if(jumper.hand.length===0&&jumper.up.length===0&&jumper.down.length===0){
    g.winner=pi;g.status="finished";g.phase="finished";log(g,`${jumper.name} wins!`);
  }
}
