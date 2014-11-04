class Controls
  constructor: (@surface, @brush) ->
    @t1        = null
    @canvas    = @surface.canvas
    @canvasPos = @surface.pos

    @iPad  = navigator.userAgent.match(/iPad/i) != null
    @lastX = 0
    @lastY = 0

    @canvas.addEventListener "mousedrag", @mousedrag
    @canvas.addEventListener "mousedown", @mousedown
    @canvas.addEventListener "mouseup",   @mouseup

    @canvas.addEventListener "touchmove",  @mousedrag, false 
    @canvas.addEventListener "touchstart", @mousedown, false
    @canvas.addEventListener "touchend",   @mouseup,   false

  setBrush: (brush) ->
    @brush = brush

  mousedown: (evt) =>
    if @iPad
      te = evt.touches.item(0)
      @lastX = te.clientX - @canvasPos.x
      @lastY = te.clientY - @canvasPos.y
      @canvas.touchmove = @mousedrag
    else
      @canvas.onmousemove = @mousedrag
      @lastX = evt.clientX - @canvasPos.x
      @lastY = evt.clientY - @canvasPos.y

    @t1 = (new Date()).getTime()
    @brush.new_stroke @lastX, @lastY
    @mousedrag(evt)

  mouseup: (evt) =>
    @canvas.onmousemove = null
  
  # TODO Handle erasure
  mousedrag: (evt) =>
    plugin        = document.embeds["wacom-plugin"]
    curX          = 0
    curY          = 0
    pressure      = undefined
    isEraser      = undefined
    mousepressure = document.getElementById("mousepressure").value

    if plugin
      pressure = plugin.pressure
      isEraser = plugin.isEraser
      isEraser = false  unless isEraser?
      pressure = mousepressure / 100 if not pressure? or pressure is 0 #for mouse
    else
      pressure = pressure = mousepressure / 100 #for mouse
      isEraser = false

    if @iPad
      te   = evt.touches.item(0)
      curX = te.clientX - @canvasPos.x
      curY = te.clientY - @canvasPos.y
      evt.preventDefault()
      pressure = mousepressure / 100
      isEraser = false
    else
      curX = evt.clientX - @canvasPos.x
      curY = evt.clientY - @canvasPos.y

    @brush.stroke_to @surface, curX, curY, pressure, 90, 0, ((new Date()).getTime() - @t1) / 1000
    @lastX = curX
    @lastY = curY

module.exports = Controls
