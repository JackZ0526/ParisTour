import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayReorderRail } from '../features/itinerary/components/DayReorderRail'
import { DayTabButton } from '../features/itinerary/components/DayTabButton'
import type { DayPlan } from '../types'
vi.mock('../shared/components/BoundedLiquidPill', () => ({ BoundedLiquidPill: () => null }))
vi.mock('react-dom', () => ({ createPortal: (children: unknown) => children }))
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
const days: DayPlan[]=Array.from({length:4},(_,i)=>({day:i+1,title:`Plan ${i+1}`,theme:'',summary:'',pace:'relaxed',metroHintFromArea:{},stops:[]}))
const onMove=vi.fn(), onSelect=vi.fn()
let root:ReactTestRenderer
const buttons=days.map((day,i)=>({dataset:{dayNumber:String(day.day)},getBoundingClientRect:()=>({left:i*100,width:90}),setPointerCapture:vi.fn(),hasPointerCapture:()=>false,releasePointerCapture:vi.fn(),focus:vi.fn()}))
const railNode={scrollLeft:100,querySelectorAll:()=>buttons,querySelector:()=>buttons[1],getBoundingClientRect:()=>({left:0,right:400,top:0,bottom:60})}
function view(disabled=false,plans=days){return <DayReorderRail days={plans} disabled={disabled} onMoveDay={onMove} className="" onScroll={()=>{}}>{plans.map(d=><DayTabButton key={d.day} dayNumber={d.day} title={d.title} pending={false} active={false} interactionToken={0} onInteractionSettled={()=>{}} onSelect={onSelect}/>)}</DayReorderRail>}
function mount(disabled=false){act(()=>{root=create(view(disabled),{createNodeMock:el=>{const props=el.props as Record<string,unknown>;return el.type==='button'?buttons[Number(props['data-day-number'])-1]:props.role==='group'?railNode:{}}})})}
const rail=()=>root.root.findByProps({role:'group'})
const button=(n:number)=>root.root.findAllByType('button').find(b=>b.props['data-day-number']===n)!
function event(x:number,touch=false){return {pointerId:1,button:0,pointerType:touch?'touch':'mouse',clientX:x,clientY:20,currentTarget:buttons[3],preventDefault:vi.fn(),stopPropagation:vi.fn()}}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();railNode.scrollLeft=100;vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());vi.stubGlobal('document',{body:{}})})
afterEach(()=>{if(root)act(()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals()})
describe('day rail input behavior',()=>{
 it('commits one whole-day insertion on mouse drop and suppresses the accidental click',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345)))
  act(()=>rail().props.onPointerMove(event(145)))
  expect(onMove).not.toHaveBeenCalled()
  act(()=>rail().props.onPointerUp(event(145)))
  expect(onMove).toHaveBeenCalledTimes(1);expect(onMove).toHaveBeenCalledWith(4,2)
  const click=event(145);rail().props.onClickCapture(click);expect(click.preventDefault).toHaveBeenCalled()
 })
 it('lets a touch swipe scroll horizontally without moving a day',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345,true)))
  act(()=>rail().props.onPointerMove(event(245,true)))
  act(()=>{vi.advanceTimersByTime(500)});act(()=>rail().props.onPointerUp(event(245,true)))
  expect(railNode.scrollLeft).toBe(200);expect(onMove).not.toHaveBeenCalled()
 })
 it('supports touch hold then drag',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345,true)))
  act(()=>{vi.advanceTimersByTime(350)});act(()=>rail().props.onPointerMove(event(145,true)))
  act(()=>rail().props.onPointerUp(event(145,true)))
  expect(onMove).toHaveBeenCalledTimes(1);expect(onMove).toHaveBeenCalledWith(4,2)
 })
 it('allows a normal tap to select without reordering',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345)))
  act(()=>rail().props.onPointerUp(event(345)));act(()=>button(4).props.onClick())
  expect(onSelect).toHaveBeenCalledOnce();expect(onMove).not.toHaveBeenCalled()
 })
 it('cancels a drop outside the day rail',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345)));act(()=>rail().props.onPointerMove({...event(145),clientY:300}));act(()=>rail().props.onPointerUp({...event(145),clientY:300}));expect(onMove).not.toHaveBeenCalled()
 })
 it('cancels on Escape and on external itinerary updates',()=>{
  mount();act(()=>button(4).props.onPointerDown(event(345)));act(()=>rail().props.onPointerMove(event(145)))
  act(()=>rail().props.onKeyDown({key:'Escape'}));act(()=>rail().props.onPointerUp(event(145)));expect(onMove).not.toHaveBeenCalled()
  act(()=>button(4).props.onPointerDown(event(345)));act(()=>rail().props.onPointerMove(event(145)))
  act(()=>root.update(view(false,[...days])));act(()=>rail().props.onPointerUp(event(145)));expect(onMove).not.toHaveBeenCalled()
 })
 it('supports Alt+arrow keyboard moves and respects read-only mode',()=>{
  mount();act(()=>button(4).props.onKeyDown({altKey:true,key:'ArrowLeft',preventDefault:vi.fn()}));expect(onMove).toHaveBeenCalledTimes(1);expect(onMove).toHaveBeenCalledWith(4,3)
  onMove.mockClear();act(()=>root.update(view(true)));act(()=>button(4).props.onKeyDown({altKey:true,key:'ArrowLeft',preventDefault:vi.fn()}));act(()=>button(4).props.onPointerDown(event(345)));act(()=>rail().props.onPointerMove(event(145)));act(()=>rail().props.onPointerUp(event(145)));expect(onMove).not.toHaveBeenCalled()
 })
})
