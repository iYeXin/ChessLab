// ChessNext — minimal dual icon
// 1024x1024, rounded square parchment + dark disc with "弈" seal
// Pure Node, no deps.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 1024;
const R = 192; // outer rounded square radius
const BG = [0xf1, 0xea, 0xdc, 255]; // parchment
const BRAND = [0x33, 0x29, 0x1c, 255];
const PARCH = [0xfb, 0xf7, 0xee, 255];
const ACCENT = [0x7a, 0x52, 0x30, 255]; // walnut
const VERMILION = [0xa6, 0x3a, 0x2b, 255];
const DISC_R = 340;
const CX = SIZE/2, CY = SIZE/2;

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

const raw = Buffer.alloc(SIZE*(1+SIZE*4));
let o=0;
for(let y=0;y<SIZE;y++){
  raw[o++]=0;
  for(let x=0;x<SIZE;x++){
    // rounded square mask
    const rx = Math.min(x, SIZE-1-x);
    const ry = Math.min(y, SIZE-1-y);
    let inOuter=true;
    let alpha=255;
    if(rx < R && ry < R){
      const dx=R-rx-1, dy=R-ry-1;
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d>R) inOuter=false;
      else if(d>R-1.5) alpha=Math.round(255*(1-(d-(R-1.5))/1.5));
    }
    if(!inOuter){ raw[o++]=0; raw[o++]=0; raw[o++]=0; raw[o++]=0; continue; }

    // background parchment with very subtle diagonal grain
    let r=BG[0], g=BG[1], b=BG[2], a=alpha;
    const grain = (x + y) % 48 < 2 ? 4 : 0;
    r=clamp(r-grain,0,255); g=clamp(g-grain,0,255); b=clamp(b-grain,0,255);

    // central disc
    const dx=x-CX, dy=y-CY;
    const d2=dx*dx+dy*dy;
    const inDisc = d2 <= DISC_R*DISC_R;
    if(inDisc){
      const dist=Math.sqrt(d2);
      // disc face: parchment
      r=PARCH[0]; g=PARCH[1]; b=PARCH[2];
      // thin brand border
      if(dist > DISC_R-8){
        const t=(dist-(DISC_R-8))/8;
        r=Math.round(r*(1-t)+BRAND[0]*t);
        g=Math.round(g*(1-t)+BRAND[1]*t);
        b=Math.round(b*(1-t)+BRAND[2]*t);
      }
      // subtle top highlight
      const hx=CX- DISC_R*0.22, hy=CY- DISC_R*0.38;
      const hdx=x-hx, hdy=y-hy;
      const hd2=(hdx*hdx)/(110*110*1.4)+(hdy*hdy)/(110*110);
      if(hd2<1){
        const add=Math.round((1-hd2)*28);
        r=clamp(r+add,0,255); g=clamp(g+add,0,255); b=clamp(b+add,0,255);
      }
      // inner dual accent ring (thin)
      if(Math.abs(dist - (DISC_R-18)) < 1.2){
        // split ring: top half walnut, bottom half vermilion
        if(dy < 0){ r=ACCENT[0]; g=ACCENT[1]; b=ACCENT[2]; }
        else { r=VERMILION[0]; g=VERMILION[1]; b=VERMILION[2]; }
      }
      // central "弈" — simplified as 3x3 grid of squares with cross, not text, to stay geometric
      // Draw a 140x140 dark seal square with white grid and cross
      const sealH=96;
      if(Math.abs(dx) < sealH/2 && Math.abs(dy) < sealH/2){
        const isBorder = Math.abs(dx) > sealH/2-7 || Math.abs(dy) > sealH/2-7;
        if(isBorder){
          r=BRAND[0]; g=BRAND[1]; b=BRAND[2];
        } else {
          // inner cross
          const isCross = Math.abs(dx) < 7 || Math.abs(dy) < 7;
          if(isCross){ r=BRAND[0]; g=BRAND[1]; b=BRAND[2]; }
          else { r=PARCH[0]; g=PARCH[1]; b=PARCH[2]; }
        }
      }
    } else {
      // outside disc but inside rounded square: very faint watermark of board
      // keep parchment, add faint 1px grid every 96px
      if(x%96<1 || y%96<1){
        const v=236;
        r=v; g=v; b=210;
      }
    }

    raw[o++]=r; raw[o++]=g; raw[o++]=b; raw[o++]=a;
  }
}

const crcTable=Array.from({length:256},(_,n)=>{let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c>>>0;});
function crc32(buf){let c=0xffffffff; for(const b of buf) c=crcTable[(c^b)&0xff]^(c>>>8); return (c^0xffffffff)>>>0;}
function chunk(t,d){const l=Buffer.alloc(4); l.writeUInt32BE(d.length); const b=Buffer.concat([Buffer.from(t,'ascii'),d]); const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(b)); return Buffer.concat([l,b,crc]);}
const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(SIZE,0); ihdr.writeUInt32BE(SIZE,4); ihdr[8]=8; ihdr[9]=6;
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]), chunk('IHDR',ihdr), chunk('IDAT',deflateSync(raw,{level:9})), chunk('IEND',Buffer.alloc(0))]);
const out=join(here,'app-icon.png');
mkdirSync(dirname(out),{recursive:true});
writeFileSync(out,png);
console.log('written',out,png.length,'bytes');
