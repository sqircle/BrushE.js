ControlPoints = require("../lib/brushe/ControlPoints")

describe "ControlPoints", ->
  it "should create a new ControlPoints", ->
    controlPoints = new ControlPoints()
    controlPoints.xvalues.length.should.equal 8
    controlPoints.yvalues.length.should.equal 8
    controlPoints.n.should.equal 0
