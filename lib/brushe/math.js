var math;

math = {
  hypotf: function(a, b) {
    return Math.sqrt(a * a + b * b);
  },
  hypot: function(a, b) {
    return Math.sqrt(a * a + b * b);
  },
  clamp: function(v, min, max) {
    if (v > max) {
      return max;
    } else if (v < min) {
      return min;
    } else {
      return v;
    }
  },
  fmodf: function(a, b) {
    return Math.floor(((a / b) % 1.0) * b);
  },
  rand_gauss: function() {
    var rand1, rand2, sum;
    sum = 0.0;
    rand1 = Math.ceil(Math.random() * 0x7ffffff);
    rand2 = Math.ceil(Math.random() * 0x7ffffff);
    sum += rand1 & 0x7fff;
    sum += (rand1 >> 16) & 0x7fff;
    sum += rand2 & 0x7fff;
    sum += (rand2 >> 16) & 0x7fff;
    return sum * 5.28596089837e-5 - 3.46410161514;
  },
  max3: function(a, b, c) {
    if (a > b) {
      return Math.max(a, c);
    } else {
      return Math.max(b, c);
    }
  },
  min3: function(a, b, c) {
    if (a < b) {
      return Math.min(a, c);
    } else {
      return Math.min(b, c);
    }
  }
};

module.exports = math;
