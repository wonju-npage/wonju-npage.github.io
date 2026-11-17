/* 도시 산책자의 N페이지 — 작은 소리 재생기
   Web Audio로 녹음 파일의 원하는 구간만 재생하고, 앞뒤에 짧은 페이드를 넣는다.
   NPA.play(src, 시작초, 끝초|null, { fadeIn, fadeOut, onend }) · NPA.stop() · NPA.pos() · NPA.load(src) */
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
    if (c && c.s) {
      try {
        var t = ctx.currentTime;
        c.g.gain.cancelScheduledValues(t);
        c.g.gain.setValueAtTime(c.g.gain.value, t);
        c.g.gain.linearRampToValueAtTime(0, t + 0.08);
        c.s.stop(t + 0.1);
      } catch (e) {}
    }
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
  window.NPA = { load: load, play: play, stop: stop, pos: pos, playing: function () { return !!cur; } };
})();
