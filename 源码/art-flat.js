/* 原图扁平化管线：裁切 → 抠白底 → 抹嘴 → 换话筒 → 量化 → 导出
   注入页面后用 window.artFlat.run(img) 调用（浏览器 canvas 处理） */
window.artFlat = (function () {
  var O = {
    crop: { x0: 0.18, y0: 0.005, x1: 0.82, y1: 0.63 },
    outW: 800,
    blur: 1.2,
    k: 20,
    mouth: { cx: 0.525, cy: 0.281 },              // 原图坐标（脸宽 52.5%、脸高 28%）
    obj: { cx: 0.487, cy: 0.525, r: 0.10 },       // 手里深色物件（原图坐标）
    mic: { drop: 0.30, r: 0.055, tilt: 8 },       // 话筒：相对画面宽度的半径、下移量、倾角
    lipTop: "#b1555c", lipBottom: "#c9726f", openDark: "#5d1a24", teeth: "#fbf3ec", tongue: "#c2656f"
  };

  function hex(a) { return "#" + a.map(function (v) { return Math.round(v).toString(16).padStart(2, "0"); }).join(""); }
  function dist(a, b) { return Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]); }
  function lum(p) { return (p[0]+p[1]+p[2])/3; }

  /* ---- 中位切分量化 ---- */
  function medianCut(pix, k) {
    var boxes = [pix];
    while (boxes.length < k) {
      var bi = -1, br = -1;
      for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i]; if (b.length < 2) continue;
        var mn = [255,255,255], mx = [0,0,0];
        for (var j = 0; j < b.length; j++) for (var c = 0; c < 3; c++) { if (b[j][c] < mn[c]) mn[c] = b[j][c]; if (b[j][c] > mx[c]) mx[c] = b[j][c]; }
        var r = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
        if (r > br) { br = r; bi = i; }
      }
      if (bi < 0) break;
      var box = boxes[bi], mn2 = [255,255,255], mx2 = [0,0,0];
      for (var j2 = 0; j2 < box.length; j2++) for (var c2 = 0; c2 < 3; c2++) { if (box[j2][c2] < mn2[c2]) mn2[c2] = box[j2][c2]; if (box[j2][c2] > mx2[c2]) mx2[c2] = box[j2][c2]; }
      var ch = 0, rr = -1;
      for (var c3 = 0; c3 < 3; c3++) { var d = mx2[c3]-mn2[c3]; if (d > rr) { rr = d; ch = c3; } }
      box.sort(function (p, q) { return p[ch] - q[ch]; });
      var mid = Math.floor(box.length/2);
      boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.filter(function (b) { return b.length; }).map(function (b) {
      var s = [0,0,0];
      b.forEach(function (p) { s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; });
      return [s[0]/b.length, s[1]/b.length, s[2]/b.length];
    });
  }

  /* ---- 有界泛洪改色：把与种子颜色相近的连通区域刷成指定颜色 ---- */
  function floodRecolor(im, W, H, sx, sy, halfW, halfH, thr, color) {
    var d = im.data, seed = [d[(sy*W+sx)*4], d[(sy*W+sx)*4+1], d[(sy*W+sx)*4+2]];
    var x0 = Math.max(0, Math.round(sx-halfW)), x1 = Math.min(W-1, Math.round(sx+halfW));
    var y0 = Math.max(0, Math.round(sy-halfH)), y1 = Math.min(H-1, Math.round(sy+halfH));
    var seen = new Uint8Array(W*H), st = [sy*W+sx], n = 0;
    while (st.length) {
      var p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      var x = p % W, y = (p - x) / W;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      var i = p*4;
      if (dist([d[i], d[i+1], d[i+2]], seed) > thr) continue;
      d[i] = color[0]; d[i+1] = color[1]; d[i+2] = color[2]; n++;
      if (x > 0) st.push(p-1); if (x < W-1) st.push(p+1);
      if (y > 0) st.push(p-W); if (y < H-1) st.push(p+W);
    }
    return n;
  }

  /* ---- 画嘴巴（canvas 版，和页面里的 SVG 用同一套坐标 0..100 / 0..44） ---- */
  function drawMouth(ctx, cx, cy, w, open) {
    var s = w/100, h = w*0.44;
    ctx.save();
    ctx.translate(cx, cy); ctx.scale(s, h/44);
    ctx.lineJoin = "round";
    // 张口部分（围绕唇线 y=20 竖向缩放）
    if (open > 0.02) {
      ctx.save(); ctx.translate(0, 20); ctx.scale(1, open); ctx.translate(0, -20);
      ctx.beginPath(); ctx.moveTo(14,20); ctx.quadraticCurveTo(50,16,86,20); ctx.quadraticCurveTo(50,40,14,20); ctx.closePath();
      ctx.fillStyle = O.openDark; ctx.fill();
      ctx.beginPath(); ctx.moveTo(16,20); ctx.quadraticCurveTo(50,17,84,20); ctx.lineTo(82,24.5); ctx.quadraticCurveTo(50,21.5,18,24.5); ctx.closePath();
      ctx.fillStyle = O.teeth; ctx.fill();
      ctx.beginPath(); ctx.ellipse(50,33,19,6,0,0,6.2832); ctx.fillStyle = O.tongue; ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.moveTo(13,20); ctx.quadraticCurveTo(50,30,87,20); ctx.quadraticCurveTo(50,39,13,20); ctx.closePath();
    ctx.fillStyle = O.lipBottom; ctx.fill();
    ctx.strokeStyle = "#8d3b41"; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(13,20); ctx.quadraticCurveTo(50,28,87,20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12,20); ctx.quadraticCurveTo(30,10,50,11.5); ctx.quadraticCurveTo(70,10,88,20); ctx.quadraticCurveTo(50,25,12,20); ctx.closePath();
    ctx.fillStyle = O.lipTop; ctx.fill();
    ctx.beginPath(); ctx.moveTo(12,20); ctx.quadraticCurveTo(50,13.5,88,20); ctx.stroke();
    ctx.restore();
  }

  /* ---- 画话筒（canvas 版） ---- */
  function drawMic(ctx, cx, cy, r, tilt) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt*Math.PI/180);
    ctx.lineJoin = "round";
    // 手柄
    ctx.beginPath(); ctx.moveTo(-r*0.44, r*0.72); ctx.lineTo(r*0.44, r*0.72);
    ctx.lineTo(r*0.30, r*3.2); ctx.lineTo(-r*0.30, r*3.2); ctx.closePath();
    ctx.fillStyle = "#151a24"; ctx.fill(); ctx.strokeStyle = "#0d1219"; ctx.lineWidth = r*0.16; ctx.stroke();
    // 银色握环
    ctx.beginPath(); ctx.roundRect(-r*0.56, r*0.50, r*1.12, r*0.42, r*0.18);
    ctx.fillStyle = "#cbd5e1"; ctx.fill(); ctx.strokeStyle = "#0d1219"; ctx.lineWidth = r*0.12; ctx.stroke();
    // 网头
    ctx.beginPath(); ctx.ellipse(0, 0, r, r*1.12, 0, 0, 6.2832);
    ctx.fillStyle = "#1a1f2b"; ctx.fill(); ctx.strokeStyle = "#0d1219"; ctx.lineWidth = r*0.16; ctx.stroke();
    // 网纹
    ctx.strokeStyle = "#6b7280"; ctx.lineWidth = r*0.10;
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-r*0.74, i*r*0.5); ctx.quadraticCurveTo(0, i*r*0.5 - r*0.26, r*0.74, i*r*0.5); ctx.stroke(); }
    ctx.restore();
  }

  /* ---- 主流程 ---- */
  function run(img) {
    var W0 = img.naturalWidth, H0 = img.naturalHeight;
    var cx0 = O.crop.x0*W0, cy0 = O.crop.y0*H0, cw0 = (O.crop.x1-O.crop.x0)*W0, ch0 = (O.crop.y1-O.crop.y0)*H0;
    var outW = O.outW, outH = Math.round(ch0 * outW / cw0);
    var c = document.createElement("canvas"); c.width = outW; c.height = outH;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.filter = "blur(" + O.blur + "px)";
    ctx.drawImage(img, cx0, cy0, cw0, ch0, 0, 0, outW, outH);
    ctx.filter = "none";
    var im = ctx.getImageData(0, 0, outW, outH);
    var d = im.data;
    // 1) 抠白底：从四边连通的白
    var nearWhite = function (i) { return d[i] > 234 && d[i+1] > 234 && d[i+2] > 234; };
    var seen = new Uint8Array(outW*outH), st = [];
    for (var x = 0; x < outW; x++) { st.push(x, (outH-1)*outW + x); }
    for (var y = 0; y < outH; y++) { st.push(y*outW, y*outW + outW - 1); }
    var removed = 0;
    while (st.length) {
      var p = st.pop(); if (seen[p]) continue; seen[p] = 1;
      var i0 = p*4;
      if (!nearWhite(i0)) continue;
      d[i0+3] = 0; removed++;
      var px = p % outW, py = (p - px) / outW;
      if (px > 0) st.push(p-1); if (px < outW-1) st.push(p+1);
      if (py > 0) st.push(p-outW); if (py < outH-1) st.push(p+outW);
    }
    // 2) 抹嘴：在原唇位置泛洪刷成上方肤色
    var mx = Math.round((O.mouth.cx - O.crop.x0)/(O.crop.x1-O.crop.x0) * outW);
    var my = Math.round((O.mouth.cy - O.crop.y0)/(O.crop.y1-O.crop.y0) * outH);
    // 取唇上、下紧邻的亮肤色（避开鼻影），取亮度最高的一组
    var skin = [0,0,0], n = 0;
    var spreads = [-0.03, -0.015, 0, 0.015, 0.03];
    var bands = [-0.012, 0.028];
    spreads.forEach(function (sp) {
      bands.forEach(function (bd) {
        var sx = mx + Math.round(outW*sp), sy = my + Math.round(outH*bd), ii = (sy*outW+sx)*4;
        if (sx < 0 || sx >= outW || sy < 0 || sy >= outH || d[ii+3] === 0) return;
        if (lum([d[ii], d[ii+1], d[ii+2]]) < 165) return;   // 太暗（阴影/唇）不要
        skin[0]+=d[ii]; skin[1]+=d[ii+1]; skin[2]+=d[ii+2]; n++;
      });
    });
    skin = n ? [skin[0]/n, skin[1]/n, skin[2]/n] : [248,211,176];
    var patched = floodRecolor(im, outW, outH, mx, my, outW*0.115, outH*0.055, 190, skin);
    // 3) 抹掉手里的深色物件，刷成周围衬衫色
    var ox = Math.round((O.obj.cx - O.crop.x0)/(O.crop.x1-O.crop.x0) * outW);
    var oy = Math.round((O.obj.cy - O.crop.y0)/(O.crop.y1-O.crop.y0) * outH);
    // 物件周围一圈的浅色（衬衫），排除深色物件本身和肤色
    var shirt = [0,0,0], m = 0;
    for (var ry = -0.11; ry <= 0.02; ry += 0.02) {
      for (var rx = -0.10; rx <= 0.10; rx += 0.02) {
        var qx = ox + Math.round(outW*rx), qy = oy + Math.round(outH*ry);
        if (qx < 0 || qx >= outW || qy < 0 || qy >= outH) continue;
        var jj = (qy*outW+qx)*4, pp = [d[jj], d[jj+1], d[jj+2]];
        if (d[jj+3] === 0 || lum(pp) < 165) continue;
        if (pp[0] > pp[2] + 25) continue;                    // 肤色排除
        shirt[0]+=pp[0]; shirt[1]+=pp[1]; shirt[2]+=pp[2]; m++;
      }
    }
    shirt = m ? [shirt[0]/m, shirt[1]/m, shirt[2]/m] : [214,214,236];
    floodRecolor(im, outW, outH, ox, oy, outW*0.11, outH*0.10, 150, shirt);
    ctx.putImageData(im, 0, 0);
    // 4) 画话筒（网头在下巴下方，手柄落在双手之间）
    var micR = O.mic.r * outW;
    drawMic(ctx, outW*0.487, oy - outH*0.02, micR, O.mic.tilt);
    // 5) 量化 + 众数滤波
    var im2 = ctx.getImageData(0, 0, outW, outH), d2 = im2.data;
    var samples = [];
    for (var yy = 0; yy < outH; yy += 2) for (var xx = 0; xx < outW; xx += 2) {
      var k2 = (yy*outW+xx)*4;
      if (d2[k2+3] > 0) samples.push([d2[k2], d2[k2+1], d2[k2+2]]);
    }
    var pal = medianCut(samples, O.k);
    var idx = new Uint8Array(outW*outH);
    for (var p2 = 0; p2 < outW*outH; p2++) {
      var i2 = p2*4;
      if (d2[i2+3] === 0) { idx[p2] = 255; continue; }
      var col = [d2[i2], d2[i2+1], d2[i2+2]], best = 1e9, bi = 0;
      for (var kk = 0; kk < pal.length; kk++) { var dd = dist(col, pal[kk]); if (dd < best) { best = dd; bi = kk; } }
      idx[p2] = bi;
    }
    for (var pass = 0; pass < 2; pass++) {
      var nxt = idx.slice();
      for (var y3 = 1; y3 < outH-1; y3++) for (var x3 = 1; x3 < outW-1; x3++) {
        var p3 = y3*outW + x3; if (idx[p3] === 255) continue;
        var cnt = {};
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var v = idx[(y3+dy)*outW + (x3+dx)]; if (v === 255) continue;
          cnt[v] = (cnt[v] || 0) + 1;
        }
        var bestK = idx[p3], bestC = 0;
        Object.keys(cnt).forEach(function (k4) { if (cnt[k4] > bestC) { bestC = cnt[k4]; bestK = +k4; } });
        nxt[p3] = bestK;
      }
      idx = nxt;
    }
    for (var p4 = 0; p4 < outW*outH; p4++) {
      var i4 = p4*4;
      if (idx[p4] === 255) { d2[i4+3] = 0; continue; }
      var cc = pal[idx[p4]];
      d2[i4] = cc[0]; d2[i4+1] = cc[1]; d2[i4+2] = cc[2]; d2[i4+3] = 255;
    }
    ctx.putImageData(im2, 0, 0);
    // 6) 导出：页面用 WebP（无嘴），课件用两张 PNG（画上闭口/张口）
    var webp = c.toDataURL("image/webp", 0.95);
    var dw = 640, dh = Math.round(outH * dw / outW);
    function deckPng(open) {
      var c2 = document.createElement("canvas"); c2.width = dw; c2.height = dh;
      var x2 = c2.getContext("2d"); x2.imageSmoothingQuality = "high";
      x2.drawImage(c, 0, 0, outW, outH, 0, 0, dw, dh);
      drawMouth(x2, dw*((O.mouth.cx-O.crop.x0)/(O.crop.x1-O.crop.x0)), dh*((O.mouth.cy-O.crop.y0)/(O.crop.y1-O.crop.y0)), dw*0.16, open);
      return c2.toDataURL("image/png");
    }
    // 页面用的矢量嘴：同一套坐标，颜色取本地调色后的肤色/唇色
    var mouthSvg = '<svg id="mouth" viewBox="0 0 100 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
      + '<defs><linearGradient id="lipTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + O.lipTop + '"/><stop offset="100%" stop-color="#98434c"/></linearGradient>'
      + '<linearGradient id="lipBottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a94d55"/><stop offset="100%" stop-color="' + O.lipBottom + '"/></linearGradient></defs>'
      + '<g class="open"><path d="M14 20 Q50 16 86 20 Q50 40 14 20 Z" fill="' + O.openDark + '"/>'
      + '<path d="M16 20 Q50 17 84 20 L82 24.5 Q50 21.5 18 24.5 Z" fill="' + O.teeth + '"/>'
      + '<ellipse cx="50" cy="33" rx="19" ry="6" fill="' + O.tongue + '"/></g>'
      + '<g class="lipdown"><path d="M13 20 Q50 30 87 20 Q50 39 13 20 Z" fill="url(#lipBottom)"/>'
      + '<path d="M13 20 Q50 28 87 20" fill="none" stroke="#8d3b41" stroke-width="1.3" stroke-linecap="round"/></g>'
      + '<g class="lipup"><path d="M12 20 Q30 10 50 11.5 Q70 10 88 20 Q50 25 12 20 Z" fill="url(#lipTop)"/>'
      + '<path d="M12 20 Q50 13.5 88 20" fill="none" stroke="#8d3b41" stroke-width="1.3" stroke-linecap="round"/></g></svg>';
    return {
      webp: webp, pngClosed: deckPng(0.08), pngOpen: deckPng(1), mouthSvg: mouthSvg,
      size: [outW, outH], colors: pal.length, bgRemoved: removed, mouthPatched: patched, objPatched: 0,
      mouthPct: [+(((O.mouth.cx-O.crop.x0)/(O.crop.x1-O.crop.x0))*100).toFixed(2), +(((O.mouth.cy-O.crop.y0)/(O.crop.y1-O.crop.y0))*100).toFixed(2)],
      skin: hex(skin), shirt: hex(shirt), micR: Math.round(micR)
    };
  }
  return { run: run, opts: O };
})();
