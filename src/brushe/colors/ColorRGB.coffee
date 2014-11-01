ColorHSV = require("./ColorHSV")
ColorHSL = require("./ColorHSL")
math     = require("../math")
clamp    = math.clamp
max3     = math.max3
min3     = math.min3

class ColorRGB
  constructor: (@r, @g, @b) ->
    @h = 0
    @s = 0
    @v = 0
    @l = 0
    
  toHSV: ->
    r = clamp(@r, 0.0, 1.0)
    g = clamp(@g, 0.0, 1.0)
    b = clamp(@b, 0.0, 1.0)

    h = @h
    s = @s
    v = @v

    max   = max3(r, g, b)
    min   = min3(r, g, b)
    v     = max
    delta = max - min

    if delta > 0.0001
      s = delta / max

      if r is max
        h = (g - b) / delta
        h += 6.0  if h < 0.0
      else if g is max
        h = 2.0 + (b - r) / delta
      else h = 4.0 + (r - g) / delta if b is max

      h /= 6.0
    else
      s = 0.0
      h = 0.0

    new ColorHSV(h,s,v)

  toHSL: ->
    r = @r
    g = @g
    b = @b

    r = clamp(r, 0.0, 1.0)
    g = clamp(g, 0.0, 1.0)
    b = clamp(b, 0.0, 1.0)
    max = max3(r, g, b)
    min = min3(r, g, b)
    l = (max + min) / 2.0

    if max is min
      s = 0.0
      h = 0.0
    else
      if l <= 0.5
        s = (max - min) / (max + min)
      else
        s = (max - min) / (2.0 - max - min)

      delta = max - min
      delta = 1.0  if delta is 0.0

      if r is max
        h = (g - b) / delta
      else if g is max
        h = 2.0 + (b - r) / delta
      else h = 4.0 + (r - g) / delta  if b is max

      h /= 6.0
      h += 1.0  if h < 0.0

    new ColorHSL(h,s,l)

module.exports = ColorRGB
