const V={2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13,A:14};

export function value(rank){return V[rank];}

export function effectiveValue(state){
  return state.effectiveRank==null ? 0 : V[state.effectiveRank];
}

export function isPlayable(card,state){
  if(!card) return false;
  if(card.rank==="2" || card.rank==="6") return true;
  if(state.lowSeven) return V[card.rank] <= 7;
  if(card.rank==="10" && state.effectiveRank==="7") return false;
  return V[card.rank] >= effectiveValue(state);
}

export function validGroup(cards,state){
  if(!cards?.length) return {ok:false,reason:"Select a card."};
  if(!cards.every(c=>c.rank===cards[0].rank))
    return {ok:false,reason:"Multiple cards must have the same rank."};
  if(!isPlayable(cards[0],state))
    return {ok:false,reason:"That card cannot be played here."};
  return {ok:true};
}

export function applyCards(state,cards){
  const check=validGroup(cards,state);
  if(!check.ok) return check;

  state.pile.push(...cards);
  const rank=cards[0].rank;

  if(rank==="10") return {ok:true,kind:"bomb",reason:"10"};

  const last4=state.pile.slice(-4);
  if(last4.length===4 && last4.every(c=>c.rank===rank))
    return {ok:true,kind:"bomb",reason:"four-of-a-kind"};

  if(rank==="2"){
    state.effectiveRank=null;
    state.lowSeven=false;
    state.skipCount=0;
  }else if(rank==="6"){
    state.skipCount=0;
  }else{
    state.effectiveRank=rank;
    state.lowSeven=rank==="7";
    state.skipCount=rank==="8" ? cards.length : 0;
  }
  return {ok:true,kind:"played",skipCount:state.skipCount};
}

export function jumpAllowed(card,lastPlayed){
  return !!card && !!lastPlayed && card.rank===lastPlayed.rank;
}

export function nextTurn(current,count,skipCount=0){
  return (current+1+skipCount)%count;
}

export function startOrderCards(){
  return [
    ["3","black"],["4","black"],["5","black"],
    ["3","red"],["4","red"],["5","red"],
    ["7","black"],["8","black"],["9","black"],
    ["7","red"],["8","red"],["9","red"]
  ];
}

export function canStartWith(card){
  return startOrderCards().some(([rank,color])=>rank===card.rank&&color===card.color);
}
