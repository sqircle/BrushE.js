ColorRGB = require("./ColorRGB")
clamp    = math.clamp
max3     = math.max3
min3     = math.min3

class ColorHSV
  constructor: (@h, @s, @v) ->
    @r = 0
    @g = 0
    @b = 0

  toRGB: ->
    h = @h
    s = @s
    v = @v

    h = h - Math.floor(h)
    s = clamp(s, 0.0, 1.0)
    v = clamp(v, 0.0, 1.0)

    hue = undefined

    if s is 0.0
      r = v
      g = v
      b = v
    else
      hue = h
      hue = 0.0  if hue is 1.0
      hue *= 6.0
      i = Math.floor(hue)
      f = hue - i
      w = v * (1.0 - s)
      q = v * (1.0 - (s * f))
      t = v * (1.0 - (s * (1.0 - f)))

      switch i
        when 0
          r = v
          g = t
          b = w
        when 1
          r = q
          g = v
          b = w
        when 2
          r = w
          g = v
          b = t
        when 3
          r = w
          g = q
          b = v
        when 4
          r = t
          g = w
          b = v
        when 5
          r = v
          g = w
          b = q
    
    new ColorRGB(r,g,b)

module.exports = ColorHSV
