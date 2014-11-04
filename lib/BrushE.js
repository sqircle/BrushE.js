var Brush, BrushE, CanvasSurface, Controls;

CanvasSurface = require("./brushe/CanvasSurface");

Brush = require("./brushe/Brush");

Controls = require("./brushe/Controls");

BrushE = (function() {
  function BrushE(canvas, brush) {
    this.surface = new CanvasSurface(canvas);
    this.brush = new Brush(brush, this.surface);
    this.controls = new Controls(this.surface, this.brush);
  }

  BrushE.prototype.setBrush = function(brush) {
    this.brush = null;
    this.brush = new Brush(brush, this.surface);
    return this.controls.setBrush(this.brush);
  };

  return BrushE;

})();

module.exports = BrushE;
