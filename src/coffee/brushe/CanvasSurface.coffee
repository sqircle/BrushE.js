findPos = require('./utils').findPos

class CanvasSurface 
  constructor: (@canvas) ->
    @r = 0
    @g = 0
    @b = 0

    @dab_count      = 0 
    @getcolor_count = 0

    @context = @canvas.getContext("2d")
    @context.fillStyle = "rgba(255,255,255,255)"
    @context.fillRect 0, 0, @canvas.clientWidth, @canvas.clientHeight
    @pos = findPos(@canvas)

  draw_dab: (x, y, radius, color_r, color_g, color_b, opaque, hardness, alpha_eraser, aspect_ratio, angle) ->
    return if opaque is 0

    @dab_count++

    height = (radius * 2) / aspect_ratio
    width  = radius * 2 * 1.3

    @context.beginPath()
    @context.save()

    rr = Math.floor(color_r * 256)
    gg = Math.floor(color_g * 256)
    bb = Math.floor(color_b * 256)

    @context.translate x, y

    if hardness < 1
      g1 = @context.createRadialGradient(0, 0, 0, 0, 0, radius)
      g1.addColorStop hardness, "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")"
      g1.addColorStop 1, "rgba(" + rr + "," + gg + "," + bb + ",0)"
    else
      g1 = "rgba(" + rr + "," + gg + "," + bb + "," + opaque + ")"

    @context.rotate 90 + angle
    @context.moveTo 0, -height / 2 
    @context.bezierCurveTo width / 2, -height / 2, width / 2, height / 2, 0, height / 2 
    @context.bezierCurveTo -width / 2, height / 2, -width / 2, -height / 2, 0, -height / 2
    @context.fillStyle = g1
    @context.fill()
    @context.restore()
    @context.closePath()

  get_color: (x, y, radius) ->
    @getcolor_count++
    imgd = @context.getImageData(x, y, 1, 1)
    pix = imgd.data
    @r = pix[0] / 255
    @g = pix[1] / 255
    @b = pix[2] / 255
    @a = pix[3] / 255

module.exports = CanvasSurface
