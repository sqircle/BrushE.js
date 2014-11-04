var AssertException, utils;

AssertException = require("./AssertException");

utils = {
  assert: function(exp, message) {
    if (!exp) {
      throw new AssertException(message);
    }
  },
  findPos: function(obj) {
    var curleft, curtop;
    curleft = curtop = 0;
    if (obj.offsetParent) {
      curleft = obj.offsetLeft;
      curtop = obj.offsetTop;
      while (obj = obj.offsetParent) {
        curleft += obj.offsetLeft;
        curtop += obj.offsetTop;
      }
    }
    return {
      x: curleft,
      y: curtop
    };
  }
};

module.exports = utils;
