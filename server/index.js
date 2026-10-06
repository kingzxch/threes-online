import express from "express";
import http from "node:http";
import {Server} from "socket.io";
import {newRoom,addPlayer,rebindPlayer,startGame,swap,lockSetup,claimStart,play,playFaceUp,pickup,flipDown,jumpIn,rematch,publicState,handleDisconnectState} from "./game.js";

const app=express();const server=http.createServer(app);const io=new Server(server,{cors:{origin:"*"}});
app.use(express.static("public"));
app.get("/health",(_,res)=>res.json({ok:true,game:"threes"}));
const rooms=new Map();const sockets=new Map();const RECONNECT_GRACE_MS=5*60*1000;

function roomFor(socket){const x=sockets.get(socket.id);if(!x)throw Error("Not in a room.");const g=rooms.get(x.roomId);if(!g)throw Error("Room no longer exists.");return g;}

function emitState(g,socketId=null){
  for(const p of g.players){const s=io.sockets.sockets.get(p.id);if(s)s.emit("state",publicState(g,g.players.findIndex(x=>x===p)));}
}

function issuePlayer(g,socket,player){
  player.id=socket.id;player.connected=true;
  if(player.disconnectTimer){clearTimeout(player.disconnectTimer);player.disconnectTimer=null;}
  sockets.set(socket.id,{roomId:g.id,playerIndex:g.players.findIndex(p=>p===player),reconnectToken:player.reconnectToken});
  socket.join(g.id);
  socket.emit("session",{roomId:g.id,reconnectToken:player.reconnectToken});
  emitState(g);
}

function emitRoom(g){for(const p of g.players){const s=io.sockets.sockets.get(p.id);if(s)s.emit("state",publicState(g,g.players.findIndex(x=>x.id===p.id)));}}

function action(socket,fn){
  try{const g=roomFor(socket);const playerIndex=g.players.findIndex(p=>p.id===socket.id);if(playerIndex<0)throw Error("You are no longer in this room.");if(g.players[playerIndex].connected===false)throw Error("Reconnect before playing.");fn(g,playerIndex);emitRoom(g);}
  catch(e){socket.emit("errorMessage",e.message);}
}

io.on("connection",socket=>{
  socket.on("create",({name},cb)=>{
    const g=newRoom();rooms.set(g.id,g);const pi=addPlayer(g,socket.id,name);const p=g.players[pi];sockets.set(socket.id,{roomId:g.id,playerIndex:pi,reconnectToken:p.reconnectToken});socket.join(g.id);cb({roomId:g.id,reconnectToken:p.reconnectToken});socket.emit("session",{roomId:g.id,reconnectToken:p.reconnectToken});emitRoom(g);
  });
  socket.on("join",({roomId,name},cb)=>{
    try{const g=rooms.get(String(roomId||"").toUpperCase());if(!g)throw Error("Room not found.");
      const pi=addPlayer(g,socket.id,name);const p=g.players[pi];sockets.set(socket.id,{roomId:g.id,playerIndex:pi,reconnectToken:p.reconnectToken});socket.join(g.id);cb({ok:true,reconnectToken:p.reconnectToken});socket.emit("session",{roomId:g.id,reconnectToken:p.reconnectToken});emitRoom(g);
    }catch(e){cb({ok:false,error:e.message});}
  });
  socket.on("reconnectRoom",({roomId,reconnectToken},cb)=>{
    try{
      const g=rooms.get(String(roomId||"").toUpperCase());
      if(!g)throw Error("Room not found or expired.");
      const player=g.players.find(p=>p.reconnectToken===String(reconnectToken||""));
      if(!player)throw Error("Reconnect session not found.");
      const oldId=player.id;
      const oldSocket=io.sockets.sockets.get(oldId);
      if(oldSocket && oldId!==socket.id) oldSocket.disconnect(true);
      rebindPlayer(g,player,socket.id);
      if(player.disconnectTimer){clearTimeout(player.disconnectTimer);player.disconnectTimer=null;}
      sockets.set(socket.id,{roomId:g.id,playerIndex:g.players.findIndex(p=>p===player),reconnectToken:player.reconnectToken});
      socket.join(g.id);
      cb({ok:true,roomId:g.id,name:player.name,reconnectToken:player.reconnectToken});
      emitRoom(g);
    }catch(e){cb({ok:false,error:e.message});}
  });
  socket.on("start",()=>action(socket,(g,i)=>startGame(g,i)));
  socket.on("swap",({handId,upId})=>action(socket,(g,i)=>swap(g,i,handId,upId)));
  socket.on("lockSetup",()=>action(socket,(g,i)=>lockSetup(g,i)));
  socket.on("claimStart",({cardIds,cardId})=>action(socket,(g,i)=>claimStart(g,i,cardIds||[cardId])));
  socket.on("play",({cardIds})=>action(socket,(g,i)=>play(g,i,cardIds)));
  socket.on("playFaceUp",({cardId,index})=>action(socket,(g,i)=>playFaceUp(g,i,cardId ?? index)));
  socket.on("pickup",()=>action(socket,(g,i)=>pickup(g,i)));
  socket.on("flipDown",()=>action(socket,(g,i)=>flipDown(g,i)));
  socket.on("jumpIn",({cardIds})=>action(socket,(g,i)=>jumpIn(g,i,cardIds)));
  socket.on("rematch",()=>action(socket,(g,i)=>rematch(g,i)));
  socket.on("disconnect",()=>{
    const info=sockets.get(socket.id);if(!info)return;
    const g=rooms.get(info.roomId);sockets.delete(socket.id);
    if(!g)return;
    const player=g.players.find(p=>p.id===socket.id);
    if(!player)return;
    player.connected=false;
    const oldIndex=g.players.findIndex(p=>p===player);
    const wasTurn=g.status==="playing"&&g.turn===oldIndex;
    if(g.hostId===player.id)g.hostId=g.players.find(p=>p.connected)?.id||g.hostId;
    if(wasTurn){
      handleDisconnectState(g,oldIndex);
    }
    player.disconnectTimer=setTimeout(()=>{
      const current=rooms.get(g.id);
      if(!current)return;
      const idx=current.players.findIndex(p=>p===player);
      if(idx<0 || player.connected) return;
      const wasTurn=current.status==="playing"&&current.turn===idx;
      current.players.splice(idx,1);
      if(!current.players.length){rooms.delete(current.id);return;}
      if(current.hostId===player.id)current.hostId=current.players.find(p=>p.connected)?.id||current.players[0].id;
      if(current.status==="playing"){
        if(wasTurn)current.turn=current.turn%current.players.length;
        else if(current.turn>idx)current.turn-=1;
        if(current.turn<0)current.turn=0;
      }
      emitRoom(current);
    },RECONNECT_GRACE_MS);
    emitRoom(g);
  });
});
const port=process.env.PORT||3000;server.listen(port,()=>console.log(`THREES running on ${port}`));
