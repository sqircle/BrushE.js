var ControlPoints, Mapping, assert;

ControlPoints = require('./ControlPoints');

assert = require('./utils').assert;

Mapping = (function() {
  function Mapping(inputcount) {
    var i;
    this.inputs = inputcount;
    this.inputs_used = 0;
    this.pointsList = new Array(inputcount);
    i = 0;
    while (i < inputcount) {
      this.pointsList[i] = new ControlPoints();
      i++;
    }
    this.base_value = 0;
  }

  Mapping.prototype.set_n = function(input, n) {
    var p;
    p = this.pointsList[input];
    if (n !== 0 && p.n === 0) {
      inputs_used++;
    }
    if (n === 0 && p.n !== 0) {
      inputs_used--;
    }
    return p.n = n;
  };

  Mapping.prototype.set_point = function(input, index, x, y) {
    var p;
    p = this.pointsList[input];
    if (index > 0) {
      assert(x >= p.xvalues[index - 1], " x must > p->xvalues[index-1]");
    }
    p.xvalues[index] = x;
    return p.yvalues[index] = y;
  };

  Mapping.prototype.is_constant = function() {
    return this.inputs_used === 0;
  };

  Mapping.prototype.calculate = function(data) {
    var i, j, p, result, x, x0, x1, y, y0, y1;
    result = this.base_value;
    if (this.inputs_used === 0) {
      return result;
    }
    j = 0;
    while (j < this.inputs) {
      p = this.pointsList[j];
      if (p.n) {
        y = void 0;
        x = data[j];
        x0 = p.xvalues[0];
        y0 = p.yvalues[0];
        x1 = p.xvalues[1];
        y1 = p.yvalues[1];
        i = 2;
        while (i < p.n && x > x1) {
          x0 = x1;
          y0 = y1;
          x1 = p.xvalues[i];
          y1 = p.yvalues[i];
          i++;
        }
        if (x0 === x1) {
          y = y0;
        } else {
          y = (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
        }
        result += y;
      }
      j++;
    }
    return result;
  };

  return Mapping;

})();

module.exports = Mapping;
