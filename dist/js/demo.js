var brushE, colorChanged, selectBrush;

brushE = void 0;

colorChanged = function() {
  var color;
  color = new one.color($('#color').val());
  return brushE.brush.setSettings({
    color_h: {
      base_value: color.hue()
    },
    color_s: {
      base_value: color.saturation()
    },
    color_v: {
      base_value: color.value()
    }
  });
};

selectBrush = function() {
  var brushName, loadbrush, script;
  brushName = $('#brushselector').val();
  script = document.createElement('script');
  script.setAttribute('src', 'dist/brushes/' + brushName + '.myb.js');
  script.setAttribute('id', 'brushscript');
  document.documentElement.firstChild.appendChild(script);
  loadbrush = "brushE.setBrush(" + brushName + "); colorChanged();";
  return setTimeout(loadbrush, 1000);
};

$(document).ready(function() {
  var canvas;
  canvas = $('#paintCanvas')[0];
  brushE = new BrushE(canvas, charcoal);
  $('#color').change(colorChanged);
  return $('#brushselector').change(selectBrush);
});
