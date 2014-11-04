var CanvasSurface, findPos;

findPos = require('./utils').findPos;

CanvasSurface = (function() {
  function CanvasSurface(canvas) {
    this.canvas = canvas;
    this.r = 0;
    this.g = 0;
    this.b = 0;
    this.dab_count = 0;
    this.getcolor_count = 0;
    this.context = this.canvas.getContext("2d");
    this.context.fillStyle = "rgba(255,255,255,255)";
    this.context.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    this.pos = findPos(this.canvas);
  }

  CanvasSurface.prototype.draw_dab = function(x, y, radius, color_r, color_g, color_b, opaque, hardness, alpha_eraser, aspect_ratio, angle) {
    var bb, g1, gg, height, rr, width;
    if (opaque === 0) {
      return;
    }
    this.dab_count++;
    height = (radius * 2) / aspect_ratio;
    width = radius * 2 * 1.3;
    this.context.beginPath();
    this.context.save();
    rr = Math.floor(color_r * 256);
    gg = Math.floor(color_g * 256);
    bb = Math.floor(color_b * 256);
    this.context.translate(x, y);
    if (hardness < 1) {
      g1 = this.context.createRadialGradient(0, 0, 0, 0, 0, radius);
      g1.addColorStop(hardness, "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")");
      g1.addColorStop(1, "rgba(" + rr + "," + gg + "," + bb + ",0)");
    } else {
      g1 = "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")";
    }
    this.context.rotate(90 + angle);
    this.context.moveTo(0, -height / 2);
    this.context.bezierCurveTo(width / 2, -height / 2, width / 2, height / 2, 0, height / 2);
    this.context.bezierCurveTo(-width / 2, height / 2, -width / 2, -height / 2, 0, -height / 2);
    this.context.fillStyle = g1;
    this.context.fill();
    this.context.restore();
    return this.context.closePath();
  };

  CanvasSurface.prototype.get_color = function(x, y, radius) {
    var imgd, pix;
    this.getcolor_count++;
    imgd = this.context.getImageData(x, y, 1, 1);
    pix = imgd.data;
    this.r = pix[0] / 255;
    this.g = pix[1] / 255;
    this.b = pix[2] / 255;
    return this.a = pix[3] / 255;
  };

  return CanvasSurface;

})();

module.exports = CanvasSurface;
