import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../src/room.js';
const socket = () => ({OPEN:1,readyState:1,send(){}});
test('remaining ready players start when the unready player leaves',()=>{
 const room=new Room('test',()=>{});
 try {
  room.addPlayer('ready',socket(),'Ready');room.addPlayer('waiting',socket(),'Waiting');
  room.setReady('ready',true);assert.equal(room.state,'lobby');
  room.removePlayer('waiting');assert.equal(room.state,'countdown');assert.ok(room.timer);
 } finally {room.clearTimer();}
});
test('removing the last player cleans up without starting a game',()=>{
 let emptied=false;const room=new Room('test',()=>{emptied=true;});
 room.addPlayer('one',socket(),'One');room.removePlayer('one');
 assert.equal(emptied,true);assert.equal(room.timer,null);assert.equal(room.state,'lobby');
});
