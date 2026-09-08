export type Mode='classic'|'rush'|'endless';
export type Status='ready'|'playing'|'paused'|'over';
export interface Ball {x:number;z:number;vx:number;vz:number;y:number;ramp:number;progress:number;cooldown:number;age:number}
export interface GameEvent {type:'bumper'|'flipper'|'ramp'|'warp'|'launch'|'drain'|'save'|'multiball'|'tilt'|'over'|'target';x:number;z:number;points:number;message:string}
export const bumpers=[[-1.5,-3.5],[1.5,-3.5],[0,-1.6]];
export interface Snapshot {canLaunch:boolean;status:Status;mode:Mode;score:number;multiplier:number;remaining:number;activeBalls:number;time:number;charge:number;energy:number;warps:number;ramps:number;hits:number;saves:number;tilt:number;saveTime:number;left:number;right:number;message:string}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const walls:number[][]=[[-4.9,-7.8,-4.9,4.8],[4.9,-7.8,4.9,4.8],[-4.9,-7.8,-3.5,-9.2],[-3.5,-9.2,3.5,-9.2],[3.5,-9.2,4.9,-7.8],[-4.9,4.8,-3.8,7.6],[-3.8,7.6,-1.1,9.3],[4.9,4.8,3.8,7.6],[3.8,7.6,1.1,9.3],[-4.3,3.5,-4.4,5.7],[-4.4,5.7,-3.35,7.15],[-3.35,7.15,-2.22,7.3],[4.3,3.5,4.4,5.7],[4.4,5.7,3.35,7.15],[3.35,7.15,2.22,7.3]];
export class Pinball {
 status:Status='ready';mode:Mode='classic';score=0;multiplier=1;remaining=3;time=120;charge=0;energy=0;warps=0;ramps=0;hits=0;saves=0;tilt=0;saveTime=0;left=0;right=0;message='READY TO RIDE';balls:Ball[]=[];
 input={left:false,right:false,launch:false};private acc=0;private elapsed=0;private eventTimer=0;private nudgeCooldown=0;private shotPending=true;
 private emit:(e:GameEvent)=>void;
 constructor(emit:(e:GameEvent)=>void=()=>{}){this.emit=emit}
 snapshot():Snapshot{return {canLaunch:this.canLaunch(),status:this.status,mode:this.mode,score:this.score,multiplier:this.multiplier,remaining:this.remaining,activeBalls:this.balls.length,time:this.time,charge:this.charge,energy:this.energy,warps:this.warps,ramps:this.ramps,hits:this.hits,saves:this.saves,tilt:this.tilt,saveTime:this.saveTime,left:this.left,right:this.right,message:this.message}}
 start(mode:Mode){this.mode=mode;this.status='playing';this.score=0;this.multiplier=1;this.remaining=3;this.time=120;this.energy=0;this.warps=0;this.ramps=0;this.hits=0;this.saves=0;this.tilt=0;this.elapsed=0;this.saveTime=0;this.charge=0;this.balls=[];this.shotPending=true;this.message='HOLD SPACE · RELEASE TO LAUNCH';this.eventTimer=3;this.acc=0;this.left=0;this.right=0;this.input={left:false,right:false,launch:false};this.nudgeCooldown=0}
 setInput(key:'left'|'right'|'launch',value:boolean){if(this.status!=='playing')return;if(key==='launch'&&!value&&this.input.launch){this.launch()}this.input[key]=value}
 pause(){if(this.status==='playing'){this.status='paused';this.input={left:false,right:false,launch:false};this.charge=0;this.acc=0}else if(this.status==='paused')this.status='playing'}
 canLaunch(){return this.shotPending&&this.status==='playing'}
 private makeBall(x:number,z:number,vx:number,vz:number):Ball{return{x,z,vx,vz,y:.235,ramp:-1,progress:0,cooldown:.6,age:0}}
 launch(){if(!this.canLaunch())return false;const power=.35+this.charge*.65;this.balls.push(this.makeBall(4.55,7.7,-.18,-23-power*7));this.shotPending=false;this.saveTime=10;this.charge=0;this.event('launch',4.55,7.7,0,'BALL SAVE ACTIVE');return true}
 nudge(){if(this.status!=='playing'||!this.balls.length||this.nudgeCooldown>0)return false;this.nudgeCooldown=.8;this.tilt+=.42;if(this.tilt>=1){this.tilt=1;this.event('tilt',0,0,0,'TILT · FLIPPERS LOCKED');return false}for(const b of this.balls){b.vz-=5;b.vx+=(b.x>0?-1:1)*2.3}this.message='NUDGE · EASY DOES IT';this.eventTimer=1.5;return true}
 pulse(){if(this.status!=='playing'||this.energy<1||!this.balls.length||this.balls.length>=3)return false;this.energy=0;this.multiball();return true}
 private multiball(){if(this.balls.length>=3)return;while(this.balls.length<3){const s=this.balls.length%2?1:-1;this.balls.push(this.makeBall(s*1.1,-6,s*3,6))}this.saveTime=12;this.event('multiball',0,.7,10000,'MULTIBALL · TRIPLE THE CHAOS')}
 private event(type:GameEvent['type'],x:number,z:number,points:number,message:string){const value=points*this.multiplier;this.score+=value;this.message=message;this.eventTimer=2.2;this.emit({type,x,z,points:value,message})}
 update(dt:number){if(this.status!=='playing')return;this.acc+=Math.min(dt,.1);while(this.acc>=1/240){this.step(1/240);this.acc-=1/240;if(this.status!=='playing'){this.acc=0;break}}}
 private collideSegment(b:Ball,ax:number,az:number,bx:number,bz:number,r=.32,restitution=.78){const dx=bx-ax,dz=bz-az;const t=clamp(((b.x-ax)*dx+(b.z-az)*dz)/(dx*dx+dz*dz),0,1);const cx=ax+t*dx,cz=az+t*dz;const nx=b.x-cx,nz=b.z-cz;const dist=Math.hypot(nx,nz);if(dist>=r||dist<.00001)return null;const ux=nx/dist,uz=nz/dist;b.x=cx+ux*r;b.z=cz+uz*r;const dot=b.vx*ux+b.vz*uz;if(dot<0){b.vx-=(1+restitution)*dot*ux;b.vz-=(1+restitution)*dot*uz}return{t,ux,uz}}
 private step(dt:number){this.elapsed+=dt;this.nudgeCooldown=Math.max(0,this.nudgeCooldown-dt);this.tilt=Math.max(0,this.tilt-dt*.035);this.eventTimer-=dt;this.saveTime=Math.max(0,this.saveTime-dt);if(this.input.launch&&this.shotPending)this.charge=Math.min(1,this.charge+dt*.8);
   if(this.mode==='rush'){this.time=Math.max(0,this.time-dt);if(this.time<=0){this.finish();return}}
   if(this.eventTimer<=0)this.message=this.shotPending?'HOLD SPACE · RELEASE TO LAUNCH':this.energy>=1?'MULTIBALL READY · PRESS M':'LIGHT THE TUNNELS · CHASE THE WARP';
   const disabled=this.tilt>.85;const prevL=this.left,prevR=this.right;this.left+=(Number(this.input.left&&!disabled)-this.left)*Math.min(1,dt*30);this.right+=(Number(this.input.right&&!disabled)-this.right)*Math.min(1,dt*30);
   for(let i=this.balls.length-1;i>=0;i--){const b=this.balls[i];b.age+=dt;b.cooldown=Math.max(0,b.cooldown-dt);if(b.ramp>=0){b.progress+=dt*.39;if(b.progress>=1){b.ramp=-1;b.progress=0;b.x=b.x<0?-1.3:.3;b.z=-6.5;b.y=.235;b.vx=(b.x<0?3:-3);b.vz=8;b.cooldown=1.2}continue}
    b.vz+=5.2*dt;b.vx*=1-dt*.075;b.vz*=1-dt*.075;const speed=Math.hypot(b.vx,b.vz);if(speed>32){b.vx*=32/speed;b.vz*=32/speed}b.x+=b.vx*dt;b.z+=b.vz*dt;
    // Shooter lane releases at the far end; its wireform feeds the bumpers.
    if(b.age<1.7&&b.x>4.1){if(b.z> -7.2){b.x=4.55;continue}b.vx=-3.4;b.vz=9;b.age=2}
    for(const [ax,az,bx,bz]of walls)this.collideSegment(b,ax,az,bx,bz);
    for(const [x,z]of bumpers){const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz);if(d<.89&&d>.0001){b.x=x+dx/d*.9;b.z=z+dz/d*.9;b.vx=dx/d*13;b.vz=dz/d*13;if(b.cooldown===0){this.hits++;this.energy=Math.min(1,this.energy+.06);this.event('bumper',x,z,500,'POP BUMPER +'+500*this.multiplier);b.cooldown=.12}}}
    for(const s of [-1,1]){
      // Slingshot rubber gives the ball a lateral kick away from its face.
      const tri=[[s*2.78,4.2,s*3.2,6.45],[s*3.2,6.45,s*2.35,5.94],[s*2.35,5.94,s*2.78,4.2]];
      for(const [ax,az,bx,bz]of tri){const hit=this.collideSegment(b,ax,az,bx,bz,.36,.95);if(hit&&b.cooldown===0){b.vx+=hit.ux*4;b.vz+=hit.uz*4;this.event('target',b.x,b.z,150,'SLINGSHOT');b.cooldown=.17}}
      const amount=s<0?this.left:this.right,prev=s<0?prevL:prevR;const angle=.34-amount*.85;const ax=s*2.22,az=7.3,bx=ax-s*Math.cos(angle)*1.72,bz=az+Math.sin(angle)*1.72;
      const hit=this.collideSegment(b,ax,az,bx,bz,.40,.66);
      if(hit&&amount>.25&&amount>prev+.0001&&b.cooldown===0&&!disabled){b.vz=-(17+hit.t*9);b.vx=-s*(2+hit.t*5);b.cooldown=.15;this.event('flipper',b.x,b.z,0,'')}
      for(let j=0;j<4;j++){const x=s*(2.25+.18*Math.sin(j)),z=-5.6+j*1.5;if(Math.hypot(b.x-x,b.z-z)<.36&&b.cooldown===0){const dx=b.x-x,dz=b.z-z,d=Math.max(.01,Math.hypot(dx,dz));b.x=x+dx/d*.39;b.z=z+dz/d*.39;b.vx+=dx/d*4;b.vz+=dz/d*4;b.cooldown=.2;this.energy=Math.min(1,this.energy+.08);this.event('target',x,z,250,'LANE TARGET')}}
    }
    if(b.cooldown===0&&b.vz<0){if(b.x>2.9&&b.x<4.1&&b.z>1.7&&b.z<2.8){b.ramp=0;b.progress=0;this.ramps++;this.energy=Math.min(1,this.energy+.22);this.event('ramp',b.x,b.z,3000,'ORBIT RAMP · +'+3000*this.multiplier)}else if(b.x< -2.6&&b.x> -3.9&&b.z>3.3&&b.z<4.4){b.ramp=1;b.progress=0;this.ramps++;this.energy=Math.min(1,this.energy+.22);this.event('ramp',b.x,b.z,3000,'NEON LOOP · +'+3000*this.multiplier)}}
    if(Math.abs(b.x)<1.25&&b.z< -7.4&&b.cooldown===0){b.x=0;b.z=1.7;b.vx=0;b.vz=7;b.cooldown=2.2;this.warps++;this.multiplier=Math.min(8,1+this.warps);this.energy=Math.min(1,this.energy+.3);this.event('warp',0,-7.8,5000,'WARP GATE · '+this.multiplier+'× MULTIPLIER');if(this.warps%3===0&&this.balls.length===1)this.multiball()}
    // Resolve ball-to-ball contacts during multiball, preserving momentum.
    for(let j=0;j<i;j++){const a=this.balls[j];if(a.ramp>=0)continue;const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>0&&d<.47){const nx=dx/d,nz=dz/d,over=(.47-d)/2;b.x+=nx*over;b.z+=nz*over;a.x-=nx*over;a.z-=nz*over;const rel=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;if(rel<0){b.vx-=rel*nx;b.vz-=rel*nz;a.vx+=rel*nx;a.vz+=rel*nz}}}
    if(b.z>10.05){this.balls.splice(i,1);if(this.saveTime>0){this.saves++;this.balls.push(this.makeBall(4.55,7.7,0,-28));this.event('save',0,8,0,'BALL SAVED · BACK INTO THE LIGHT')}else if(this.balls.length===0){this.remaining--;this.multiplier=1;if(this.mode==='classic'&&this.remaining<=0)this.finish();else{this.shotPending=true;if(this.mode!=='classic')this.remaining=3;this.event('drain',0,8,0,'NEXT BALL · HOLD SPACE TO LAUNCH')}}}
   }
 }
 private finish(){this.status='over';this.input={left:false,right:false,launch:false};this.emit({type:'over',x:0,z:0,points:0,message:'RUN COMPLETE'});this.message='RUN COMPLETE'}
}
