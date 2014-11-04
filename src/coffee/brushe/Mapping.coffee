ControlPoints = require('./ControlPoints')
assert        = require('./utils').assert

class Mapping 
  constructor: (inputcount) ->
    @inputs       = inputcount
    @inputs_used  = 0 # optimization
    @pointsList   = new Array(inputcount)

    i = 0
    while i < inputcount
      @pointsList[i] = new ControlPoints()
      i++

    @base_value = 0

  set_n: (input, n) ->
    p = @pointsList[input]
    inputs_used++  if n isnt 0 and p.n is 0
    inputs_used--  if n is 0 and p.n isnt 0
    p.n = n

  set_point: (input, index, x, y) ->
    p = @pointsList[input]
    assert x >= p.xvalues[index - 1], " x must > p->xvalues[index-1]"  if index > 0
    p.xvalues[index] = x
    p.yvalues[index] = y

  is_constant: ->
    @inputs_used is 0

  calculate: (data) ->
    result = @base_value
    return result if @inputs_used is 0

    j = 0
    while j < @inputs
      p = @pointsList[j]
      if p.n
        y = undefined
        x = data[j]
        
        # find the segment with the slope that we need to use
        x0 = p.xvalues[0]
        y0 = p.yvalues[0]
        x1 = p.xvalues[1]
        y1 = p.yvalues[1]

        i = 2
        while i < p.n and x > x1
          x0 = x1
          y0 = y1
          x1 = p.xvalues[i]
          y1 = p.yvalues[i]
          i++

        if x0 is x1
          y = y0
        else # linear interpolation
          y = (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0)

        result += y

      j++

    result
  
module.exports = Mapping
