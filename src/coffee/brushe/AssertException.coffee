class AssertException 
  constructor: (message) ->
    @message = message

  toString: ->
    "AssertException: " + @message

module.exports = AssertException
