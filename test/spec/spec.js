(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
require("./ControlPoints_spec");



},{"./ControlPoints_spec":3}],2:[function(require,module,exports){
var ControlPoints;

ControlPoints = (function() {
  function ControlPoints() {
    this.xvalues = new Array(8);
    this.yvalues = new Array(8);
    this.n = 0;
  }

  return ControlPoints;

})();

module.exports = ControlPoints;

},{}],3:[function(require,module,exports){
var ControlPoints;

ControlPoints = require("../lib/brushe/ControlPoints");

describe("ControlPoints", function() {
  return it("should create a new ControlPoints", function() {
    var controlPoints;
    controlPoints = new ControlPoints();
    controlPoints.xvalues.length.should.equal(8);
    controlPoints.yvalues.length.should.equal(8);
    return controlPoints.n.should.equal(0);
  });
});



},{"../lib/brushe/ControlPoints":2}]},{},[1]);
