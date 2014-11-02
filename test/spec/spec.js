describe("ControlPoints", function() {
  return it("should create a new ControlPoints", function() {
    var controlPoints;
    controlPoints = new BrushE.ControlPoints();
    controlPoints.xvalues.length.should.equal(8);
    controlPoints.yvalues.length.should.equal(8);
    return controlPoints.n.should.equal(0);
  });
});
