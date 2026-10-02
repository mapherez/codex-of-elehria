import test from 'node:test';
import assert from 'node:assert/strict';
import { ForceLayout } from '../apps/web/src/lib/relationships/force-layout';
import type { LayoutFrame, LayoutRequest } from '../apps/web/src/lib/relationships/graph-types';

function request(run = 1, animate = true): LayoutRequest {
  return { type: 'layout', run, animate, centerId: 'center',
    points: [
      {id:'center',name:'Center',incoming:0,radius:7,x:0,y:0},
      {id:'a',name:'A',incoming:1,radius:4,x:80,y:20},
      {id:'b',name:'B',incoming:1,radius:4,x:-70,y:-25}
    ],
    lines: [{source:'center',target:'a'},{source:'b',target:'center'}]
  };
}
function settled(layout: ForceLayout): LayoutFrame {
  for (let i=0;i<250;i++) { const frame=layout.frame(); if(frame.done)return frame; }
  assert.fail('Simulation failed to settle');
}
function position(frame: LayoutFrame, id: string) { return frame.positions.find(point=>point.id===id)!; }

test('dragging reheats a settled graph, moves connected notes and cools after release', () => {
  const layout=new ForceLayout();layout.reset(request());
  const before=settled(layout);
  assert.deepEqual(position(before,'center'),{id:'center',x:0,y:0});
  assert.equal(layout.drag({type:'drag',run:1,id:'a',position:{x:130,y:-45}}),true);
  let held=layout.frame();
  for(let i=0;i<25;i++)held=layout.frame();
  assert.equal(held.done,false);
  assert.deepEqual(position(held,'a'),{id:'a',x:130,y:-45});
  assert.deepEqual(position(held,'center'),{id:'center',x:0,y:0});
  const bBefore=position(before,'b'),bHeld=position(held,'b');
  assert.ok(Math.hypot(bHeld.x-bBefore.x,bHeld.y-bBefore.y)>.5);
  layout.drag({type:'drag',run:1,id:'a'});
  const after=settled(layout);
  assert.equal(after.done,true);
  assert.ok(Math.hypot(position(after,'a').x-130,position(after,'a').y+45)>1);
});

test('the central note can be dragged and returns smoothly to its anchored position', () => {
  const layout=new ForceLayout();layout.reset(request());const before=settled(layout);
  layout.drag({type:'drag',run:1,id:'center',position:{x:75,y:40}});
  let held=layout.frame();for(let i=0;i<15;i++)held=layout.frame();
  assert.deepEqual(position(held,'center'),{id:'center',x:75,y:40});
  assert.ok(Math.hypot(position(held,'a').x-position(before,'a').x,position(held,'a').y-position(before,'a').y)>1);
  layout.drag({type:'drag',run:1,id:'center'});
  const first=position(layout.frame(),'center');
  assert.ok(first.x>0&&first.x<75);assert.ok(first.y>0&&first.y<40);
  assert.deepEqual(position(settled(layout),'center'),{id:'center',x:0,y:0});
});

test('old, missing and non-finite drag events cannot change a newer graph', () => {
  const layout=new ForceLayout();layout.reset(request(2));
  const before=settled(layout);
  assert.equal(layout.drag({type:'drag',run:1,id:'a',position:{x:100,y:0}}),false);
  assert.equal(layout.drag({type:'drag',run:2,id:'absent',position:{x:100,y:0}}),false);
  assert.equal(layout.drag({type:'drag',run:2,id:'a',position:{x:NaN,y:0}}),false);
  assert.equal(layout.drag({type:'drag',run:2,id:'a'}),false);
  const current=position(layout.frame(),'a'), previous=position(before,'a');
  assert.ok(Math.hypot(current.x-previous.x,current.y-previous.y)<.1);
  layout.drag({type:'drag',run:2,id:'center',position:{x:100,y:100}});
  layout.reset(request(3));
  assert.deepEqual(position(settled(layout),'center'),{id:'center',x:0,y:0});
});

test('reduced motion provides final positions immediately, including after dragging and release', () => {
  const layout=new ForceLayout();layout.reset(request(1,false));
  assert.equal(layout.animate,false);
  assert.equal(layout.frame(true).done,true);
  layout.drag({type:'drag',run:1,id:'a',position:{x:60,y:60}});
  const held=layout.frame(true);
  assert.equal(held.done,true);assert.deepEqual(position(held,'a'),{id:'a',x:60,y:60});
  layout.drag({type:'drag',run:1,id:'a'});
  const released=layout.frame(true);
  assert.equal(released.done,true);
  assert.ok(released.positions.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y)));
  layout.drag({type:'drag',run:1,id:'center',position:{x:100,y:80}});
  layout.frame(true);layout.drag({type:'drag',run:1,id:'center'});
  assert.deepEqual(position(layout.frame(true),'center'),{id:'center',x:0,y:0});
});
