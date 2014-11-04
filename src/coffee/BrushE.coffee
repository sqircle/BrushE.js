CanvasSurface = require("./brushe/CanvasSurface")
Brush         = require("./brushe/Brush")
Controls      = require("./brushe/Controls")

class BrushE
  constructor: (canvas, brush) ->
    @surface  = new CanvasSurface(canvas)
    @brush    = new Brush(brush, @surface)
    @controls = new Controls(@surface, @brush)

  setBrush: (brush) ->
    @brush = null
    @brush = new Brush(brush, @surface)
    @controls.setBrush(@brush)

module.exports = BrushE
