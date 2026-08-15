var Adjacency = (function(){

  var STEP = 15;

  function buildMatrix(n, circular){
    var A = [];
    for(var i = 0; i < n; i++){
      A.push(new Array(n).fill(0));
      var prev = i - 1;
      var next = i + 1;
      if(prev >= 0) A[i][prev] += 1;
      else if(circular && n > 1) A[i][(prev + n) % n] += 1;
      if(next < n) A[i][next] += 1;
      else if(circular && n > 1) A[i][next % n] += 1;
    }
    return A;
  }

  function gaussianSolve(A, b){
    var n = b.length;
    var M = A.map(function(row, i){ return row.concat([b[i]]); });
    var where = new Array(n).fill(-1);
    var row = 0;

    for(var col = 0; col < n && row < n; col++){
      var sel = row;
      for(var i = row; i < n; i++){
        if(Math.abs(M[i][col]) > Math.abs(M[sel][col])) sel = i;
      }
      if(Math.abs(M[sel][col]) < 1e-9) continue;
      var tmp = M[sel]; M[sel] = M[row]; M[row] = tmp;
      where[col] = row;
      for(var k = 0; k < n; k++){
        if(k === row) continue;
        var f = M[k][col] / M[row][col];
        if(!f) continue;
        for(var j = col; j <= n; j++) M[k][j] -= f * M[row][j];
      }
      row++;
    }

    var x = new Array(n).fill(0);
    for(var c = 0; c < n; c++){
      if(where[c] !== -1) x[c] = M[where[c]][n] / M[where[c]][c];
    }

    var maxError = 0;
    for(var r = 0; r < n; r++){
      var sum = 0;
      for(var j2 = 0; j2 < n; j2++) sum += A[r][j2] * x[j2];
      maxError = Math.max(maxError, Math.abs(sum - b[r]));
    }

    var free = 0;
    for(var c2 = 0; c2 < n; c2++) if(where[c2] === -1) free++;

    return { x: x, maxError: maxError, free: free };
  }

  function snap(value){
    var rounded = Math.round(value / STEP) * STEP;
    return rounded < 0 ? 0 : rounded;
  }

  function attempt(received, circular){
    var n = received.length;
    if(!n) return { ok: false };
    var solved = gaussianSolve(buildMatrix(n, circular), received);
    var gives = solved.x.map(snap);

    var predicted = computeReceived(gives, circular);
    var exact = true;
    var totalError = 0;
    for(var i = 0; i < n; i++){
      var diff = Math.abs(predicted[i] - received[i]);
      totalError += diff;
      if(diff > 0.5) exact = false;
    }

    return {
      ok: exact,
      gives: gives,
      predicted: predicted,
      totalError: totalError,
      free: solved.free,
      circular: circular
    };
  }

  function computeReceived(gives, circular){
    var n = gives.length;
    var out = new Array(n).fill(0);
    for(var i = 0; i < n; i++){
      var prev = i - 1;
      var next = i + 1;
      if(prev >= 0) out[i] += gives[prev];
      else if(circular && n > 1) out[i] += gives[(prev + n) % n];
      if(next < n) out[i] += gives[next];
      else if(circular && n > 1) out[i] += gives[next % n];
    }
    return out;
  }

  function infer(received){
    var circularTry = attempt(received, true);
    var linearTry = attempt(received, false);

    if(circularTry.ok && !linearTry.ok) return circularTry;
    if(linearTry.ok && !circularTry.ok) return linearTry;
    if(circularTry.ok && linearTry.ok){
      return circularTry.totalError <= linearTry.totalError ? circularTry : linearTry;
    }
    return circularTry.totalError <= linearTry.totalError ? circularTry : linearTry;
  }

  function levelOf(give){
    return Math.round(give / STEP);
  }

  function giveForLevel(level){
    return level * STEP;
  }

  return {
    STEP: STEP,
    infer: infer,
    computeReceived: computeReceived,
    levelOf: levelOf,
    giveForLevel: giveForLevel
  };
})();

if(typeof module !== "undefined") module.exports = Adjacency;
