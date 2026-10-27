/* 两帧口型管线：对齐 → 裁上半身 → 抹胸前物件+画话筒 → 共用调色板扁平化 → 抠白底 → 导出
   注入页面后：window.artTwo.run(imgClosed, imgOpen) */
window.artTwo = (function () {
  var O = {
    crop: { x0: 0.18, y0: 0.005, x1: 0.82, y1: 0.63 },
    outW: 800, blur: 1.0, k: 20,
    obj: { cx: 0.487, cy: 0.525 },      // 原图坐标：手里深色物件
    mic: { r: 0.055, tilt: 8 },
    mask: { cx: 0.525, cy: 0.283, rx: 0.115, ry: 0.052 },  // 只换嘴部这块（原图坐标，羽化椭圆）
    mouthFixDx: 0.0, mouthFixDy: -0.019                    // 第二张的嘴相对第一张的偏移修正
  };
  function hex(a){ return "#" + a.map(function(v){ return Math.round(v).toString(16).padStart(2,"0"); }).join(""); }
  function dist(a,b){ return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]); }
  function lum(p){ return (p[0]+p[1]+p[2])/3; }

  function medianCut(pix, k) {
    var boxes = [pix];
    while (boxes.length < k) {
      var bi = -1, br = -1;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i]; if (b.length < 2) continue;
        var mn = [255,255,255], mx = [0,0,0];
        for (var j = 0; j < b.length; j++) for (var c = 0; c < 3; c++){ if (b[j][c]<mn[c]) mn[c]=b[j][c]; if (b[j][c]>mx[c]) mx[c]=b[j][c]; }
        var r = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
        if (r > br) { br = r; bi = i; }
      }
      if (bi < 0) break;
      var box = boxes[bi], mn2=[255,255,255], mx2=[0,0,0];
      for (var j2=0;j2<box.length;j2++) for (var c2=0;c2<3;c2++){ if(box[j2][c2]<mn2[c2])mn2[c2]=box[j2][c2]; if(box[j2][c2]>mx2[c2])mx2[c2]=box[j2][c2]; }
      var ch=0, rr=-1;
      for (var c3=0;c3<3;c3++){ var d=mx2[c3]-mn2[c3]; if(d>rr){rr=d;ch=c3;} }
      box.sort(function(p,q){ return p[ch]-q[ch]; });
      var mid = Math.floor(box.length/2);
      boxes.splice(bi,1,box.slice(0,mid),box.slice(mid));
    }
    return boxes.filter(function(b){ return b.length; }).map(function(b){
      var s=[0,0,0]; b.forEach(function(p){ s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; });
      return [s[0]/b.length, s[1]/b.length, s[2]/b.length];
    });
  }
  function floodRecolor(im, W, H, sx, sy, halfW, halfH, thr, color) {
    var d = im.data, si = (sy*W+sx)*4, seed = [d[si], d[si+1], d[si+2]];
    var x0 = Math.max(0, Math.round(sx-halfW)), x1 = Math.min(W-1, Math.round(sx+halfW));
    var y0 = Math.max(0, Math.round(sy-halfH)), y1 = Math.min(H-1, Math.round(sy+halfH));
    var seen = new Uint8Array(W*H), st = [sy*W+sx], n = 0;
    while (st.length) {
      var p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      var x = p % W, y = (p - x) / W;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      var i = p*4;
      if (dist([d[i],d[i+1],d[i+2]], seed) > thr) continue;
      d[i]=color[0]; d[i+1]=color[1]; d[i+2]=color[2]; n++;
      if (x>0) st.push(p-1); if (x<W-1) st.push(p+1);
      if (y>0) st.push(p-W); if (y<H-1) st.push(p+W);
    }
    return n;
  }
  function drawMic(ctx, cx, cy, r, tilt) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt*Math.PI/180); ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(-r*0.44,r*0.72); ctx.lineTo(r*0.44,r*0.72); ctx.lineTo(r*0.30,r*3.2); ctx.lineTo(-r*0.30,r*3.2); ctx.closePath();
    ctx.fillStyle="#151a24"; ctx.fill(); ctx.strokeStyle="#0d1219"; ctx.lineWidth=r*0.16; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-r*0.56, r*0.50, r*1.12, r*0.42, r*0.18); ctx.fillStyle="#cbd5e1"; ctx.fill(); ctx.strokeStyle="#0d1219"; ctx.lineWidth=r*0.12; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0,0,r,r*1.12,0,0,6.2832); ctx.fillStyle="#1a1f2b"; ctx.fill(); ctx.strokeStyle="#0d1219"; ctx.lineWidth=r*0.16; ctx.stroke();
    ctx.strokeStyle="#6b7280"; ctx.lineWidth=r*0.10;
    for (var i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(-r*0.74, i*r*0.5); ctx.quadraticCurveTo(0, i*r*0.5-r*0.26, r*0.74, i*r*0.5); ctx.stroke(); }
    ctx.restore();
  }

  /* 把两张图放到同一尺寸，并把第二张对齐到第一张 */
  function toData(img, W, H, dx, dy) {
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high";
    x.drawImage(img, dx, dy, W, H);
    return x.getImageData(0, 0, W, H);
  }
  function alignTo(A, B, W, H) {
    var best = { dx:0, dy:0, score:1e18 };
    for (var dy=-24; dy<=24; dy+=2) for (var dx=-24; dx<=24; dx+=2) {
      var s=0, n=0;
      for (var y=150; y<H-150; y+=6) for (var x=120; x<W-120; x+=6) {
        var xb=x+dx, yb=y+dy; if (xb<0||yb<0||xb>=W||yb>=H) continue;
        var ia=(y*W+x)*4, ib=(yb*W+xb)*4;
        s += Math.abs(A[ia]-B[ib]) + Math.abs(A[ia+1]-B[ib+1]) + Math.abs(A[ia+2]-B[ib+2]); n++;
      }
      var sc = n ? s/n : 1e9;
      if (sc < best.score) best = { dx:dx, dy:dy, score:+sc.toFixed(1) };
    }
    // 在最优附近再做一次 1 像素精搜
    var b2 = best;
    for (var dy2=best.dy-2; dy2<=best.dy+2; dy2++) for (var dx2=best.dx-2; dx2<=best.dx+2; dx2++) {
      var s2=0, n2=0;
      for (var y2=150; y2<H-150; y2+=4) for (var x2=120; x2<W-120; x2+=4) {
        var xb2=x2+dx2, yb2=y2+dy2; if (xb2<0||yb2<0||xb2>=W||yb2>=H) continue;
        var ia2=(y2*W+x2)*4, ib2=(yb2*W+xb2)*4;
        s2 += Math.abs(A[ia2]-B[ib2]) + Math.abs(A[ia2+1]-B[ib2+1]) + Math.abs(A[ia2+2]-B[ib2+2]); n2++;
      }
      var sc2 = n2 ? s2/n2 : 1e9;
      if (sc2 < b2.score) b2 = { dx:dx2, dy:dy2, score:+sc2.toFixed(1) };
    }
    best = b2;
    return best;
  }
  /* 在给定窗口里找最暗像素的质心（用来定位嘴巴） */
  function darkestCentroid(data, W, H, cx, cy, rx, ry) {
    var pts = [];
    for (var y = Math.max(0, cy-ry); y <= Math.min(H-1, cy+ry); y++)
      for (var x = Math.max(0, cx-rx); x <= Math.min(W-1, cx+rx); x++) {
        var i = (y*W+x)*4;
        if (data[i+3] === 0) continue;
        pts.push([x, y, (data[i]+data[i+1]+data[i+2])/3]);
      }
    if (!pts.length) return [cx, cy];
    pts.sort(function (a, b) { return a[2] - b[2]; });
    var take = Math.max(16, Math.round(pts.length*0.04)), sx = 0, sy = 0;
    for (var k = 0; k < take; k++) { sx += pts[k][0]; sy += pts[k][1]; }
    return [sx/take, sy/take];
  }

  function frame(src, pal) {
    var W0 = src.width, H0 = src.height;
    var cw = O.crop.x1-O.crop.x0, ch = O.crop.y1-O.crop.y0;
    var outW = O.outW, outH = Math.round((ch*H0) * outW / (cw*W0));
    var c = document.createElement("canvas"); c.width = outW; c.height = outH;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.filter = "blur(" + O.blur + "px)";
    ctx.drawImage(src, O.crop.x0*W0, O.crop.y0*H0, cw*W0, ch*H0, 0, 0, outW, outH);
    ctx.filter = "none";
    var im = ctx.getImageData(0,0,outW,outH), d = im.data;
    // 抠白底
    var nw = function(i){ return d[i]>234 && d[i+1]>234 && d[i+2]>234; };
    var seen = new Uint8Array(outW*outH), st = [];
    for (var x=0;x<outW;x++){ st.push(x,(outH-1)*outW+x); }
    for (var y=0;y<outH;y++){ st.push(y*outW, y*outW+outW-1); }
    while (st.length) {
      var p = st.pop(); if (seen[p]) continue; seen[p]=1;
      var i = p*4; if (!nw(i)) continue;
      d[i+3]=0;
      var px=p%outW, py=(p-px)/outW;
      if(px>0)st.push(p-1); if(px<outW-1)st.push(p+1); if(py>0)st.push(p-outW); if(py<outH-1)st.push(p+outW);
    }
    ctx.putImageData(im, 0, 0);
    // 抹掉胸前深色物件（种子=该区域最暗点），刷成周围浅色
    var ox = Math.round((O.obj.cx-O.crop.x0)/cw*outW), oy = Math.round((O.obj.cy-O.crop.y0)/ch*outH);
    var bx0 = Math.max(0,ox-Math.round(outW*0.10)), bx1 = Math.min(outW-1,ox+Math.round(outW*0.10));
    var by0 = Math.max(0,oy-Math.round(outH*0.12)), by1 = Math.min(outH-1,oy+Math.round(outH*0.10));
    var seed = null, minL = 999;
    for (var sy=by0; sy<=by1; sy++) for (var sx=bx0; sx<=bx1; sx++) {
      var ii=(sy*outW+sx)*4; if (d[ii+3]===0) continue;
      var l = (d[ii]+d[ii+1]+d[ii+2])/3; if (l<minL){ minL=l; seed=[sx,sy]; }
    }
    var shirt=[0,0,0], m=0;
    for (var ry=-0.12; ry<=0.02; ry+=0.02) for (var rx=-0.11; rx<=0.11; rx+=0.02) {
      var qx=ox+Math.round(outW*rx), qy=oy+Math.round(outH*ry);
      if (qx<0||qx>=outW||qy<0||qy>=outH) continue;
      var jj=(qy*outW+qx)*4, pp=[d[jj],d[jj+1],d[jj+2]];
      if (d[jj+3]===0 || lum(pp)<165 || pp[0]>pp[2]+25) continue;
      shirt[0]+=pp[0]; shirt[1]+=pp[1]; shirt[2]+=pp[2]; m++;
    }
    shirt = m ? [shirt[0]/m, shirt[1]/m, shirt[2]/m] : [214,214,236];
    if (seed) floodRecolor(im, outW, outH, seed[0], seed[1], outW*0.11, outH*0.10, 150, shirt);
    ctx.putImageData(im, 0, 0);
    // 画话筒（两帧同位置）
    drawMic(ctx, outW*0.487, oy - outH*0.02, O.mic.r*outW, O.mic.tilt);
    // 映射到共用调色板 + 众数滤波
    var im2 = ctx.getImageData(0,0,outW,outH), d2 = im2.data;
    var idx = new Uint8Array(outW*outH);
    for (var p2=0;p2<outW*outH;p2++){
      var i2=p2*4;
      if (d2[i2+3]===0){ idx[p2]=255; continue; }
      var col=[d2[i2],d2[i2+1],d2[i2+2]], bs=1e9, bi2=0;
      for (var kk=0;kk<pal.length;kk++){ var dd=dist(col,pal[kk]); if(dd<bs){bs=dd;bi2=kk;} }
      idx[p2]=bi2;
    }
    for (var pass=0; pass<2; pass++) {
      var nxt = idx.slice();
      for (var y3=1;y3<outH-1;y3++) for (var x3=1;x3<outW-1;x3++) {
        var p3=y3*outW+x3; if (idx[p3]===255) continue;
        var cnt={};
        for (var dy3=-1;dy3<=1;dy3++) for (var dx3=-1;dx3<=1;dx3++){ var v=idx[(y3+dy3)*outW+(x3+dx3)]; if(v===255)continue; cnt[v]=(cnt[v]||0)+1; }
        var bk=idx[p3], bc=0; Object.keys(cnt).forEach(function(k4){ if(cnt[k4]>bc){bc=cnt[k4];bk=+k4;} });
        nxt[p3]=bk;
      }
      idx = nxt;
    }
    for (var p4=0;p4<outW*outH;p4++){
      var i4=p4*4;
      if (idx[p4]===255){ d2[i4+3]=0; continue; }
      var cc=pal[idx[p4]]; d2[i4]=cc[0]; d2[i4+1]=cc[1]; d2[i4+2]=cc[2]; d2[i4+3]=255;
    }
    ctx.putImageData(im2, 0, 0);
    return { canvas: c, w: outW, h: outH, micR: Math.round(O.mic.r*outW), shirt: hex(shirt) };
  }

  function run(imgClosed, imgOpen) {
    var W0 = imgClosed.naturalWidth, H0 = imgClosed.naturalHeight;
    var W = 800, H = Math.round(H0*W/W0);
    var A = toData(imgClosed, W, H, 0, 0);
    var B0 = toData(imgOpen, W, H, 0, 0);
    var off = alignTo(A.data, B0.data, W, H);
    var B = toData(imgOpen, W, H, off.dx, off.dy);
    // 共用调色板：两帧各采样一半
    var samples = [];
    [A.data, B.data].forEach(function (dd) {
      for (var p = 0; p < W*H; p += 3) {
        var i = p*4;
        if (dd[i+3] === 0) continue;
        var l = (dd[i]+dd[i+1]+dd[i+2])/3, mx = Math.max(dd[i],dd[i+1],dd[i+2]), mn = Math.min(dd[i],dd[i+1],dd[i+2]);
        if (l > 238 && mx-mn < 20) continue;
        samples.push([dd[i], dd[i+1], dd[i+2]]);
      }
    });
    var pal = medianCut(samples, O.k);
    // 闭嘴帧 = 1.jpg（上半身、抠白底）；说话帧 = 2.jpg 按对齐偏移整幅使用
    var cA = document.createElement("canvas"); cA.width = W; cA.height = H;
    cA.getContext("2d", { willReadFrequently: true }).drawImage(imgClosed, 0, 0, W, H);
    var cB = document.createElement("canvas"); cB.width = W; cB.height = H;
    var xB = cB.getContext("2d", { willReadFrequently: true });
    xB.drawImage(imgOpen, off.dx, off.dy, W, H);
    var mdx = off.dx, mdy = off.dy;
    var f1 = frame(cA, pal);
    var f2 = frame(cB, pal);
    function deck(cv, w) {
      var c3 = document.createElement("canvas"); c3.width = w; c3.height = Math.round(cv.height*w/cv.width);
      var x3 = c3.getContext("2d"); x3.imageSmoothingQuality = "high";
      x3.drawImage(cv, 0, 0, c3.width, c3.height);
      return c3.toDataURL("image/png");
    }
    return {
      frameClosed: f1.canvas.toDataURL("image/webp", 0.95),
      frameOpen: f2.canvas.toDataURL("image/webp", 0.95),
      pngClosed: deck(f1.canvas, 640), pngOpen: deck(f2.canvas, 640),
      size: [f1.w, f1.h], colors: pal.length, align: off, shirt: f1.shirt, micR: f1.micR
      , mouthShift: [mdx, mdy]
    };
  }
  return { run: run, opts: O };
})();
