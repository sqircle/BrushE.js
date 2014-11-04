math =
  hypotf: (a, b) ->
    Math.sqrt a * a + b * b
    
  hypot: (a, b) ->
    Math.sqrt a * a + b * b

  clamp: (v, min, max) ->
    if v > max
      max
    else if v < min
      min
    else
      v

  fmodf: (a, b) ->
    Math.floor ((a / b) % 1.0) * b

  rand_gauss: ->
    sum = 0.0

    rand1 = Math.ceil(Math.random() * 0x7ffffff)
    rand2 = Math.ceil(Math.random() * 0x7ffffff)
    
    sum += rand1 & 0x7fff
    sum += (rand1 >> 16) & 0x7fff
    sum += rand2 & 0x7fff
    sum += (rand2 >> 16) & 0x7fff
    sum * 5.28596089837e-5 - 3.46410161514

  max3: (a, b, c) ->
    (if (a) > (b) then Math.max((a), (c)) else Math.max((b), (c)))

  min3: (a, b, c) ->
    (if (a) < (b) then Math.min((a), (c)) else Math.min((b), (c)))

module.exports = math
