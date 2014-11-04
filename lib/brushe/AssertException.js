var AssertException;

AssertException = (function() {
  function AssertException(message) {
    this.message = message;
  }

  AssertException.prototype.toString = function() {
    return "AssertException: " + this.message;
  };

  return AssertException;

})();

module.exports = AssertException;
