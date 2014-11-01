ColorRGB = require("./ColorRGB")
clamp    = math.clamp
max3     = math.max3
min3     = math.min3

class ColorHSL
  constructor: (@h, @s, @l) ->

  toRGB: ->
    h = @h
    s = @s
    l = @l

    h = h - Math.floor(h)
    s = clamp(s, 0.0, 1.0)
    l = clamp(l, 0.0, 1.0)

    if s is 0
      r = l
      g = l
      b = l
    else
      m1 = undefined
      m2 = undefined

      if l <= 0.5
        m2 = l * (1.0 + s)
      else
        m2 = l + s - l * s

      m1 = 2.0 * l - m2
      r = ColorHSL.hsl_value(m1, m2, h * 6.0 + 2.0)
      g = ColorHSL.hsl_value(m1, m2, h * 6.0)
      b = ColorHSL.hsl_value(m1, m2, h * 6.0 - 2.0)
    
    new ColorRGB(r,g,b)

  @hsl_value: (n1, n2, hue) ->
    val = undefined
    
    if hue > 6.0
      hue -= 6.0
    else 
      hue += 6.0  if hue < 0.0

    if hue < 1.0
      val = n1 + (n2 - n1) * hue
    else if hue < 3.0
      val = n2
    else if hue < 4.0
      val = n1 + (n2 - n1) * (4.0 - hue)
    else
      val = n1

    val

module?.exports = ColorHSL
