import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../src/room.js';
function room(){
  const r=new Room('test',()=>{});
  r.addPlayer('one',{OPEN:1,readyState:1,send(){}},'One');
  r.state='question';r.questions=[{choices:['yes','no'],correctIndex:0}];r.questionIndex=0;r.questionStartedAt=1000;
  return r;
}
test('late answers cannot earn points while the timer callback is delayed',t=>{
  const r=room();t.mock.method(Date,'now',()=>17000);
  try{r.submitAnswer('one',0);assert.equal(r.players.get('one').answeredIndex,null);r.revealAnswer();assert.equal(r.players.get('one').score,0);}finally{r.clearTimer();}
});
test('invalid choices do not consume the single answer attempt',t=>{
  const r=room();t.mock.method(Date,'now',()=>1100);
  try{for(const choice of [-1,2,NaN,0.5])r.submitAnswer('one',choice);assert.equal(r.players.get('one').answeredIndex,null);r.submitAnswer('one',0);assert.ok(r.players.get('one').score>0);}finally{r.clearTimer();}
});
