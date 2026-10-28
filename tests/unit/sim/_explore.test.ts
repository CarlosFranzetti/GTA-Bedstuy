import { it } from 'vitest';
import { Sim, makeVehicle, input, slipAngleDeg, DT } from './harness';

it('drift detail', () => {
  for (const dt of [1/30, 1/60, 1/120]) for (const [spd, steer, hbT] of [[16.67, 0.5, 0.5], [16.67, 0.0, 0.5], [16.67, 1, 0.3],[11.5,0.5,0.5]] as const) {
    const v = makeVehicle(); v.driver = 'player'; v.body.vel = { x: 0, z: -spd };
    const sim = new Sim(); sim.add(v);
    let max = 0, maxYaw=0, t15=-1;
    v.setInput(input({ steer, handbrake: true, throttle: 0 }));
    const h0=v.body.heading;
    let prevH = v.body.heading, tot=0;
    sim.run(hbT, (t) => { const s=slipAngleDeg(v); max = Math.max(max, s); if(s>15&&t15<0)t15=t; let dh=v.body.heading-prevH; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI; tot+=dh; maxYaw=Math.max(maxYaw,Math.abs(dh)/dt); prevH=v.body.heading;}, dt);
    v.setInput(input({ steer: 0, handbrake: false, throttle: 0.5 }));
    const tr: number[] = [];
    sim.run(4, (t) => { let dh=v.body.heading-prevH; if(dh>Math.PI)dh-=2*Math.PI; if(dh<-Math.PI)dh+=2*Math.PI; tot+=dh; prevH=v.body.heading; if (Math.round(t * 60) % 30 === 0) tr.push(+slipAngleDeg(v).toFixed(1)); }, dt);
    console.log('dt', dt.toFixed(4), 'spd', spd, 'steer', steer, 'hb', hbT, 'max slip', max.toFixed(1), 't15', t15.toFixed(2),'yaw max', maxYaw.toFixed(2), 'total rot deg', (tot*180/Math.PI).toFixed(0), 'recov', tr.join(','), 'speed', v.speed.toFixed(1));
  }
});
