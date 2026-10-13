/* Shared camera barcode scanner.
 *
 * LBScan.start(video, onCode) -> Promise<stopFn>
 *   - uses the phone's native BarcodeDetector when it works (only the formats
 *     that this phone supports - asking for an unsupported one used to make the
 *     whole scanner fail);
 *   - otherwise falls back to the ZXing library, so it also works on iPhone and
 *     on browsers/apps without BarcodeDetector.
 * Rejects with Error whose .code is one of:
 *   'nocamera' (permission / no camera), 'insecure' (not https), 'noscanner'.
 */
(function(){
  var WANT = ['code_128','ean_13','ean_8','upc_a','upc_e','qr_code'];
  var ZX_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  var zxPromise = null;

  function err(code, msg){ var e = new Error(msg || code); e.code = code; return e; }

  function loadZXing(){
    if(window.ZXing) return Promise.resolve(window.ZXing);
    if(zxPromise) return zxPromise;
    zxPromise = new Promise(function(res, rej){
      var s = document.createElement('script');
      s.src = ZX_URL;
      s.onload = function(){ window.ZXing ? res(window.ZXing) : rej(err('noscanner')); };
      s.onerror = function(){ zxPromise = null; rej(err('noscanner', 'Could not load the scanner library (internet?)')); };
      document.head.appendChild(s);
    });
    return zxPromise;
  }

  async function openCamera(){
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      throw err(window.isSecureContext === false ? 'insecure' : 'nocamera');
    }
    var tries = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: 'environment' }, audio: false },
      { video: true, audio: false }
    ];
    var last;
    for(var i = 0; i < tries.length; i++){
      try{ return await navigator.mediaDevices.getUserMedia(tries[i]); }catch(e){ last = e; if(e && e.name === 'NotAllowedError') break; }
    }
    throw err('nocamera', last && last.message);
  }

  async function nativeDetector(){
    if(!('BarcodeDetector' in window)) return null;
    try{
      var formats = WANT;
      if(typeof BarcodeDetector.getSupportedFormats === 'function'){
        var sup = await BarcodeDetector.getSupportedFormats();
        formats = WANT.filter(function(f){ return sup.indexOf(f) !== -1; });
        if(!formats.length) return null;
      }
      return new BarcodeDetector({ formats: formats });
    }catch(e){ return null; }
  }

  async function start(video, onCode, onFail){
    var stream = await openCamera();
    var alive = true;
    function stop(){
      alive = false;
      try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
      try{ video.srcObject = null; }catch(e){}
    }
    video.setAttribute('playsinline', ''); video.muted = true;
    video.srcObject = stream;
    try{ await video.play(); }catch(e){}

    // keep the picture sharp (the phone otherwise often leaves it slightly out of focus)
    try{
      var tr = stream.getVideoTracks()[0], caps = tr.getCapabilities ? tr.getCapabilities() : {};
      if(caps.focusMode && caps.focusMode.indexOf('continuous') !== -1) await tr.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }catch(e){}

    var done = false;
    function found(v){ if(done || !alive || !v) return; done = true; stop(); onCode(String(v)); }

    var det = await nativeDetector();
    var zxStarted = false;
    function startZXing(){
      if(zxStarted || !alive) return; zxStarted = true;
      loadZXing().then(function(Z){
        if(!alive) return;
        var hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.QR_CODE]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        var reader = new Z.MultiFormatReader(); reader.setHints(hints);
        var canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        (function loop(){
          if(!alive) return;
          try{
            if(video.videoWidth){
              var w = Math.min(video.videoWidth, 1280), h = Math.round(video.videoHeight * w / video.videoWidth);
              canvas.width = w; canvas.height = h;
              ctx.drawImage(video, 0, 0, w, h);
              var bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
              var res = reader.decode(bmp);
              if(res){ found(res.getText()); return; }
            }
          }catch(e){ /* no code in this frame */ }
          setTimeout(loop, 150);
        })();
      }).catch(function(){ if(!det && onFail) onFail(err('noscanner')); });
    }

    if(det){
      (async function loop(){
        while(alive){
          try{ var r = await det.detect(video); if(r && r.length){ found(r[0].rawValue); return; } }catch(e){}
          await new Promise(function(r){ setTimeout(r, 120); });
        }
      })();
      // the phone's own scanner sometimes misses a code that ZXing reads: run both if nothing is read in 2.5 s
      setTimeout(startZXing, 2500);
    }else{
      startZXing();
    }
    return stop;
  }

  function message(e){
    var c = e && e.code;
    if(c === 'insecure') return 'The camera only works on the secure (https) site.';
    if(c === 'noscanner') return 'Could not load the scanner. Check your internet and try again.';
    return 'Could not open the camera. Allow camera permission for the app / browser, then try again.';
  }

  window.LBScan = { start: start, message: message };
})();
