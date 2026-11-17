/* 도시 산책자의 N페이지 — 작은 소리 재생기
   Web Audio로 녹음 파일의 원하는 구간만 재생하고, 앞뒤에 짧은 페이드를 넣는다.
   NPA.play(src, 시작초, 끝초|null, { fadeIn, fadeOut, onend }) · NPA.chain([{src,a,b}], { xf, onstep, onend }) · NPA.stop() · NPA.pos() · NPA.load(src) */
(function () {
  var ctx = null, cache = {}, cur = null;
  function C() {
    if (!ctx) { var A = window.AudioContext || window.webkitAudioContext; ctx = new A(); }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  function load(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) { return r.arrayBuffer(); }).then(function (b) {
        return new Promise(function (res, rej) { C().decodeAudioData(b, res, rej); });
      });
      cache[url].catch(function () { delete cache[url]; });
    }
    return cache[url];
  }
  function stop() {
    var c = cur; cur = null;
    if (!c) return;
    (c.timers || []).forEach(clearTimeout);
    try {
      var t = ctx.currentTime;
      if (c.m) {
        c.m.gain.cancelScheduledValues(t);
        c.m.gain.setValueAtTime(c.m.gain.value, t);
        c.m.gain.linearRampToValueAtTime(0, t + 0.12);
        (c.srcs || []).forEach(function (s) { try { s.stop(t + 0.15); } catch (e) {} });
      } else if (c.s) {
        c.g.gain.cancelScheduledValues(t);
        c.g.gain.setValueAtTime(c.g.gain.value, t);
        c.g.gain.linearRampToValueAtTime(0, t + 0.08);
        c.s.stop(t + 0.1);
      }
    } catch (e) {}
  }
  function curve(up) {
    var a = new Float32Array(64);
    for (var i = 0; i < 64; i++) { var p = i / 63; a[i] = up ? Math.sin(p * Math.PI / 2) : Math.cos(p * Math.PI / 2); }
    return a;
  }
  /* 여러 구간을 겹쳐 잇기: items = [{src, a, b}], o = { xf: 겹치는 초, first: 첫 페이드인, last: 끝 페이드아웃, onstep(k), onend } */
  function chain(items, o) {
    o = o || {};
    stop();
    var tok = { srcs: [], timers: [] }; cur = tok; C();
    return Promise.all(items.map(function (it) { return load(it.src); })).then(function (bufs) {
      if (cur !== tok) return null;
      var m = ctx.createGain(); m.connect(ctx.destination); tok.m = m;
      var n = items.length, xf = o.xf || 2.5;
      var d = items.map(function (it, k) {
        var e = Math.min(it.b == null ? bufs[k].duration : it.b, bufs[k].duration);
        return Math.max(0.2, e - it.a);
      });
      var x = []; for (var k = 0; k < n - 1; k++) x.push(Math.min(xf, d[k] / 2, d[k + 1] / 2));
      var T = ctx.currentTime + 0.05, now = ctx.currentTime;
      items.forEach(function (it, k) {
        var fi = k === 0 ? Math.min(o.first || 0.5, d[k] / 3) : x[k - 1];
        var fo = k === n - 1 ? Math.min(o.last || 1.5, d[k] / 3) : x[k];
        var s = ctx.createBufferSource(); s.buffer = bufs[k];
        var g = ctx.createGain(); s.connect(g); g.connect(m);
        g.gain.setValueAtTime(0, T);
        g.gain.setValueCurveAtTime(curve(true), T, fi);
        g.gain.setValueCurveAtTime(curve(false), T + d[k] - fo, fo);
        s.start(T, it.a, d[k]);
        tok.srcs.push(s);
        if (o.onstep) tok.timers.push(setTimeout((function (kk) { return function () { if (cur === tok) o.onstep(kk); }; })(k), Math.max(0, (T - now) * 1000)));
        if (k === n - 1) s.onended = function () { if (cur === tok) { cur = null; if (o.onend) o.onend(); } };
        T = T + d[k] - (k < n - 1 ? x[k] : 0);
      });
      return tok;
    }, function () { if (cur === tok) { cur = null; if (o.onend) o.onend(); } return null; });
  }
  function play(url, a, b, o) {
    o = o || {};
    stop();
    var tok = {}; cur = tok; C();
    return load(url).then(function (buf) {
      if (cur !== tok) return null;
      var end = Math.min(b == null ? buf.duration : b, buf.duration);
      var d = Math.max(0.05, end - a);
      var s = ctx.createBufferSource(); s.buffer = buf;
      var g = ctx.createGain(); s.connect(g); g.connect(ctx.destination);
      var t = ctx.currentTime + 0.03, fi = Math.min(o.fadeIn || 0, d / 3), fo = Math.min(o.fadeOut || 0, d / 3);
      g.gain.setValueAtTime(fi ? 0 : 1, t);
      if (fi) g.gain.linearRampToValueAtTime(1, t + fi);
      if (fo) { g.gain.setValueAtTime(1, t + d - fo); g.gain.linearRampToValueAtTime(0, t + d); }
      s.start(t, a, d);
      tok.s = s; tok.g = g; tok.t0 = t; tok.a = a; tok.d = d;
      s.onended = function () { if (cur === tok) { cur = null; if (o.onend) o.onend(); } };
      return tok;
    }, function () { if (cur === tok) { cur = null; if (o.onend) o.onend(); } return null; });
  }
  function pos() { return cur && cur.s ? Math.min(cur.d, Math.max(0, ctx.currentTime - cur.t0)) + cur.a : null; }
  window.NPA = { load: load, play: play, chain: chain, stop: stop, pos: pos, playing: function () { return !!cur; } };
})();
