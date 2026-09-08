import type { GameEvent } from './physics';
export class ArcadeAudio {
 private context:AudioContext|null=null;private gain:GainNode|null=null;private timer:ReturnType<typeof setInterval>|null=null;private step=0;muted=false;
 init(){if(!this.context){this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=.23;this.gain.connect(this.context.destination)}void this.context.resume().catch(()=>{});if(!this.timer)this.timer=setInterval(()=>this.beat(),190)}
 setMuted(v:boolean){this.muted=v;if(this.gain)this.gain.gain.setTargetAtTime(v?0:.23,this.context!.currentTime,.04)}
 private tone(freq:number,duration:number,type:OscillatorType='sine',volume=.4,slide=1){if(!this.context||!this.gain||this.muted)return;const now=this.context.currentTime;const o=this.context.createOscillator(),g=this.context.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(Math.max(30,freq*slide),now+duration);g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(volume,now+.005);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(this.gain);o.start(now);o.stop(now+duration+.02);o.onended=()=>{o.disconnect();g.disconnect()}}
 private beat(){const bass=[55,55,65.4,49][Math.floor(this.step/16)%4];if(this.step%4===0)this.tone(bass,.32,'triangle',.24);if(this.step%4===2)this.tone(150,.09,'sine',.12,.2);const notes=[1,1.5,2,2.4,3,2,1.5,2];this.tone(bass*4*notes[this.step%8],.17,'sine',.055);this.step++}
 event(e:GameEvent){const f={bumper:740,flipper:90,target:990,ramp:330,warp:180,launch:120,drain:180,save:660,multiball:440,tilt:80,over:220}[e.type];this.tone(f,e.type==='warp'?.8:.15,e.type==='flipper'?'triangle':'sine',.35,e.type==='warp'?8:e.type==='drain'?.3:1.3);if(['ramp','multiball','save'].includes(e.type))this.tone(f*1.5,.6,'triangle',.14)}
 destroy(){if(this.timer)clearInterval(this.timer);this.timer=null;void this.context?.close();this.context=null}
}
