var Controls,
  __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

Controls = (function() {
  function Controls(surface, brush) {
    this.surface = surface;
    this.brush = brush;
    this.mousedrag = __bind(this.mousedrag, this);
    this.mouseup = __bind(this.mouseup, this);
    this.mousedown = __bind(this.mousedown, this);
    this.t1 = null;
    this.canvas = this.surface.canvas;
    this.canvasPos = this.surface.pos;
    this.iPad = navigator.userAgent.match(/iPad/i) !== null;
    this.lastX = 0;
    this.lastY = 0;
    this.canvas.addEventListener("mousedrag", this.mousedrag);
    this.canvas.addEventListener("mousedown", this.mousedown);
    this.canvas.addEventListener("mouseup", this.mouseup);
    this.canvas.addEventListener("touchmove", this.mousedrag, false);
    this.canvas.addEventListener("touchstart", this.mousedown, false);
    this.canvas.addEventListener("touchend", this.mouseup, false);
  }

  Controls.prototype.setBrush = function(brush) {
    return this.brush = brush;
  };

  Controls.prototype.mousedown = function(evt) {
    var te;
    if (this.iPad) {
      te = evt.touches.item(0);
      this.lastX = te.clientX - this.canvasPos.x;
      this.lastY = te.clientY - this.canvasPos.y;
      this.canvas.touchmove = this.mousedrag;
    } else {
      this.canvas.onmousemove = this.mousedrag;
      this.lastX = evt.clientX - this.canvasPos.x;
      this.lastY = evt.clientY - this.canvasPos.y;
    }
    this.t1 = (new Date()).getTime();
    this.brush.new_stroke(this.lastX, this.lastY);
    return this.mousedrag(evt);
  };

  Controls.prototype.mouseup = function(evt) {
    return this.canvas.onmousemove = null;
  };

  Controls.prototype.mousedrag = function(evt) {
    var curX, curY, isEraser, mousepressure, plugin, pressure, te;
    plugin = document.embeds["wacom-plugin"];
    curX = 0;
    curY = 0;
    pressure = void 0;
    isEraser = void 0;
    mousepressure = document.getElementById("mousepressure").value;
    if (plugin) {
      pressure = plugin.pressure;
      isEraser = plugin.isEraser;
      if (isEraser == null) {
        isEraser = false;
      }
      if ((pressure == null) || pressure === 0) {
        pressure = mousepressure / 100;
      }
    } else {
      pressure = pressure = mousepressure / 100;
      isEraser = false;
    }
    if (this.iPad) {
      te = evt.touches.item(0);
      curX = te.clientX - this.canvasPos.x;
      curY = te.clientY - this.canvasPos.y;
      evt.preventDefault();
      pressure = mousepressure / 100;
      isEraser = false;
    } else {
      curX = evt.clientX - this.canvasPos.x;
      curY = evt.clientY - this.canvasPos.y;
    }
    this.brush.stroke_to(this.surface, curX, curY, pressure, 90, 0, ((new Date()).getTime() - this.t1) / 1000);
    this.lastX = curX;
    return this.lastY = curY;
  };

  return Controls;

})();

module.exports = Controls;
