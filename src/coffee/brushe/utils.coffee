AssertException = require("./AssertException")

utils =
  assert: (exp, message) ->
    throw new AssertException(message)  unless exp

  findPos: (obj) ->
    curleft = curtop = 0
    if obj.offsetParent
      curleft = obj.offsetLeft
      curtop  = obj.offsetTop

      while obj = obj.offsetParent
        curleft += obj.offsetLeft
        curtop += obj.offsetTop

    x: curleft
    y: curtop

module.exports = utils
